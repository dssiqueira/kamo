import {
  buildCaptionTrack,
  buildScene,
  projectAspect,
  projectCaptions,
  type Aspect,
  type BackgroundImage,
  type MouseEventRecord,
  type Project,
  type Transcript,
  type Zoom,
} from '@kamo/core'
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import {
  canExport4k,
  estimateGifBytes,
  GIF_FPS_CHOICES,
  GIF_LARGE_BYTES,
  gifSize,
  resolveVideoSettings,
  type VideoSettings,
} from '@kamo/core/export'
import { useEffect, useId, useMemo, useState } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { DecorPiece } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { FormatPreview } from './FormatPreview.tsx'
import {
  DEFAULT_EXPORT_SETTINGS,
  useExportRun,
  type CaptionExport,
  type ExportJob,
  type ExportPlatform,
  type ExportSettings,
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
  /** the decoded image of an image background (A-04), drawn in the format previews */
  backgroundImage?: BackgroundImage | null
  timeMs: number
  /** transcript.json (A-06): with speech in it, the captions choice shows */
  transcript?: Transcript | null
  platform: ExportPlatform
  onClose(): void
}

const CAPTION_CHOICES: readonly CaptionExport[] = ['none', 'burn', 'srt']
const CAPTION_KEY: Record<CaptionExport, string> = {
  none: 'export.captions.none',
  burn: 'export.captions.burn',
  srt: 'export.captions.srt',
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
  backgroundImage = null,
  timeMs,
  transcript = null,
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
  // A-06: captions on by default when they show in the editor.
  const hasCaptions = (transcript?.segments.length ?? 0) > 0
  const [captions, setCaptions] = useState<CaptionExport>(() =>
    hasCaptions && projectCaptions(project).enabled ? 'burn' : 'none',
  )
  // A-01 / A-02: resolution and frame rate (MP4), or a GIF at 10 or 15fps.
  const [settings, setSettings] =
    useState<Omit<ExportSettings, 'captions'>>(DEFAULT_EXPORT_SETTINGS)
  const gif = settings.format === 'gif'
  const allow4k = canExport4k(project.source)
  // What this machine's encoder will really make (4K60 is beyond many): said before exporting.
  const fallback = useEncoderFallback(gif ? null : settings)
  // A GIF only takes captions burned in (A-06): the .srt choice counts as burned in there.
  const effectiveCaptions: CaptionExport = gif && captions === 'srt' ? 'burn' : captions
  const { state, start, retry, cancel, reset } = useExportRun({
    project,
    events,
    autoZoom,
    platform,
    transcript: hasCaptions ? transcript : null,
  })
  // The format previews show the captions only when they will be burned in.
  const captionTrack = useMemo(
    () =>
      effectiveCaptions === 'burn'
        ? buildCaptionTrack(transcript, { ...projectCaptions(project), enabled: true })
        : null,
    [effectiveCaptions, transcript, project],
  )
  const scene = useMemo(
    () => ({
      ...buildScene({ project, events, zooms, captions: captionTrack }),
      backgroundImage,
    }),
    [project, events, zooms, backgroundImage, captionTrack],
  )
  const selected = ASPECTS.filter((aspect) => checked[aspect])
  // A-02: the estimated size of each GIF, shown (and warned about) before exporting.
  const gifBytes = gif
    ? selected.map((aspect) =>
        estimateGifBytes({
          size: gifSize(aspect),
          fps: settings.gifFps,
          durationMs: project.trim.endMs - project.trim.startMs,
        }),
      )
    : []
  const gifTotal = gifBytes.reduce((sum, bytes) => sum + bytes, 0)
  const gifLarge = gifBytes.some((bytes) => bytes > GIF_LARGE_BYTES)
  const locale = resolveLocale([useLocale()])
  const chooseFormat = (format: ExportSettings['format']) => {
    setSettings({ ...settings, format })
    if (format === 'gif' && captions === 'srt') setCaptions('burn')
  }
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
                    <span className="flex self-center">
                      <FormatPreview
                        scene={scene}
                        aspect={aspect}
                        video={video}
                        webcamVideo={webcamVideo}
                        timeMs={timeMs}
                        {...PREVIEW_SIZE[aspect]}
                      />
                    </span>
                    {/* Ratio and name on one line each, never wrapped: the tile grows to the
                        longest one (the 9:16 preview is only 81px wide) and centers the preview. */}
                    <span className="flex items-start gap-sm text-body">
                      <input
                        type="checkbox"
                        data-testid={`export-format-${aspect}`}
                        checked={checked[aspect]}
                        onChange={(e) => setChecked({ ...checked, [aspect]: e.target.checked })}
                        className={`mt-[3px] size-[16px] shrink-0 accent-tertiary ${FOCUS_RING}`}
                      />
                      <span className="flex flex-col whitespace-nowrap">
                        <span className="font-medium tabular-nums">{aspect}</span>
                        <span
                          className="text-label text-on-surface-muted"
                          data-testid={`export-format-label-${aspect}`}
                        >
                          {t(ASPECT_LABEL[aspect])}
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-md gap-y-sm text-body">
              <dt className="text-on-surface-muted">{t('export.fileFormat')}</dt>
              <dd>
                <Choices
                  label={t('export.fileFormat')}
                  testId="export-file-format"
                  value={settings.format}
                  onChange={chooseFormat}
                  options={[
                    { value: 'mp4', label: 'MP4' },
                    { value: 'gif', label: 'GIF' },
                  ]}
                />
              </dd>
              {!gif && (
                <>
                  <dt className="text-on-surface-muted">{t('export.resolution')}</dt>
                  <dd className="flex flex-col gap-xs">
                    <Choices
                      label={t('export.resolution')}
                      testId="export-resolution"
                      value={settings.resolution}
                      onChange={(resolution) => setSettings({ ...settings, resolution })}
                      options={[
                        { value: '1080p', label: '1080p' },
                        { value: '4k', label: '4K', disabled: !allow4k },
                      ]}
                    />
                    {!allow4k && (
                      <span
                        className="text-label text-on-surface-muted"
                        data-testid="export-4k-hint"
                      >
                        {t('export.needs4kSource', {
                          size: `${project.source.width}×${project.source.height}`,
                        })}
                      </span>
                    )}
                  </dd>
                </>
              )}
              <dt className="text-on-surface-muted">{t('export.frameRate')}</dt>
              <dd className="flex flex-col gap-xs">
                {gif ? (
                  <Choices
                    label={t('export.frameRate')}
                    testId="export-gif-fps"
                    value={settings.gifFps}
                    onChange={(gifFps) => setSettings({ ...settings, gifFps })}
                    options={GIF_FPS_CHOICES.map((fps) => ({
                      value: fps,
                      label: t('export.fps', { fps }),
                    }))}
                  />
                ) : (
                  <Choices
                    label={t('export.frameRate')}
                    testId="export-fps"
                    value={settings.fps}
                    onChange={(fps) => setSettings({ ...settings, fps })}
                    options={[
                      { value: 30, label: t('export.fps', { fps: 30 }) },
                      { value: 60, label: t('export.fps', { fps: 60 }) },
                    ]}
                  />
                )}
                {!gif && settings.fps === 60 && project.source.fps < 60 && (
                  <span className="text-label text-on-surface-muted" data-testid="export-60-hint">
                    {t('export.fps60From30', { fps: project.source.fps })}
                  </span>
                )}
                {gif && (
                  <span className="text-label text-on-surface-muted">{t('export.gifHint')}</span>
                )}
              </dd>
              {hasCaptions && (
                <>
                  <dt className="text-on-surface-muted">{t('export.captions.label')}</dt>
                  <dd className="flex flex-col gap-xs">
                    <div
                      role="radiogroup"
                      aria-label={t('export.captions.label')}
                      className="flex flex-wrap gap-xs"
                    >
                      {CAPTION_CHOICES.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          role="radio"
                          aria-checked={effectiveCaptions === choice}
                          disabled={gif && choice === 'srt'}
                          data-testid={`export-captions-${choice}`}
                          onClick={() => setCaptions(choice)}
                          className={`rounded-full px-[12px] py-xs text-label transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${
                            effectiveCaptions === choice
                              ? 'bg-tertiary-container text-on-surface'
                              : 'text-on-surface-muted hover:bg-surface-raised'
                          }`}
                        >
                          {t(CAPTION_KEY[choice])}
                        </button>
                      ))}
                    </div>
                    {gif && (
                      <span className="text-label text-on-surface-muted">
                        {t('export.captions.gifBurnOnly')}
                      </span>
                    )}
                    {effectiveCaptions !== 'none' && (
                      <span className="text-label text-on-surface-muted">
                        {t(
                          effectiveCaptions === 'srt'
                            ? 'export.captions.srtHint'
                            : 'export.captions.burnHint',
                        )}
                      </span>
                    )}
                  </dd>
                </>
              )}
            </dl>
            {fallback && (
              <p
                role="status"
                className="-mt-sm text-label text-warning"
                data-testid="export-encoder-fallback"
              >
                {t('export.encoderFallback', {
                  wanted: settingsLabel(t, settings),
                  actual: settingsLabel(t, fallback),
                })}
              </p>
            )}
            {gif && selected.length > 0 && (
              <p
                className={`-mt-sm text-label ${gifLarge ? 'text-warning' : 'text-on-surface-muted'}`}
                data-testid="export-gif-estimate"
                data-bytes={gifTotal}
                role={gifLarge ? 'status' : undefined}
              >
                {t('export.gifEstimate', { size: formatFileSize(locale, gifTotal) })}
                {gifLarge &&
                  ` ${t('export.gifLarge', { limit: formatFileSize(locale, GIF_LARGE_BYTES) })}`}
              </p>
            )}

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
                onClick={() =>
                  start(selected, {
                    ...settings,
                    captions: hasCaptions ? effectiveCaptions : 'none',
                  })
                }
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
        <span className="flex min-w-0 flex-col">
          <span className="min-w-0 truncate" title={label}>
            {label}
          </span>
          {job.srtName && (
            <span
              className="min-w-0 truncate text-label text-on-surface-muted"
              data-testid={`export-srt-${job.aspect}`}
            >
              {t('export.captions.srtFile', { name: job.srtName })}
            </span>
          )}
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

