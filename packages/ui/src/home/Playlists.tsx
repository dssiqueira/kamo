// Local playlists on Home: the chip row that filters the project list, the playlist header
// (rename, delete) and the "Add to playlist" checklist on a project card. Platform-agnostic:
// props and callbacks only; the desktop keeps them in `<projects>/playlists.json`.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING, IconButton } from '../primitives/controls.tsx'
import { PencilIcon, PlusIcon, TrashIcon } from '../primitives/icons.tsx'

/** Same limit main enforces (core MAX_PLAYLIST_NAME_LENGTH). */
export const MAX_PLAYLIST_NAME_LENGTH = 120

export interface PlaylistData {
  id: string
  name: string
  /** In playlist order; only projects that exist. */
  projectIds: readonly string[]
}

export interface PlaylistsProps {
  /** In creation order. */
  playlists: readonly PlaylistData[]
  /**
   * Trimmed name; `projectIds` are added right away (a card's "New playlist"). Resolves with
   * the new playlist's id (null when it failed), so the chip row can open it.
   */
  onCreate(name: string, projectIds: string[]): Promise<string | null>
  onRename(playlistId: string, name: string): void
  /** Called after the user confirmed. */
  onDelete(playlistId: string): void
  onAdd(playlistId: string, projectId: string): void
  onRemove(playlistId: string, projectId: string): void
  /** The playlist's projects in their new order. */
  onReorder(playlistId: string, projectIds: string[]): void
}

const POPOVER =
  'z-10 flex flex-col gap-sm rounded-lg border border-border bg-surface p-md shadow-[0_8px_24px_rgba(0,0,0,0.1)]'
const SMALL_BUTTON = `rounded-md bg-surface-raised px-md py-xs text-label ${FOCUS_RING}`

interface NameInputProps {
  initial?: string
  label: string
  /** The trimmed name, or null when cancelled (Esc, or left empty). */
  onDone(name: string | null, byKeyboard: boolean): void
  className?: string
}

/** One-line name field: Enter saves, Esc cancels, leaving it saves (empty cancels). */
function NameInput({ initial = '', label, onDone, className = '' }: NameInputProps) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const finish = (name: string | null, byKeyboard: boolean) => {
    if (done.current) return
    done.current = true
    const trimmed = name?.trim()
    onDone(trimmed ? trimmed : null, byKeyboard)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(value, true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(null, true)
    }
  }

  return (
    <input
      ref={input}
      type="text"
      value={value}
      maxLength={MAX_PLAYLIST_NAME_LENGTH}
      aria-label={label}
      placeholder={label}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value, false)}
      className={`rounded-md border border-tertiary bg-background px-sm py-xs text-label ${FOCUS_RING} ${className}`}
    />
  )
}

/** Pill chip (DESIGN.md → chip-selected): water when selected, outlined otherwise. */
const chipClass = (selected: boolean) =>
  `flex max-w-[240px] items-center gap-xs rounded-full border px-[12px] py-xs text-label transition-colors duration-[120ms] ${FOCUS_RING} ${
    selected
      ? 'border-tertiary-container bg-tertiary-container text-on-surface'
      : 'border-border bg-surface text-on-surface-muted hover:border-tertiary-container hover:text-on-surface'
  }`

export interface PlaylistBarProps {
  playlists: readonly PlaylistData[]
  /** null: All. */
  selectedId: string | null
  onSelect(playlistId: string | null): void
  onCreate(name: string): void
  /** Projects in "All", for its count. */
  total: number
}

/** All · each playlist · New playlist. Toggle buttons (aria-pressed) filtering the list. */
export function PlaylistBar({
  playlists,
  selectedId,
  onSelect,
  onCreate,
  total,
}: PlaylistBarProps) {
  const t = useT()
  const [creating, setCreating] = useState(false)
  const newButton = useRef<HTMLButtonElement>(null)

  return (
    <div
      role="group"
      aria-label={t('playlists.label')}
      className="flex flex-wrap items-center gap-sm"
    >
      <button
        type="button"
        aria-pressed={selectedId === null}
        onClick={() => onSelect(null)}
        className={chipClass(selectedId === null)}
      >
        {t('playlists.all')}
        <span className="text-on-surface-muted">{total}</span>
      </button>
      {playlists.map((playlist) => (
        <button
          key={playlist.id}
          type="button"
          aria-pressed={selectedId === playlist.id}
          onClick={() => onSelect(playlist.id)}
          title={playlist.name}
          className={chipClass(selectedId === playlist.id)}
        >
          <span className="truncate">{playlist.name}</span>
          <span className="text-on-surface-muted">{playlist.projectIds.length}</span>
        </button>
      ))}
      {creating ? (
        <NameInput
          label={t('playlists.nameLabel')}
          className="w-[200px] rounded-full"
          onDone={(name, byKeyboard) => {
            setCreating(false)
            if (name) onCreate(name)
            else if (byKeyboard) requestAnimationFrame(() => newButton.current?.focus())
          }}
        />
      ) : (
        <button
          ref={newButton}
          type="button"
          onClick={() => setCreating(true)}
          className={`${chipClass(false)} border-dashed`}
        >
          <PlusIcon />
          {t('playlists.new')}
        </button>
      )}
    </div>
  )
}

export interface PlaylistHeaderProps {
  playlist: PlaylistData
  onRename(name: string): void
  onDelete(): void
}

