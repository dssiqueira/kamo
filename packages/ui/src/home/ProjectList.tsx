import { formatDate, formatDuration, resolveLocale } from '@kamo/i18n'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { DecorPiece } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { IconButton } from '../primitives/controls.tsx'
import { MenuButton, type MenuItem } from '../primitives/Menu.tsx'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FolderIcon,
  MinusCircleIcon,
  MoreIcon,
  PencilIcon,
  PlaylistAddIcon,
  TrashIcon,
} from '../primitives/icons.tsx'
import {
  AddToPlaylistMenu,
  PlaylistBar,
  PlaylistHeader,
  type PlaylistData,
  type PlaylistsProps,
} from './Playlists.tsx'
import { TranscribeButton, TranscriptStatus } from '../packs/CardTranscription.tsx'
import type { CardTranscriptState } from '../packs/types.ts'

/** Max project name length, the same limit main enforces (F-12). */
export const MAX_PROJECT_NAME_LENGTH = 120

export interface ProjectCardData {
  id: string
  name: string
  /** ISO 8601. */
  createdAt: string
  durationMs: number
  /** Image URL of the first reference frame, or null for the neutral placeholder. */
  thumbnailUrl: string | null
  /** Local transcription (A-05); shown only with `transcription` on the list. */
  transcript?: CardTranscriptState
}

export interface BrokenProjectData {
  projectId: string
  /** `invalid_json`, `invalid_project` or `newer_version` (core ProjectError codes). */
  code: string
  /** Whether the raw video is still there to open. */
  hasVideo: boolean
}

export interface ProjectListProps {
  /** Newest first. `null` while loading (nothing is shown, so the list does not flash). */
  projects: readonly ProjectCardData[] | null
  broken?: readonly BrokenProjectData[]
  onOpen(projectId: string): void
  /** Called with the trimmed new name, only when it changed. */
  onRename(projectId: string, name: string): void
  /** Called after the user confirmed. */
  onDelete(projectId: string): void
  onShowInFolder(projectId: string): void
  /** Corrupted project.json: open only the raw video and recreate the edit (F-12). */
  onOpenRawVideo(projectId: string): void
  /** Local playlists: chips above the list and "Add to playlist" on cards. Omitted: none. */
  playlists?: PlaylistsProps
  /**
   * The playlist shown (null: All). With it, the caller keeps the choice (e.g. across the
   * editor and restarts); without it, the list keeps it while it is on screen.
   */
  selectedPlaylistId?: string | null
  onSelectPlaylist?(playlistId: string | null): void
  /** Local transcription (A-05): "Transcribe" on each card. Omitted: no button. */
  transcription?: {
    onTranscribe(projectId: string): void
    onCancel(projectId: string): void
  }
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary'
const ACTION_BUTTON = `rounded-md px-sm py-xs text-label text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface-raised hover:text-on-surface ${FOCUS_RING}`

/** Recent projects on Home (flows.md §2, F-12). Platform-agnostic: props and callbacks only. */
export function ProjectList({
  projects,
  broken = [],
  onOpen,
  onRename,
  onDelete,
  onShowInFolder,
  onOpenRawVideo,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  transcription,
}: ProjectListProps) {
  const t = useT()
  const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null)
  const selectedId = selectedPlaylistId === undefined ? ownSelectedId : selectedPlaylistId
  const setSelectedId = (playlistId: string | null) => {
    setOwnSelectedId(playlistId)
    onSelectPlaylist?.(playlistId)
  }
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Read by the drag events before React re-renders, so a ref and not only the state.
  const dragged = useRef<string | null>(null)
  if (projects === null) return null

  // A playlist deleted (here or elsewhere) falls back to All.
  const selected = playlists?.playlists.find((p) => p.id === selectedId) ?? null
  const byId = new Map(projects.map((project) => [project.id, project]))
  const shown = selected
    ? selected.projectIds.flatMap((id) => {
        const project = byId.get(id)
        return project ? [project] : []
      })
    : projects
  const order = shown.map((project) => project.id)

