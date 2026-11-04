import { formatDate, formatDuration, resolveLocale } from '@kamo/i18n'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { DecorPiece } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { IconButton } from '../primitives/controls.tsx'
import { FolderIcon, PencilIcon, TrashIcon } from '../primitives/icons.tsx'

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
}: ProjectListProps) {
  const t = useT()
  if (projects === null) return null

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
      <h2 id="projects-title" className="text-title">
        {t('projects.title')}
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-md">
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectCard
              project={project}
              onOpen={() => onOpen(project.id)}
              onRename={(name) => onRename(project.id, name)}
              onDelete={() => onDelete(project.id)}
              onShowInFolder={() => onShowInFolder(project.id)}
            />
          </li>
        ))}
        {broken.map((project) => (
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
}

function ProjectCard({ project, onOpen, onRename, onDelete, onShowInFolder }: ProjectCardProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const renameButton = useRef<HTMLButtonElement>(null)

  const finishEditing = (name: string | null, byKeyboard: boolean) => {
    setEditing(false)
    const trimmed = name?.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    // Enter/Esc keep the keyboard user in place; a click elsewhere keeps its own focus.
    if (byKeyboard) renameButton.current?.focus()
  }

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

      <div className="flex items-start gap-xs">
        <div className="flex min-w-0 flex-1 flex-col gap-xs px-xs">
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
          <p className="flex flex-wrap gap-x-sm text-label text-on-surface-muted">
            <span>{formatDuration(locale, project.durationMs)}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={project.createdAt}>
              {formatDate(locale, new Date(project.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </p>
        </div>
        <div className="flex shrink-0">
          <IconButton
            label={t('projects.rename')}
            buttonRef={renameButton}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </IconButton>
          <IconButton label={t('common.showInFolder')} onClick={onShowInFolder}>
            <FolderIcon />
          </IconButton>
          <IconButton
            label={t('projects.delete')}
            tone="danger"
            buttonRef={deleteButton}
            expanded={confirming}
            onClick={() => setConfirming(true)}
          >
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      {confirming && (
        <ConfirmDelete
          name={project.name}
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