/** The selected playlist's title, with rename and delete (confirmed). */
export function PlaylistHeader({ playlist, onRename, onDelete }: PlaylistHeaderProps) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const renameButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative flex flex-col gap-xs">
      <div className="flex items-center gap-xs">
        {editing ? (
          <NameInput
            initial={playlist.name}
            label={t('playlists.nameLabel')}
            className="min-w-[240px] text-title"
            onDone={(name, byKeyboard) => {
              setEditing(false)
              if (name && name !== playlist.name) onRename(name)
              if (byKeyboard) requestAnimationFrame(() => renameButton.current?.focus())
            }}
          />
        ) : (
          <h2
            id="projects-title"
            className="truncate text-title"
            title={playlist.name}
            onDoubleClick={() => setEditing(true)}
          >
            {playlist.name}
          </h2>
        )}
        <span className="shrink-0 text-label text-on-surface-muted">
          {t('playlists.count', { count: playlist.projectIds.length })}
        </span>
        <IconButton
          label={t('playlists.rename')}
          buttonRef={renameButton}
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </IconButton>
        <IconButton
          label={t('playlists.delete')}
          tone="danger"
          buttonRef={deleteButton}
          expanded={confirming}
          onClick={() => setConfirming(true)}
        >
          <TrashIcon />
        </IconButton>
      </div>
      {playlist.projectIds.length > 1 && (
        <p className="text-label text-on-surface-muted">{t('playlists.reorderHint')}</p>
      )}
      {confirming && (
        <ConfirmPlaylistDelete
          name={playlist.name}
          onCancel={() => {
            setConfirming(false)
            deleteButton.current?.focus()
          }}
          onConfirm={() => {
            setConfirming(false)
            onDelete()
          }}
        />
      )}
    </div>
  )
}

function ConfirmPlaylistDelete({
  name,
  onCancel,
  onConfirm,
}: {
  name: string
  onCancel(): void
  onConfirm(): void
}) {
  const t = useT()
  const cancel = useRef<HTMLButtonElement>(null)
  const textId = useId()
  useEffect(() => cancel.current?.focus(), [])
  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={textId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
      className={`absolute start-0 top-full mt-xs w-[360px] max-w-full ${POPOVER}`}
    >
      <p id={textId} className="text-body">
        {t('playlists.deleteConfirm', { name })}
      </p>
      <div className="flex flex-wrap justify-end gap-sm">
        <button ref={cancel} type="button" onClick={onCancel} className={SMALL_BUTTON}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={onConfirm} className={`${SMALL_BUTTON} text-error`}>
          {t('playlists.deleteAction')}
        </button>
      </div>
    </div>
  )
}

export interface AddToPlaylistMenuProps {
  projectName: string
  projectId: string
  playlists: readonly PlaylistData[]
  onAdd(playlistId: string): void
  onRemove(playlistId: string): void
  onCreate(name: string): void
  /** `byKeyboard`: Esc, so focus goes back to the button; a click outside keeps its own focus. */
  onClose(byKeyboard: boolean): void
  /** The button that opened it: clicks on it do not count as "outside". */
  anchor: RefObject<HTMLElement | null>
}

/**
 * Checklist popover on a project card: one checkbox per playlist plus a "New playlist" field.
 * Esc or a click outside closes it; the caller puts focus back on its button.
 */
export function AddToPlaylistMenu({
  projectName,
  projectId,
  playlists,
  onAdd,
  onRemove,
  onCreate,
  onClose,
  anchor,
}: AddToPlaylistMenuProps) {
  const t = useT()
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const [creating, setCreating] = useState(false)
  const newButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // The first checkbox (or the New playlist button when there is none).
    root.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (root.current?.contains(target) || anchor.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [anchor, onClose])

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose(true)
        }
      }}
      className={`absolute inset-x-sm bottom-sm max-h-[calc(100%-16px)] overflow-y-auto ${POPOVER}`}
    >
      <p id={titleId} className="truncate text-label text-on-surface-muted" title={projectName}>
        {t('playlists.menuTitle', { name: projectName })}
      </p>
      {playlists.length === 0 && !creating && (
        <p className="text-body text-on-surface-muted">{t('playlists.none')}</p>
      )}
      {playlists.length > 0 && (
        <ul className="flex flex-col">
          {playlists.map((playlist) => {
            const checked = playlist.projectIds.includes(projectId)
            return (
              <li key={playlist.id}>
                <label className="flex cursor-pointer items-center gap-sm rounded-md px-xs py-xs text-body hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => (checked ? onRemove(playlist.id) : onAdd(playlist.id))}
                    className={`size-[16px] shrink-0 accent-tertiary ${FOCUS_RING}`}
                  />
                  <span className="truncate" title={playlist.name}>
                    {playlist.name}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {creating ? (
        <NameInput
          label={t('playlists.nameLabel')}
          onDone={(name, byKeyboard) => {
            setCreating(false)
            if (name) onCreate(name)
            if (byKeyboard) requestAnimationFrame(() => newButton.current?.focus())
          }}
        />
      ) : (
        <button
          ref={newButton}
          type="button"
          onClick={() => setCreating(true)}
          className={`flex items-center gap-xs self-start rounded-md px-xs py-xs text-label text-tertiary-strong hover:bg-surface-raised ${FOCUS_RING}`}
        >
          <PlusIcon />
          {t('playlists.new')}
        </button>
      )}
    </div>
  )
}
