import {
  buildScene,
  projectAspect,
  type Aspect,
  type MouseEventRecord,
  type Project,
  type Zoom,
} from '@kamo/core'
import { useEffect, useId, useMemo, useState } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { DecorPiece } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { FormatPreview } from './FormatPreview.tsx'
import {
  EXPORT_FPS,
  EXPORT_RESOLUTION,
  useExportRun,
  type ExportJob,
  type ExportPlatform,
} from './useExportRun.ts'

export interface ExportSheetProps {
  project: Project
  events: readonly MouseEventRecord[]
  /** zooms with the auto-zoom toggle applied, for the previews */
  zooms: readonly Zoom[]
  autoZoom: boolean
  /** the editor's video element, parked on the current frame */
  video: HTMLVideoElement | null
  /** the editor's webcam element, parked on the matching frame (A-03) */
  webcamVideo?: HTMLVideoElement | null
  timeMs: number
  platform: ExportPlatform
  onClose(): void
}

/** F-11 formats plus the vertical 9:16 (A-02). */
const ASPECTS: readonly Aspect[] = ['16:9', '1:1', '9:16']
const PREVIEW_HEIGHT = 144
const PREVIEW_SIZE: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: Math.round((PREVIEW_HEIGHT * 16) / 9), height: PREVIEW_HEIGHT },
  '1:1': { width: PREVIEW_HEIGHT, height: PREVIEW_HEIGHT },
  '9:16': { width: Math.round((PREVIEW_HEIGHT * 9) / 16), height: PREVIEW_HEIGHT },
}
const ASPECT_LABEL: Record<Aspect, string> = {
  '16:9': 'export.aspect.landscape',
  '1:1': 'export.aspect.square',
  '9:16': 'export.aspect.vertical',
}

const BUTTON_PRIMARY = `rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 disabled:hover:bg-primary ${FOCUS_RING}`
const BUTTON_SECONDARY = `rounded-md bg-surface-raised px-md py-[10px] text-title text-on-surface transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`

/**
 * Export → Formats (flows.md §6): the formats side by side with a live preview of the
 * current frame, one checkbox each, then the files exported in sequence with a progress
 * bar each, and Kamo smiling at the end. Everything is free: the formats that are not
 * built yet just say so, with no lock or plan badge.
 */
