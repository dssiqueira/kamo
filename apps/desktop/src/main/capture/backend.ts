// Connects the RecordingController to the native helper through startRecording.
import type { CursorSettings, Style } from '@kamo/core'
import { formatProjectDate, type Locale } from '@kamo/i18n'
import type { BackendResult, BackendSession, RecordingBackend } from '../recording-controller.ts'
import type { FileProjectStore } from '../storage/index.ts'
import type { CaptureLogger } from './helper-process.ts'
import { RecordingError, startRecording, type RecordingResult } from './recording.ts'

const FPS = 30

export interface HelperBackendOptions {
  store: FileProjectStore
  logger: CaptureLogger
  appVersion: string
  /** Null when the helper is not there (not built yet, unsupported OS). */
  helperPath: () => string | null
  /** Translates the default project name ("Recording {date}"). */
  projectName: (date: string) => string
  locale: Locale
  /** Last style and cursor used: the defaults of a new project (F-08). */
  defaults?: () => Promise<{ style?: Style; cursor?: CursorSettings }>
}

export function createHelperBackend(options: HelperBackendOptions): RecordingBackend {
  return {
    async start(displayId) {
      const executable = options.helperPath()
      if (!executable) throw new RecordingError('helper_missing', 'capture helper not found')
      const defaults = (await options.defaults?.().catch(() => undefined)) ?? {}
      const now = new Date()
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
          fps: FPS,
          name: options.projectName(formatProjectDate(options.locale, now)),
          ...(defaults.style ? { style: defaults.style } : {}),
          ...(defaults.cursor ? { cursor: defaults.cursor } : {}),
        },
      )
      const backendSession: BackendSession = {
        fps: FPS,
        pause: () => session.pause(),
        resume: () => session.resume(),
        stop: async () => toBackendResult(await session.stop()),
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

function toBackendResult(result: RecordingResult): BackendResult {
  if ('discarded' in result) return { kind: 'discarded', reason: result.discarded }
  return result.stoppedBy === 'user'
    ? { kind: 'saved', projectId: result.project.id }
    : { kind: 'saved', projectId: result.project.id, warning: result.stoppedBy }
}
