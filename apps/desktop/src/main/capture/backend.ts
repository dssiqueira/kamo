// Connects the RecordingController to the native helper through startRecording.
import type { CursorSettings, Style } from '@kamo/core'
import { formatProjectDate, type Locale } from '@kamo/i18n'
import type { CaptureTarget } from '../../shared/capture.ts'
import { monitorPointFor } from '../displays.ts'
import type { BackendResult, BackendSession, RecordingBackend } from '../recording-controller.ts'
import type { FileProjectStore } from '../storage/index.ts'
import { linkRecordingMedia } from '../storage/recovery.ts'
import type { CaptureLogger } from './helper-process.ts'
import type { RegionRect } from './protocol.ts'
import { RecordingError, startRecording, type RecordingResult } from './recording.ts'

/** A-01: what a recording gets when no frame rate was chosen. */
const DEFAULT_FPS: 30 | 60 = 30

export interface HelperBackendOptions {
  store: FileProjectStore
  logger: CaptureLogger
  appVersion: string
  /** Null when the helper is not there (not built yet, unsupported OS). */
  helperPath: () => string | null
  /** Translates the default project name ("Recording {date}"). */
  projectName: (date: string) => string
  locale: Locale
  /**
   * Windows: a physical screen point inside the display, which the helper maps to an HMONITOR
   * (PROTOCOL.md, `start`). Undefined elsewhere, or when the display is gone. Defaults to
   * monitorPointFor (Electron's screen API); overridable for tests.
   */
  monitorPoint?: (displayId: string) => { x: number; y: number } | undefined
  /** Last style and cursor used: the defaults of a new project (F-08). */
  defaults?: () => Promise<{ style?: Style; cursor?: CursorSettings }>
  /** D-024: whether the helper records the computer sound (Mac 13+ with the toggle on). */
  systemAudio?: () => Promise<boolean>
  /** A-08: a window's title for project.json, if the last list had it. */
  windowTitle?: (windowId: string) => string | undefined
  /** A-01: Home's frame rate (settings.recordingFps). Omitted or failing: 30. */
  fps?: () => Promise<30 | 60>
}

export function createHelperBackend(options: HelperBackendOptions): RecordingBackend {
  return {
    async start(target) {
      const executable = options.helperPath()
      if (!executable) throw new RecordingError('helper_missing', 'capture helper not found')
      const defaults = (await options.defaults?.().catch(() => undefined)) ?? {}
      const systemAudio = (await options.systemAudio?.().catch(() => false)) ?? false
      const fps = (await options.fps?.().catch(() => DEFAULT_FPS)) ?? DEFAULT_FPS
      const now = new Date()
      const displayId = target.kind === 'window' ? (target.displayId ?? '0') : target.displayId
      // A window is found by its id; a display (or a region of it) by a point inside it.
      const monitorPoint =
        target.kind === 'window' ? undefined : (options.monitorPoint ?? monitorPointFor)(displayId)
      const windowTitle = target.kind === 'window' ? options.windowTitle?.(target.windowId) : ''
      const session = await startRecording(
        {
          store: options.store,
          logger: options.logger,
          helper: { executable },
          appVersion: options.appVersion,
          now: () => now,
        },
        {
          displayId,
          fps,
          name: options.projectName(formatProjectDate(options.locale, now)),
          ...(defaults.style ? { style: defaults.style } : {}),
          ...(defaults.cursor ? { cursor: defaults.cursor } : {}),
          ...(monitorPoint ? { monitorPoint } : {}),
          ...targetFields(target),
          ...(windowTitle ? { windowTitle } : {}),
          ...(systemAudio ? { systemAudio } : {}),
        },
      )
      const backendSession: BackendSession = {
        // What the helper really records at (it echoes the asked rate in `started`).
        fps: session.source.fps,
        pause: () => session.pause(),
        resume: () => session.resume(),
        stop: async () => toBackendResult(await session.stop()),
        linkMedia: async (media) => {
          // only while the marker is there: a stopped recording has no marker to extend
          if (session.state !== 'recording' && session.state !== 'paused') return
          await linkRecordingMedia(options.store, session.projectId, media)
        },
        onEnded: (listener) => {
          session.done.then(
            (result) => listener(toBackendResult(result)),
            (error: unknown) =>
              listener({
                kind: 'failed',
                code: error instanceof RecordingError ? error.code : 'helper_crashed',
              }),
          )
        },
      }
      return backendSession
    },
  }
}

/** The helper's `start` fields for a window or a region (A-08); none for a whole display. */
function targetFields(target: CaptureTarget): { windowId?: string; region?: RegionRect } {
  if (target.kind === 'window') return { windowId: target.windowId }
  if (target.kind === 'region') return { region: { ...target.rect } }
  return {}
}

function toBackendResult(result: RecordingResult): BackendResult {
  if ('discarded' in result) return { kind: 'discarded', reason: result.discarded }
  return {
    kind: 'saved',
    projectId: result.project.id,
    ...(result.stoppedBy === 'user' ? {} : { warning: result.stoppedBy }),
    ...(result.audioWarnings?.length ? { audioWarnings: result.audioWarnings } : {}),
  }
}