export function ExportSheet({
  project,
  events,
  zooms,
  autoZoom,
  video,
  webcamVideo = null,
  timeMs,
  platform,
  onClose,
}: ExportSheetProps) {
  const t = useT()
  const titleId = useId()
  // The editor's format comes pre-checked (A-02).
  const [checked, setChecked] = useState<Record<Aspect, boolean>>(() => ({
    '16:9': false,
    '1:1': false,
    '9:16': false,
    [projectAspect(project)]: true,
  }))
  const [folder, setFolder] = useState<string | null>(null)
  const { state, start, retry, cancel, reset } = useExportRun({
    project,
    events,
    autoZoom,
    platform,
  })
  const scene = useMemo(() => buildScene({ project, events, zooms }), [project, events, zooms])
  const selected = ASPECTS.filter((aspect) => checked[aspect])
  const exporting = state.phase === 'exporting'

  useEffect(() => {
    let live = true
    void platform.getFolder?.().then((path) => live && setFolder(path))
    return () => {
      live = false
    }
  }, [platform])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exporting, onClose])

  const changeFolder = async () => {
    const next = await platform.chooseFolder?.()
    if (next) setFolder(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(43_42_38/0.32)] p-lg">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="export-sheet"
        data-phase={state.phase}
        className="flex max-h-full w-full max-w-[760px] flex-col gap-lg overflow-y-auto rounded-lg border border-border bg-surface p-lg font-sans text-on-surface shadow-[0_8px_24px_rgb(43_42_38/0.1)]"
      >
        <h2 id={titleId} className="font-serif text-headline">
          {t('export.title')}
        </h2>

        {state.phase === 'configuring' && (
          <>
            <fieldset className="flex flex-col gap-sm">
              <legend className="mb-sm text-title">{t('export.formats')}</legend>
              <div className="flex flex-wrap items-start gap-md">
                {ASPECTS.map((aspect) => (
                  <label
                    key={aspect}
                    className={`flex cursor-pointer flex-col gap-sm rounded-md border-2 p-sm transition-colors duration-[120ms] ${
                      checked[aspect]
                        ? 'border-tertiary bg-tertiary-container/40'
                        : 'border-border hover:bg-surface-raised'
                    }`}
                  >
                    <FormatPreview
                      scene={scene}
                      aspect={aspect}
                      video={video}
                      webcamVideo={webcamVideo}
                      timeMs={timeMs}
                      {...PREVIEW_SIZE[aspect]}
                    />
                    <span
                      className="flex flex-wrap items-center gap-x-sm text-body"
                      style={{ maxWidth: PREVIEW_SIZE[aspect].width }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`export-format-${aspect}`}
                        checked={checked[aspect]}
                        onChange={(e) => setChecked({ ...checked, [aspect]: e.target.checked })}
                        className={`size-[16px] accent-tertiary ${FOCUS_RING}`}
                      />
                      <span className="font-medium">{aspect}</span>
                      <span className="text-on-surface-muted">{t(ASPECT_LABEL[aspect])}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-md gap-y-sm text-body">
              <dt className="text-on-surface-muted">{t('export.resolution')}</dt>
              <dd className="flex flex-wrap gap-xs">
                <Chip selected>{EXPORT_RESOLUTION}</Chip>
                <Chip>4K</Chip>
              </dd>
              <dt className="text-on-surface-muted">{t('export.frameRate')}</dt>
              <dd className="flex flex-wrap gap-xs">
                <Chip selected>{t('export.fps', { fps: EXPORT_FPS })}</Chip>
                <Chip>{t('export.fps', { fps: 60 })}</Chip>
              </dd>
              <dt className="text-on-surface-muted">{t('export.fileFormat')}</dt>
              <dd className="flex flex-wrap gap-xs">
                <Chip selected>MP4</Chip>
                <Chip>GIF</Chip>
              </dd>
            </dl>
            <p className="-mt-sm text-label text-on-surface-muted">{t('export.laterNote')}</p>

            {folder !== null && (
              <p className="flex min-w-0 items-center gap-sm text-body">
                <span className="shrink-0 text-on-surface-muted">{t('export.folder')}</span>
                <span className="min-w-0 truncate" title={folder}>
                  {folder}
                </span>
                {platform.chooseFolder && (
                  <button
                    type="button"
                    onClick={() => void changeFolder()}
                    className={`shrink-0 rounded-sm text-body text-tertiary-strong underline-offset-2 hover:underline ${FOCUS_RING}`}
                  >
                    {t('export.changeFolder')}
                  </button>
                )}
              </p>
            )}

            <footer className="flex items-center justify-end gap-sm">
              {selected.length === 0 && (
                <p className="me-auto text-body text-on-surface-muted">{t('export.pickOne')}</p>
              )}
              <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
                {t('export.cancel')}
              </button>
              <button
                type="button"
                data-testid="export-start"
                disabled={selected.length === 0}
                onClick={() => start(selected)}
                className={BUTTON_PRIMARY}
              >
                {t('export.start', { count: selected.length })}
              </button>
            </footer>
          </>
        )}

        {state.phase !== 'configuring' && (
          <>
            {state.phase === 'done' && (
              <div className="flex items-center gap-md" role="status">
                {/* DESIGN.md → Mascot: the export-complete screen shows Kamo smiling. */}
                <div className="flex items-end">
                  <Mascot pose="head-happy" size={72} />
                  <DecorPiece art="flower" height={40} className="-ms-[10px]" />
                </div>
                <div className="flex flex-col gap-xs">
                  <p className="text-title" data-testid="export-done">
                    {t('export.done.title', {
                      count: state.jobs.filter((j) => j.status === 'done').length,
                    })}
                  </p>
                  <p className="text-body text-on-surface-muted">{t('export.done.subtitle')}</p>
                </div>
              </div>
            )}
            {state.phase === 'error' && (
              <div role="alert" className="flex flex-col gap-xs rounded-md bg-surface-raised p-md">
                <p className="text-title text-error">{t('export.errors.title')}</p>
                <p className="text-body" data-testid="export-error" data-code={state.code}>
                  {t(`export.errors.${state.code}`)}
                </p>
              </div>
            )}

            <ul className="flex flex-col gap-md" aria-label={t('export.formats')}>
              {state.jobs.map((job) => (
                <JobRow key={job.aspect} job={job} />
              ))}
            </ul>

            {state.phase === 'done' && state.warnings.length > 0 && (
              <ul className="flex flex-col gap-xs rounded-md bg-surface-raised p-md text-body text-warning">
                {state.warnings.map((warning) => (
                  <li key={warning}>{t(`export.warnings.${warning}`)}</li>
                ))}
              </ul>
            )}

            <footer className="flex items-center justify-end gap-sm">
              {state.phase === 'exporting' && (
                <button
                  type="button"
                  data-testid="export-cancel"
                  onClick={cancel}
                  className={BUTTON_SECONDARY}
                >
                  {t('export.cancelExport')}
                </button>
              )}
              {state.phase === 'done' && (
                <>
                  <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
                    {t('export.close')}
                  </button>
                  {platform.showInFolder && (
                    <button
                      type="button"
                      data-testid="export-show"
                      onClick={() => {
                        const last = state.jobs.findLast((j) => j.path)
                        if (last?.path) platform.showInFolder?.(last.path)
                      }}
                      className={BUTTON_PRIMARY}
                    >
                      {t('export.showInFolder')}
                    </button>
                  )}
                </>
              )}
              {state.phase === 'error' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      reset()
                      onClose()
                    }}
                    className={BUTTON_SECONDARY}
                  >
                    {t('export.close')}
                  </button>
                  <button type="button" onClick={retry} className={BUTTON_PRIMARY}>
                    {t('export.retry')}
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function JobRow({ job }: { job: ExportJob }) {
  const t = useT()
  const locale = useLocale()
  const percent = new Intl.NumberFormat(locale, { style: 'percent' }).format(job.progress)
  const label = job.name ?? `${job.aspect} ${t(ASPECT_LABEL[job.aspect])}`
  return (
    <li className="flex flex-col gap-xs" data-testid={`export-job-${job.aspect}`}>
      <div className="flex items-baseline justify-between gap-md text-body">
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
        <span className="shrink-0 font-mono text-timecode tabular-nums text-on-surface-muted">
          {job.status === 'waiting' ? t('export.waiting') : percent}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress * 100)}
        className="h-[8px] overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={`h-full rounded-full ${job.status === 'done' ? 'bg-primary-strong' : 'bg-tertiary'}`}
          style={{ width: `${job.progress * 100}%` }}
        />
      </div>
    </li>
  )
}

/** Read-only option chip (chip-selected); unselected ones are what arrives in v0.4. */
function Chip({ selected = false, children }: { selected?: boolean; children: string }) {
  return (
    <span
      aria-disabled={!selected}
      className={`rounded-full px-[12px] py-xs text-label ${
        selected ? 'bg-tertiary-container text-on-surface' : 'text-on-surface-muted'
      }`}
    >
      {children}
    </span>
  )
}