/** "4K 60 fps" for the encoder fallback notice. */
function settingsLabel(t: Translate, settings: VideoSettings): string {
  return `${settings.resolution === '4k' ? '4K' : '1080p'} ${t('export.fps', { fps: settings.fps })}`
}

/**
 * The settings the encoder will fall back to when it cannot make what was picked (A-01), or
 * null when it can (or for a GIF). Asked again whenever the resolution or rate changes.
 */
function useEncoderFallback(
  settings: Pick<ExportSettings, 'resolution' | 'fps'> | null,
): VideoSettings | null {
  const [fallback, setFallback] = useState<VideoSettings | null>(null)
  const resolution = settings?.resolution
  const fps = settings?.fps
  useEffect(() => {
    setFallback(null)
    if (!resolution || !fps || (resolution === '1080p' && fps === 30)) return
    let live = true
    void resolveVideoSettings('16:9', { resolution, fps })
      .then((resolved) => {
        if (live && resolved?.fallback) {
          setFallback({ resolution: resolved.resolution, fps: resolved.fps })
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [resolution, fps])
  return fallback
}

interface ChoiceOption<T> {
  value: T
  label: string
  disabled?: boolean
}

/** One-of chips (chip-selected), the same look as the captions choice. */
function Choices<T extends string | number>({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string
  testId: string
  value: T
  options: readonly ChoiceOption<T>[]
  onChange(value: T): void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          data-testid={`${testId}-${option.value}`}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-[12px] py-xs text-label transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${
            value === option.value
              ? 'bg-tertiary-container text-on-surface'
              : 'text-on-surface-muted enabled:hover:bg-surface-raised'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
