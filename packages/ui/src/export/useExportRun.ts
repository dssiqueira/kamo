import {
  backgroundImageFile,
  CAPTION_MAX_LINES,
  captionCues,
  captionMaxUnits,
  projectCaptions,
  toSrt,
  type Aspect,
  type ExportRecord,
  type FileSink,
  type Fps,
  type MouseEventRecord,
  type Project,
  type Resolution,
  type ExternalVideoEncoder,
  type Transcript,
} from '@kamo/core'
import {
  ExportError,
  exportErrorCode,
  exportFileName,
  GIF_RESOLUTION,
  needsCompatibilityEncoder,
  resolveVideoSettings,
  type ExportAudioTrack,
  type ExportErrorCode,
  type ExportResult,
  type ExportWarning,
  type GifFps,
  type MediaFile,
} from '@kamo/core/export'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PackView } from '../packs/types.ts'

/** The raw files of the project, as the platform reads them. */
export interface ExportMedia {
  video: MediaFile
  /** audio.m4a / system.m4a; null when the project has none */
  mic: MediaFile | null
  system: MediaFile | null
  /** webcam.mp4 (A-03); null/missing when the project has no webcam */
  webcam?: MediaFile | null
  /** a background image copied into the project (A-04, `style.background.value`) */
  backgroundImage?(file: string): MediaFile | null
}

/**
 * The optional "Video compatibility" pack (A-07, D-040): FFmpeg as the encoder when this
 * machine's WebCodecs has none or it breaks. Desktop only; the extension has no packs.
 */
export interface ExportCompatibility {
  /** The pack as Settings → Packs shows it; null until the platform answered. */
  getSnapshot(): PackView | null
  subscribe(listener: () => void): () => void
  /** The user asked for it: download and install (progress comes through subscribe). */
  install(): void
  cancel(): void
  /** Encodes through the installed pack (refuses with `encoder_unavailable` when it is not). */
  encoder: ExternalVideoEncoder
}

/** Installed (an update waiting still counts): exports can use it right away. */
export function compatibilityReady(pack: PackView | null | undefined): boolean {
  return (pack?.installedVersion ?? null) !== null
}

/**
 * The error screen offers the download (A-07) only when it can help: the run stopped for lack
 * of a working encoder, the pack is not installed yet and this computer has a build of it.
 */
export function offersCompatibility(code: ExportErrorCode, pack: PackView | null): boolean {
  return (
    needsCompatibilityEncoder(code) &&
    pack !== null &&
    !compatibilityReady(pack) &&
    pack.error !== 'unsupported_platform'
  )
}

/**
 * Which encoder an MP4 goes through (D-040): WebCodecs when it has one for the settings (or
 * their A-01 fallback) and has not broken in this sheet; the installed pack otherwise; null =
 * none (`encoder_unavailable`, which offers the pack).
 */
export function mp4Encoder(options: {
  webCodecs: boolean
  compatReady: boolean
}): 'webcodecs' | 'compatibility' | null {
  if (options.webCodecs) return 'webcodecs'
  return options.compatReady ? 'compatibility' : null
}

/** WebCodecs broke mid-file: made again through the pack, if it is installed. */
export function retriesWithCompatibility(code: ExportErrorCode, compatReady: boolean): boolean {
  return code === 'encoder_failed' && compatReady
}

/** What the app gives the export screen; packages/ui never knows where files go (rule 1). */
export interface ExportPlatform {
  sink: FileSink
  media: ExportMedia
  /** Folder shown under the formats (desktop). Omit when the platform has none. */
  getFolder?(): Promise<string>
  /** Lets the user pick another folder; resolves to the new one or null if canceled. */
  chooseFolder?(): Promise<string | null>
  showInFolder?(path: string): void
  /** Each finished file, to record in project.exports (data-model.md). */
  onExported?(record: ExportRecord): void
  /** True while files are being written, so the app can ask before closing (F-11). */
  onBusyChange?(busy: boolean): void
  /** Desktop: the compatibility pack, offered when the export fails for lack of an encoder. */
  compatibility?: ExportCompatibility
}

/** Captions on export (A-06): none, burned into the picture, or an .srt next to the MP4. */
export type CaptionExport = 'none' | 'burn' | 'srt'

export type ExportFormat = 'mp4' | 'gif'
/** File formats in the order their files are exported (and listed). */
export const EXPORT_FORMATS: readonly ExportFormat[] = ['mp4', 'gif']

