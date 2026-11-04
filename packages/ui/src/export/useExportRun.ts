import {
  backgroundImageFile,
  type Aspect,
  type ExportRecord,
  type FileSink,
  type MouseEventRecord,
  type Project,
} from '@kamo/core'
import {
  exportErrorCode,
  exportFileName,
  exportVideo,
  type ExportAudioTrack,
  type ExportErrorCode,
  type ExportWarning,
  type MediaFile,
} from '@kamo/core/export'
import { useCallback, useEffect, useRef, useState } from 'react'

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
}

export const EXPORT_RESOLUTION = '1080p' as const
export const EXPORT_FPS = 30 as const

export interface ExportJob {
  aspect: Aspect
  status: 'waiting' | 'exporting' | 'done'
  /** 0..1 */
  progress: number
  /** final file name, once the sink opened it */
  name: string | null
  path: string | null
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
}

/**
 * Exports the checked formats one after another (F-11), with progress per file. Cancel
 * aborts the current file (the sink deletes it) and goes back to configuring.
 */
export function useExportRun({ project, events, autoZoom, platform }: ExportRunInput) {
  const [state, setState] = useState<ExportRunState>({ phase: 'configuring' })
  const controller = useRef<AbortController | null>(null)
  const latest = useRef({ project, events, autoZoom, platform })
  latest.current = { project, events, autoZoom, platform }

  const busy = state.phase === 'exporting'
  useEffect(() => {
    latest.current.platform.onBusyChange?.(busy)
  }, [busy])
  // Leaving the screen mid-export (e.g. the editor unmounts) cancels it.
  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback(async (jobs: ExportJob[]) => {
    const { project, events, autoZoom, platform } = latest.current
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
    for (let index = 0; index < current.length; index++) {
      const job = current[index] as ExportJob
      if (job.status === 'done') continue
      update(index, { status: 'exporting', progress: 0 })
      try {
        const file = await platform.sink.open(
          exportFileName({
            projectName: project.name,
            aspect: job.aspect,
            resolution: EXPORT_RESOLUTION,
            fps: EXPORT_FPS,
          }),
          'video/mp4',
        )
        update(index, { name: file.name })
        let shown = 0
        const result = await exportVideo({
          project,
          events,
          video: platform.media.video,
          webcam: project.webcam ? (platform.media.webcam ?? null) : null,
          backgroundImage: imageFile ? (platform.media.backgroundImage?.(imageFile) ?? null) : null,
          audio,
          aspect: job.aspect,
          resolution: EXPORT_RESOLUTION,
          fps: EXPORT_FPS,
          autoZoom,
          sink: file,
          signal: abort.signal,
          onProgress: (fraction) => {
            // One re-render per percent is plenty for a progress bar.
            if (fraction - shown >= 0.01 || fraction === 1) {
              shown = fraction
              update(index, { progress: fraction })
            }
          },
        })
        result.warnings.forEach((w) => warnings.add(w))
        update(index, { status: 'done', progress: 1, path: result.path, name: result.name })
        platform.onExported?.({
          aspect: job.aspect,
          resolution: EXPORT_RESOLUTION,
          fps: EXPORT_FPS,
          format: 'mp4',
          path: result.path,
          createdAt: new Date().toISOString(),
        })
      } catch (error) {
        controller.current = null
        const code = exportErrorCode(error)
        if (code === 'aborted') {
          setState({ phase: 'configuring' })
        } else {
          console.error('kamo: export failed', error)
          current = current.map((j, i) => (i === index ? { ...j, status: 'waiting' } : j))
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
    start: (aspects: readonly Aspect[]) =>
      void run(
        aspects.map((aspect) => ({
          aspect,
          status: 'waiting',
          progress: 0,
          name: null,
          path: null,
        })),
      ),
    /** After an error: exports again the files that did not finish. */
    retry: () => {
      if (state.phase === 'error') void run(state.jobs)
    },
    cancel: () => controller.current?.abort(),
    reset: () => setState({ phase: 'configuring' }),
  }
}