  /** New order with `id` moved to where `target` is (drag and drop, or the arrows). */
  const moveTo = (id: string, targetIndex: number) => {
    if (!selected || !playlists) return
    const from = order.indexOf(id)
    const to = Math.max(0, Math.min(order.length - 1, targetIndex))
    if (from < 0 || from === to) return
    const next = order.slice()
    next.splice(from, 1)
    next.splice(to, 0, id)
    playlists.onReorder(selected.id, next)
  }

  if (projects.length === 0 && broken.length === 0) {
    // DESIGN.md: Kamo shows up in empty states.
    return (
      <div className="flex items-center gap-lg py-md">
        <div className="flex items-end">
          <DecorPiece art="sprig" height={130} className="-me-[18px]" />
          <Mascot pose="front" size={140} backdrop />
          <DecorPiece art="flower" height={58} className="-ms-[14px]" />
        </div>
        <p className="max-w-[360px] font-serif text-headline text-on-surface-muted">
          {t('projects.empty')}
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-md" aria-labelledby="projects-title">
      {playlists && (
        <PlaylistBar
          playlists={playlists.playlists}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onCreate={(name) =>
            void playlists.onCreate(name, []).then((id) => id && setSelectedId(id))
          }
          total={projects.length}
        />
      )}
      {selected && playlists ? (
        <PlaylistHeader
          playlist={selected}
          onRename={(name) => playlists.onRename(selected.id, name)}
          onDelete={() => {
            setSelectedId(null)
            playlists.onDelete(selected.id)
          }}
        />
      ) : (
        <h2 id="projects-title" className="text-title">
          {t('projects.title')}
        </h2>
      )}
      {selected && shown.length === 0 && (
        <p className="max-w-[480px] text-body text-on-surface-muted">{t('playlists.empty')}</p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-md">
        {shown.map((project, index) => (
          <li
            key={project.id}
            // Inside a playlist the cards can be dragged to a new place (the arrows do the same).
            {...(selected
              ? {
                  draggable: true,
                  onDragStart: (event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', project.id)
                    dragged.current = project.id
                    setDragging(project.id)
                  },
                  onDragOver: (event) => {
                    if (!dragged.current) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTarget(project.id)
                  },
                  onDrop: (event) => {
                    event.preventDefault()
                    if (dragged.current) moveTo(dragged.current, index)
                    dragged.current = null
                    setDragging(null)
                    setDropTarget(null)
                  },
                  onDragEnd: () => {
                    dragged.current = null
                    setDragging(null)
                    setDropTarget(null)
                  },
                }
              : {})}
            className={`rounded-lg ${dragging === project.id ? 'opacity-50' : ''} ${
              dropTarget === project.id && dragging !== project.id
                ? 'outline-2 outline-offset-2 outline-tertiary'
                : ''
            }`}
          >
            <ProjectCard
              project={project}
              onOpen={() => onOpen(project.id)}
              onRename={(name) => onRename(project.id, name)}
              onDelete={() => onDelete(project.id)}
              onShowInFolder={() => onShowInFolder(project.id)}
              {...(transcription
                ? {
                    transcription: {
                      onTranscribe: () => transcription.onTranscribe(project.id),
                      onCancel: () => transcription.onCancel(project.id),
                    },
                  }
                : {})}
              {...(playlists
                ? {
                    playlists: {
                      playlists: playlists.playlists,
                      onAdd: (playlistId) => playlists.onAdd(playlistId, project.id),
                      onRemove: (playlistId) => playlists.onRemove(playlistId, project.id),
                      onCreate: (name) => void playlists.onCreate(name, [project.id]),
                    },
                  }
                : {})}
              {...(selected && playlists
                ? {
                    inPlaylist: {
                      name: selected.name,
                      ...(index > 0 ? { onMoveUp: () => moveTo(project.id, index - 1) } : {}),
                      ...(index < shown.length - 1
                        ? { onMoveDown: () => moveTo(project.id, index + 1) }
                        : {}),
                      onRemove: () => playlists.onRemove(selected.id, project.id),
                    },
                  }
                : {})}
            />
          </li>
        ))}
        {!selected &&
          broken.map((project) => (
            <li key={project.projectId}>
              <BrokenProjectCard
                project={project}
                onShowInFolder={() => onShowInFolder(project.projectId)}
                onOpenRawVideo={() => onOpenRawVideo(project.projectId)}
              />
            </li>
          ))}
      </ul>
    </section>
  )
}

function Thumbnail({ url }: { url: string | null }) {
  return (
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-surface-raised">
      {url && (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          draggable={false}
        />
      )}
    </div>
  )
}

interface ProjectCardProps {
  project: ProjectCardData
  onOpen(): void
  onRename(name: string): void
  onDelete(): void
  onShowInFolder(): void
  transcription?: { onTranscribe(): void; onCancel(): void }
  /** "Add to playlist" checklist. Omitted: no button. */
  playlists?: {
    playlists: readonly PlaylistData[]
    onAdd(playlistId: string): void
    onRemove(playlistId: string): void
    onCreate(name: string): void
  }
  /** Shown inside a playlist: reorder with the arrows and remove from it. */
  inPlaylist?: {
    name: string
    onMoveUp?(): void
    onMoveDown?(): void
    onRemove(): void
  }
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
  onShowInFolder,
  transcription,
  playlists,
  inPlaylist,
}: ProjectCardProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [choosingPlaylists, setChoosingPlaylists] = useState(false)
  // Rename, Add to playlist, Show in folder and Delete live in the "More actions" menu; focus
  // goes back to its button when their field or popover closes from the keyboard.
  const moreButton = useRef<HTMLButtonElement>(null)
  const closePlaylists = useCallback((byKeyboard: boolean) => {
    setChoosingPlaylists(false)
    if (byKeyboard) moreButton.current?.focus()
  }, [])

  const finishEditing = (name: string | null, byKeyboard: boolean) => {
    setEditing(false)
    const trimmed = name?.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    // Enter/Esc keep the keyboard user in place; a click elsewhere keeps its own focus.
    if (byKeyboard) moreButton.current?.focus()
  }

  const menuItems: MenuItem[] = [
    {
      id: 'rename',
      label: t('projects.rename'),
      icon: <PencilIcon />,
      onSelect: () => setEditing(true),
    },
    ...(playlists
      ? [
          {
            id: 'playlists',
            label: t('playlists.addTo'),
            icon: <PlaylistAddIcon />,
            onSelect: () => setChoosingPlaylists(true),
          },
        ]
      : []),
    {
      id: 'folder',
      label: t('common.showInFolder'),
      icon: <FolderIcon />,
      onSelect: onShowInFolder,
    },
    {
      id: 'delete',
      label: t('projects.delete'),
      icon: <TrashIcon />,
      tone: 'danger',
      onSelect: () => setConfirming(true),
    },
  ]

  return (
    <article className="relative flex flex-col gap-sm rounded-lg border border-border bg-surface p-sm">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('projects.openNamed', { name: project.name })}
        title={t('projects.open')}
        className={`group rounded-md ${FOCUS_RING}`}
      >
        <Thumbnail url={project.thumbnailUrl} />
      </button>

      <div className="flex flex-col gap-xs">
        {/* Name and the two actions on one line; the date gets the card's whole width below. */}
        <div className="flex items-center gap-xs">
          <div className="min-w-0 flex-1 px-xs">
            {editing ? (
              <NameEditor initial={project.name} onDone={finishEditing} />
            ) : (
              <h3
                className="truncate text-title"
                title={project.name}
                onDoubleClick={() => setEditing(true)}
              >
                {project.name}
              </h3>
            )}
          </div>
          <div className="flex shrink-0">
            {transcription && (
              <TranscribeButton
                transcript={project.transcript ?? { state: 'none' }}
                onTranscribe={transcription.onTranscribe}
                onCancel={transcription.onCancel}
              />
            )}
            <MenuButton
              label={t('projects.moreNamed', { name: project.name })}
              title={t('projects.more')}
              icon={<MoreIcon />}
              items={menuItems}
              buttonRef={moreButton}
            />
          </div>
        </div>
        <p className="flex flex-wrap gap-x-sm px-xs text-label text-on-surface-muted">
          <span className="whitespace-nowrap">{formatDuration(locale, project.durationMs)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={project.createdAt} className="whitespace-nowrap">
            {formatDate(locale, new Date(project.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
        {transcription && project.transcript && (
          <div className="px-xs">
            <TranscriptStatus transcript={project.transcript} />
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDelete
          name={project.name}
          onCancel={() => {
            setConfirming(false)
            moreButton.current?.focus()
          }}
          onConfirm={() => {
            setConfirming(false)
            onDelete()
          }}
        />
      )}

      {inPlaylist && (
        <div className="flex items-center gap-xs border-t border-border pt-xs">
          {inPlaylist.onMoveUp && (
            <IconButton label={t('playlists.moveUp')} onClick={inPlaylist.onMoveUp}>
              <ArrowUpIcon />
            </IconButton>
          )}
          {inPlaylist.onMoveDown && (
            <IconButton label={t('playlists.moveDown')} onClick={inPlaylist.onMoveDown}>
              <ArrowDownIcon />
            </IconButton>
          )}
          <button
            type="button"
            onClick={inPlaylist.onRemove}
            className={`ms-auto flex items-center gap-xs ${ACTION_BUTTON}`}
          >
            <MinusCircleIcon />
            {t('playlists.remove')}
          </button>
        </div>
      )}

      {choosingPlaylists && playlists && (
        <AddToPlaylistMenu
          projectName={project.name}
          projectId={project.id}
          playlists={playlists.playlists}
          onAdd={playlists.onAdd}
          onRemove={playlists.onRemove}
          onCreate={playlists.onCreate}
          onClose={closePlaylists}
          anchor={moreButton}
        />
      )}
    </article>
  )
}

interface NameEditorProps {
  initial: string
  /** The typed name (Enter or leaving the field), or null when cancelled (Esc). */
  onDone(name: string | null, byKeyboard: boolean): void
}

/** Inline rename: Enter saves, Esc cancels, clicking elsewhere saves. */
function NameEditor({ initial, onDone }: NameEditorProps) {
  const t = useT()
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
    onDone(name, byKeyboard)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(value, true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(null, true)
    }
  }

  return (
    <input
      ref={input}
      type="text"
      value={value}
      maxLength={MAX_PROJECT_NAME_LENGTH}
      aria-label={t('projects.nameLabel')}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value, false)}
      className={`w-full rounded-md border border-tertiary bg-background px-xs text-title ${FOCUS_RING}`}
    />
  )
}

interface ConfirmDeleteProps {
  name: string
  onCancel(): void
  onConfirm(): void
}

/** Small popover over the card (DESIGN.md: floating element, soft shadow, 200ms). */
function ConfirmDelete({ name, onCancel, onConfirm }: ConfirmDeleteProps) {
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
      className="absolute inset-x-sm bottom-sm z-10 flex flex-col gap-sm rounded-lg border border-border bg-surface p-md shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
    >
      <p id={textId} className="text-body">
        {t('projects.deleteConfirm', { name })}
      </p>
      <div className="flex flex-wrap justify-end gap-sm">
        <button
          ref={cancel}
          type="button"
          onClick={onCancel}
          className={`rounded-md bg-surface-raised px-md py-xs text-label ${FOCUS_RING}`}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md bg-surface-raised px-md py-xs text-label text-error ${FOCUS_RING}`}
        >
          {t('projects.moveToTrash')}
        </button>
      </div>
    </div>
  )
}

interface BrokenProjectCardProps {
  project: BrokenProjectData
  onShowInFolder(): void
  onOpenRawVideo(): void
}

function BrokenProjectCard({ project, onShowInFolder, onOpenRawVideo }: BrokenProjectCardProps) {
  const t = useT()
  const newer = project.code === 'newer_version'
  return (
    <article className="flex flex-col gap-sm rounded-lg border border-border bg-surface p-sm">
      <Thumbnail url={null} />
      <h3 className="px-xs text-title">{t('projects.broken.title')}</h3>
      <p role="note" className="px-xs text-label text-warning">
        {t(newer ? 'projects.broken.newerVersion' : 'projects.broken.unreadable')}
      </p>
      <div className="flex flex-wrap gap-xs">
        {project.hasVideo && !newer && (
          <button type="button" onClick={onOpenRawVideo} className={ACTION_BUTTON}>
            {t('projects.broken.openRawVideo')}
          </button>
        )}
        <button type="button" onClick={onShowInFolder} className={ACTION_BUTTON}>
          {t('common.showInFolder')}
        </button>
      </div>
    </article>
  )
}