/**
 * The choices of the Formats sheet (F-11, A-01, A-02). Every checked aspect is exported in
 * every checked file format, each file with its own format's settings.
 */
export interface ExportSettings {
  /** at least one; MP4 and GIF can go in the same run */
  formats: readonly ExportFormat[]
  /** MP4 only (A-01) */
  resolution: Resolution
  /** MP4 only (A-01) */
  fps: Fps
  /** GIF only (A-02) */
  gifFps: GifFps
  /** A-06; a GIF can only burn them in, so `srt` counts as `burn` there (see jobCaptions) */
  captions: CaptionExport
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  formats: ['mp4'],
  resolution: '1080p',
  fps: 30,
  gifFps: 15,
  captions: 'none',
}

export interface ExportJob {
  format: ExportFormat
  aspect: Aspect
  status: 'waiting' | 'exporting' | 'done'
  /** 0..1 */
  progress: number
  /** final file name, once the sink opened it */
  name: string | null
  /** set once the video or GIF is saved; a retry then only redoes what is left (the .srt) */
  path: string | null
  /** the .srt written next to it (A-06), once saved */
  srtName?: string | null
}

export type ExportRunState =
  | { phase: 'configuring' }
  | { phase: 'exporting'; jobs: ExportJob[] }
  | { phase: 'done'; jobs: ExportJob[]; warnings: ExportWarning[] }
  | { phase: 'error'; jobs: ExportJob[]; code: ExportErrorCode }

export interface ExportRunInput {
  project: Project
  events: readonly MouseEventRecord[]
  autoZoom: boolean
  platform: ExportPlatform
  /** transcript.json (A-06): the captions' text; null = no captions to export */
  transcript?: Transcript | null
}

/**
 * The files of a run (F-11, A-02): every checked aspect in every checked file format, MP4s
 * first, each format in the sheet's aspect order. Duplicates count once.
 */
export function exportJobs(
  aspects: readonly Aspect[],
  formats: readonly ExportFormat[],
): ExportJob[] {
  const unique = [...new Set(aspects)]
  return EXPORT_FORMATS.filter((format) => formats.includes(format)).flatMap((format) =>
    unique.map((aspect): ExportJob => ({
      format,
      aspect,
      status: 'waiting',
      progress: 0,
      name: null,
      path: null,
    })),
  )
}

/** One job's identity in the list (an aspect can be in the run twice: MP4 and GIF). */
export function jobKey(job: Pick<ExportJob, 'format' | 'aspect'>): string {
  return `${job.format}-${job.aspect}`
}

/**
 * The captions one file gets (A-06): a GIF has no .srt, so the .srt choice burns them into
 * the GIF while the MP4s of the same run get their .srt.
 */
export function jobCaptions(captions: CaptionExport, format: ExportFormat): CaptionExport {
  return format === 'gif' && captions === 'srt' ? 'burn' : captions
}

/**
 * What a job still needs: nothing (done), the whole file, or only its .srt — when the video
 * was saved but writing the .srt failed, "Try again" must not export the video a second time.
 */
export function jobStep(job: ExportJob): 'none' | 'file' | 'srt' {
  if (job.status === 'done') return 'none'
  return job.path ? 'srt' : 'file'
}

/** The jobs after a failure on job `index`: back to waiting, keeping a file already saved. */
export function jobsAfterFailure(jobs: readonly ExportJob[], index: number): ExportJob[] {
  return jobs.map((job, i) =>
    i === index ? { ...job, status: 'waiting', progress: job.path ? 1 : 0 } : job,
  )
}

/**
 * The .srt of one format (A-06): the cues wrapped like the burned-in ones, clipped to the
 * trim and timed from its start, so they line up with the exported video. Null when no
 * caption falls inside the trim.
 */
export function srtFor(project: Project, transcript: Transcript, aspect: Aspect): string | null {
  const settings = projectCaptions(project)
  const cues = captionCues(transcript, {
    maxUnits: captionMaxUnits(aspect, settings),
    maxLines: CAPTION_MAX_LINES,
    trim: project.trim,
  })
  return cues.length > 0 ? toSrt(cues, project.trim.startMs) : null
}

/** `Demo 16x9 1080p30 (2).mp4` → `Demo 16x9 1080p30 (2).srt`: players load it with the video. */
export function srtName(videoName: string): string {
  return `${videoName.replace(/.[^.]+$/, '')}.srt`
}

/** Writes a small text file through the sink (committed, or aborted on failure). */
async function writeText(sink: FileSink, name: string, text: string): Promise<string> {
  const file = await sink.open(name, 'application/x-subrip')
  try {
    const writer = file.stream.getWriter()
    await writer.write({ type: 'write', data: new TextEncoder().encode(text), position: 0 })
    writer.releaseLock()
    await file.commit()
    return file.name
  } catch (error) {
    await file.abort(error).catch(() => {})
    throw error
  }
}

/**
 * Exports the checked formats one after another (F-11), with progress per file. Cancel
 * aborts the current file (the sink deletes it) and goes back to configuring.
 */
export function useExportRun({
  project,
  events,
  autoZoom,
  platform,
  transcript = null,
}: ExportRunInput) {
  const [state, setState] = useState<ExportRunState>({ phase: 'configuring' })
  const controller = useRef<AbortController | null>(null)
  const latest = useRef({ project, events, autoZoom, platform, transcript })
  latest.current = { project, events, autoZoom, platform, transcript }
  /** The settings of the current run (kept for "Try again"). */
  const settingsRef = useRef<ExportSettings>(DEFAULT_EXPORT_SETTINGS)
  /**
   * WebCodecs broke on this machine during this sheet's life: the next MP4s go straight to the
   * compatibility pack while it is installed (D-040), instead of failing a second time.
   */
  const preferCompat = useRef(false)

  const busy = state.phase === 'exporting'
  useEffect(() => {
    latest.current.platform.onBusyChange?.(busy)
  }, [busy])
  // Leaving the screen mid-export (e.g. the editor unmounts) cancels it.
  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback(async (jobs: ExportJob[]) => {
    const { project, events, autoZoom, platform, transcript } = latest.current
    const settings = settingsRef.current
    const captions = transcript ? settings.captions : 'none'
    const abort = new AbortController()
    controller.current = abort
    let current = jobs.map((job) => ({ ...job }))
    const warnings = new Set<ExportWarning>()
    const update = (index: number, patch: Partial<ExportJob>) => {
      current = current.map((job, i) => (i === index ? { ...job, ...patch } : job))
      setState({ phase: 'exporting', jobs: current })
    }
    setState({ phase: 'exporting', jobs: current })

    const audio: ExportAudioTrack[] = []
    if (project.audio.mic.enabled && platform.media.mic) {
      audio.push({
        file: platform.media.mic,
        volume: project.audio.mic.volume,
        offsetMs: project.audio.mic.offsetMs ?? 0,
      })
    }
    if (project.audio.system.enabled && platform.media.system) {
      audio.push({
        file: platform.media.system,
        volume: project.audio.system.volume,
        offsetMs: project.audio.system.offsetMs ?? 0,
      })
    }

    const imageFile = backgroundImageFile(project.style.background)
    const burned = transcript ? { transcript, settings: projectCaptions(project) } : null
    const common = {
      project,
      events,
      video: platform.media.video,
      webcam: project.webcam ? (platform.media.webcam ?? null) : null,
      backgroundImage: imageFile ? (platform.media.backgroundImage?.(imageFile) ?? null) : null,
      autoZoom,
      signal: abort.signal,
    }

    for (let index = 0; index < current.length; index++) {
      const job = current[index] as ExportJob
      const step = jobStep(job)
      if (step === 'none') continue
      const gif = job.format === 'gif'
      // A-06: an .srt next to each MP4; a GIF only takes them burned in.
      const fileCaptions = jobCaptions(captions, job.format)
      const srt =
        fileCaptions === 'srt' && transcript ? srtFor(project, transcript, job.aspect) : null
      const jobCommon = { ...common, captions: fileCaptions === 'burn' ? burned : null }
      update(index, { status: 'exporting', progress: step === 'srt' ? 1 : 0 })
      try {
        if (step === 'file') {
          let shown = 0
          const onProgress = (fraction: number) => {
            // One re-render per percent is plenty for a progress bar.
            if (fraction - shown >= 0.01 || fraction === 1) {
              shown = fraction
              update(index, { progress: fraction })
            }
          }
          // Before any file is opened: a pipeline that fails to load leaves nothing behind.
          const { exportGif, exportVideo, exportVideoExternal } = await import('./pipeline.ts')
          let result: ExportResult
          let record: Pick<ExportRecord, 'resolution' | 'fps' | 'format'>
          if (gif) {
            record = { resolution: GIF_RESOLUTION, fps: settings.gifFps, format: 'gif' }
            const file = await platform.sink.open(
              exportFileName({
                projectName: project.name,
                aspect: job.aspect,
                resolution: GIF_RESOLUTION,
                fps: settings.gifFps,
                extension: 'gif',
              }),
              'image/gif',
            )
            update(index, { name: file.name })
            result = await exportGif({
              ...jobCommon,
              aspect: job.aspect,
              fps: settings.gifFps,
              sink: file,
              onProgress,
            })
          } else {
            const compat = platform.compatibility
            const compatReady = () => !!compat && compatibilityReady(compat.getSnapshot())
            // A-01: what this machine's encoder can make, best first (4K60 → 4K30 → …).
            const resolved =
              preferCompat.current && compatReady()
                ? null
                : await resolveVideoSettings(job.aspect, {
                    resolution: settings.resolution,
                    fps: settings.fps,
                  })
            let webCodecs: { result: ExportResult; record: typeof record } | null = null
            const route = mp4Encoder({ webCodecs: resolved !== null, compatReady: compatReady() })
            if (!route) throw new ExportError('encoder_unavailable')
            if (resolved) {
              const file = await platform.sink.open(
                exportFileName({
                  projectName: project.name,
                  aspect: job.aspect,
                  resolution: resolved.resolution,
                  fps: resolved.fps,
                }),
                'video/mp4',
              )
              update(index, { name: file.name })
              try {
                const done = await exportVideo({
                  ...jobCommon,
                  audio,
                  aspect: job.aspect,
                  resolution: resolved.resolution,
                  fps: resolved.fps,
                  sink: file,
                  onProgress,
                })
                webCodecs = {
                  result: done,
                  record: { resolution: resolved.resolution, fps: resolved.fps, format: 'mp4' },
                }
              } catch (error) {
                // D-040: the encoder broke; with the pack installed, this file is made again
                // through it (the sink already deleted the incomplete one).
                if (!retriesWithCompatibility(exportErrorCode(error), compatReady())) throw error
                preferCompat.current = true
              }
              if (webCodecs && resolved.fallback) warnings.add('settings_fallback')
            }
            if (webCodecs) {
              result = webCodecs.result
              record = webCodecs.record
            } else {
              // The compatibility pack (D-040): exactly the settings asked for, painted by the
              // same core renderer, encoded by FFmpeg in the main process.
              shown = 0
              update(index, { progress: 0, name: null })
              record = { resolution: settings.resolution, fps: settings.fps, format: 'mp4' }
              result = await exportVideoExternal({
                ...jobCommon,
                audio,
                aspect: job.aspect,
                resolution: settings.resolution,
                fps: settings.fps,
                encoder: (compat as ExportCompatibility).encoder,
                fileName: exportFileName({
                  projectName: project.name,
                  aspect: job.aspect,
                  resolution: settings.resolution,
                  fps: settings.fps,
                }),
                onProgress,
              })
            }
          }
          result.warnings.forEach((w) => warnings.add(w))
          // Saved: recorded right away, so a later .srt failure never loses it.
          update(index, { progress: 1, path: result.path, name: result.name })
          platform.onExported?.({
            aspect: job.aspect,
            ...record,
            path: result.path,
            createdAt: new Date().toISOString(),
          })
        }
        const saved = current[index] as ExportJob
        const srtFile =
          srt && saved.name ? await writeText(platform.sink, srtName(saved.name), srt) : null
        update(index, { status: 'done', progress: 1, srtName: srtFile })
      } catch (error) {
        controller.current = null
        const code = exportErrorCode(error)
        if (code === 'aborted') {
          setState({ phase: 'configuring' })
        } else {
          console.error('kamo: export failed', error)
          current = jobsAfterFailure(current, index)
          setState({ phase: 'error', jobs: current, code })
        }
        return
      }
    }
    controller.current = null
    setState({ phase: 'done', jobs: current, warnings: [...warnings] })
  }, [])

  return {
    state,
    start: (aspects: readonly Aspect[], settings: ExportSettings = DEFAULT_EXPORT_SETTINGS) => {
      settingsRef.current = settings
      void run(exportJobs(aspects, settings.formats))
    },
    /** After an error: redoes only what did not finish (a saved video keeps its file). */
    retry: () => {
      if (state.phase === 'error') void run(state.jobs)
    },
    cancel: () => controller.current?.abort(),
    reset: () => setState({ phase: 'configuring' }),
  }
}
