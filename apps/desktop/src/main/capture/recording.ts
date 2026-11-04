// Recording lifecycle on the desktop (F-02, D-023): disk check → project folder with the
// recording marker → native helper → screen.mp4 + frames/ → project.json → marker cleared.
// Everything platform-specific (helper path, Electron) is injected, so tests run in Node.
import {
  createProject,
  saveProject,
  type CursorSettings,
  type Fps,
  type Project,
  type Style,
} from '@kamo/core'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { MIN_FREE_BYTES, freeDiskSpace } from '../storage/disk.ts'
import type { FileProjectStore } from '../storage/file-store.ts'
import { PARTIAL_SUFFIX } from '../storage/file-store.ts'
import { clearRecordingMarker, markRecordingStarted } from '../storage/recovery.ts'
import {
  HelperExitError,
  HelperFatalError,
  HelperProcess,
  HelperTimeoutError,
  type CaptureLogger,
  type HelperLaunch,
} from './helper-process.ts'
import {
  FRAME_INTERVAL_MS,
  FRAME_WIDTH,
  type HelperErrorCode,
  type HelperEvent,
  type HelperEventOf,
} from './protocol.ts'

export const SCREEN_FILE = 'screen.mp4'
/** F-02: anything shorter is discarded. */
export const MIN_DURATION_MS = 1000

export type RecordingErrorCode =
  /** Less than 1GB free before starting (F-02). */
  | 'low_disk'
  /** The helper exited unexpectedly; the folder is kept for recovery once recording began. */
  | 'helper_crashed'
  /** No `ready`/`started` in time. */
  | 'start_timeout'
  /** No `stopped` in time after `stop`; the folder is kept for recovery. */
  | 'stop_timeout'
  /** `stopped` came but the video file is missing; the folder is kept. */
  | 'output_missing'
  /** pause/resume called in the wrong state. */
  | 'invalid_state'
  /** A fatal error reported by the helper. */
  | HelperErrorCode

/** Error with a stable code; the UI translates it through packages/i18n. */
export class RecordingError extends Error {
  constructor(
    readonly code: RecordingErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RecordingError'
  }
}

/** Why the recording ended: the user, or the helper on its own (F-02 edge cases). */
export type StopReason = 'user' | 'display_lost' | 'disk_full'

export type RecordingResult =
  | { project: Project; stoppedBy: StopReason; frames: number }
  | { discarded: 'too_short'; stoppedBy: StopReason; durationMs: number }

/** What the UI hears while recording. Elapsed time is the UI's job. */
export type RecordingStatus =
  | { type: 'paused'; tMs: number }
  | { type: 'resumed'; tMs: number }
  | { type: 'frame'; file: string; tMs: number }
  /** Non-fatal helper problem; the recording continues (or is about to stop by itself). */
  | { type: 'warning'; code: HelperErrorCode; message: string }
  /** The helper stopped by itself (display gone, disk full); finalizing what was recorded. */
  | { type: 'stopping'; reason: StopReason }
  | { type: 'finished'; result: RecordingResult }
  | { type: 'failed'; error: RecordingError }

export type RecordingState = 'recording' | 'paused' | 'stopping' | 'finished' | 'failed'

export interface RecordingSession {
  readonly projectId: string
  readonly projectDir: string
  readonly source: Project['source']
  readonly state: RecordingState
  pause(): Promise<void>
  resume(): Promise<void>
  /** Stops and finalizes. Idempotent: later calls return the same result. */
  stop(): Promise<RecordingResult>
  /** Settles when the recording ends for any reason (stop, display lost, crash). */
  readonly done: Promise<RecordingResult>
  onStatus(listener: (status: RecordingStatus) => void): () => void
}

export interface RecordingRequest {
  displayId: string
  fps: Fps
  /** Already translated by the caller ("Recording {date}", data-model.md). */
  name: string
  style?: Style
  cursor?: CursorSettings
}

export interface RecordingDeps {
  store: FileProjectStore
  helper: HelperLaunch
  logger: CaptureLogger
  /** Defaults to `store.root`. Used for the free-space check. */
  projectsDir?: string
  now?: () => Date
  freeSpace?: (dir: string) => Promise<number>
  minFreeBytes?: number
  appVersion?: string
  /** Overridable for tests. */
  spawnHelper?: (launch: HelperLaunch, logger: CaptureLogger) => HelperProcess
  newId?: () => string
  startTimeoutMs?: number
  commandTimeoutMs?: number
  stopTimeoutMs?: number
  /** How long to wait for the helper to exit after `stopped` before killing it. */
  exitTimeoutMs?: number
}

const DEFAULT_START_TIMEOUT_MS = 10_000
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000
// Finalizing a 30-minute MP4 (moov atom) can take a few seconds on a slow disk.
const DEFAULT_STOP_TIMEOUT_MS = 30_000
const DEFAULT_EXIT_TIMEOUT_MS = 5_000

function toRecordingError(error: unknown, fallback: RecordingErrorCode): RecordingError {
  if (error instanceof RecordingError) return error
  if (error instanceof HelperFatalError) {
    return new RecordingError(error.code, error.message, { cause: error })
  }
  if (error instanceof HelperExitError) {
    return new RecordingError('helper_crashed', error.message, { cause: error })
  }
  if (error instanceof HelperTimeoutError) {
    return new RecordingError(fallback, error.message, { cause: error })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new RecordingError(fallback, message, { cause: error })
}

/** Waits for the process to go away, killing it after `timeoutMs`. */
async function waitForExit(helper: HelperProcess, timeoutMs: number): Promise<void> {
  const timeout = sleep(timeoutMs).then(() => 'timeout' as const)
  if ((await Promise.race([helper.exited, timeout])) === 'timeout') {
    helper.dispose()
    await helper.exited
  }
}

// Windows: antivirus or the indexer can hold the fresh file for a moment.
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as { code?: string }).code
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transient || attempt >= 10) throw error
      await sleep(10 * (attempt + 1))
    }
  }
}

/**
 * Starts recording a display. Resolves once the helper confirms the first frames are being
 * captured. Rejects with a RecordingError; on a start failure nothing is left on disk.
 */
export async function startRecording(
  deps: RecordingDeps,
  request: RecordingRequest,
): Promise<RecordingSession> {
  const { store, logger } = deps
  const now = deps.now ?? (() => new Date())
  const projectsDir = deps.projectsDir ?? store.root
  const minFree = deps.minFreeBytes ?? MIN_FREE_BYTES

  const free = await (deps.freeSpace ?? freeDiskSpace)(projectsDir)
  if (free < minFree) {
    logger.warn('recording.low_disk', { free, minFree })
    throw new RecordingError('low_disk', `only ${free} bytes free`)
  }

  const projectId = (deps.newId ?? (() => crypto.randomUUID()))()
  const createdAt = now()
  const projectDir = store.projectDir(projectId)
  const framesDir = join(projectDir, 'frames')
  const partial = join(projectDir, SCREEN_FILE + PARTIAL_SUFFIX)

  // the marker goes first, so a crash from here on is found by recovery
  await markRecordingStarted(store, projectId, {
    startedAt: createdAt.toISOString(),
    ...(deps.appVersion ? { appVersion: deps.appVersion } : {}),
  })

  let helper: HelperProcess | undefined
  try {
    await mkdir(framesDir, { recursive: true })
    helper = (deps.spawnHelper ?? ((launch, log) => new HelperProcess(launch, { logger: log })))(
      deps.helper,
      logger,
    )
    const startTimeoutMs = deps.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS
    const ready = await helper.waitFor('ready', { timeoutMs: startTimeoutMs })
    logger.info('recording.helper_ready', { version: ready.version, pid: helper.pid })
    const startedPromise = helper.waitFor('started', { timeoutMs: startTimeoutMs })
    helper.send({
      cmd: 'start',
      displayId: request.displayId,
      fps: request.fps,
      output: partial,
      framesDir,
      frameIntervalMs: FRAME_INTERVAL_MS,
      frameWidth: FRAME_WIDTH,
    })
    const started = await startedPromise
    logger.info('recording.started', {
      width: started.width,
      height: started.height,
      scaleFactor: started.scaleFactor,
      fps: started.fps,
    })
    return new Session(deps, request, helper, {
      projectId,
      projectDir,
      partial,
      createdAt,
      started,
    })
  } catch (error) {
    const failure = toRecordingError(error, 'start_timeout')
    logger.error('recording.start_failed', { code: failure.code, message: failure.message })
    if (helper) {
      helper.dispose()
      await helper.exited
    }
    // nothing was recorded: leave nothing behind (the trash is not for this)
    await rm(projectDir, { recursive: true, force: true }).catch((cleanupError: unknown) =>
      logger.warn('recording.cleanup_failed', { error: cleanupError }),
    )
    throw failure
  }
}

interface SessionInit {
  projectId: string
  projectDir: string
  partial: string
  createdAt: Date
  started: HelperEventOf<'started'>
}

class Session implements RecordingSession {
  readonly projectId: string
  readonly projectDir: string
  readonly source: Project['source']
  readonly done: Promise<RecordingResult>
  private currentState: RecordingState = 'recording'
  private readonly listeners = new Set<(status: RecordingStatus) => void>()
  private stopReason: StopReason = 'user'
  private stopRequested = false
  private stopTimer: NodeJS.Timeout | undefined
  private resolveDone!: (result: RecordingResult) => void
  private rejectDone!: (error: RecordingError) => void
  private stoppedEvent: Promise<HelperEventOf<'stopped'>>
  private finalizing: Promise<RecordingResult> | undefined
  private fatal: HelperEventOf<'error'> | undefined

  constructor(
    private readonly deps: RecordingDeps,
    private readonly request: RecordingRequest,
    private readonly helper: HelperProcess,
    private readonly init: SessionInit,
  ) {
    this.projectId = init.projectId
    this.projectDir = init.projectDir
    const { width, height, scaleFactor, fps } = init.started
    this.source = { kind: 'display', displayId: request.displayId, width, height, scaleFactor, fps }

    this.done = new Promise<RecordingResult>((resolve, reject) => {
      this.resolveDone = resolve
      this.rejectDone = reject
    })
    // callers that only use stop() must not get an unhandled rejection from `done`
    this.done.catch(() => {})

    this.stoppedEvent = new Promise((resolve, reject) => {
      helper.onEvent((event) => {
        if (event.event === 'stopped') resolve(event)
      })
      helper.onExit((exit) => reject(new HelperExitError(exit, 'stopped')))
    })
    this.stoppedEvent.catch(() => {})

    helper.onEvent(this.handleEvent)
    helper.onExit((exit) => {
      if (this.finalizing) return
      // exited without `stopped` while recording: a crash (or a fatal error)
      const error = this.fatal
        ? new RecordingError(this.fatal.code, this.fatal.message)
        : new RecordingError('helper_crashed', `helper exited (code ${exit.code})`)
      this.fail(error)
    })
  }

  get state(): RecordingState {
    return this.currentState
  }

  onStatus(listener: (status: RecordingStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async pause(): Promise<void> {
    if (this.currentState === 'paused') return
    await this.command('pause', 'paused', 'recording')
  }

  async resume(): Promise<void> {
    if (this.currentState === 'recording') return
    await this.command('resume', 'resumed', 'paused')
  }

  stop(): Promise<RecordingResult> {
    if (!this.finalizing && !this.stopRequested && this.isActive()) {
      this.stopRequested = true
      this.currentState = 'stopping'
      try {
        this.helper.send({ cmd: 'stop' })
      } catch {
        // already gone: the exit handler reports the crash
      }
      const timeoutMs = this.deps.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
      this.stopTimer = setTimeout(() => {
        if (this.finalizing) return
        this.deps.logger.error('recording.stop_timeout', { timeoutMs })
        this.fail(new RecordingError('stop_timeout', `no "stopped" within ${timeoutMs}ms`))
        this.helper.dispose()
      }, timeoutMs)
    }
    return this.done
  }

  private isActive(): boolean {
    return this.currentState === 'recording' || this.currentState === 'paused'
  }

  private async command(
    cmd: 'pause' | 'resume',
    reply: 'paused' | 'resumed',
    expected: RecordingState,
  ): Promise<void> {
    if (this.currentState !== expected) {
      throw new RecordingError('invalid_state', `cannot ${cmd} while ${this.currentState}`)
    }
    const timeoutMs = this.deps.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
    const answer = this.helper.waitFor(reply, { timeoutMs })
    try {
      this.helper.send({ cmd })
      await answer
    } catch (error) {
      answer.catch(() => {})
      throw toRecordingError(error, 'internal')
    }
  }

  private readonly handleEvent = (event: HelperEvent): void => {
    switch (event.event) {
      case 'paused':
        if (this.currentState === 'recording') this.currentState = 'paused'
        this.emit({ type: 'paused', tMs: event.tMs })
        break
      case 'resumed':
        if (this.currentState === 'paused') this.currentState = 'recording'
        this.emit({ type: 'resumed', tMs: event.tMs })
        break
      case 'frame':
        this.emit({ type: 'frame', file: event.file, tMs: event.tMs })
        break
      case 'error':
        if (event.fatal) {
          this.fatal = event
        } else if (event.code === 'display_lost' || event.code === 'disk_full') {
          // F-02: the helper stops by itself and finalizes; we save what was recorded
          this.stopReason = event.code
          if (this.isActive()) this.currentState = 'stopping'
          this.emit({ type: 'stopping', reason: event.code })
        } else {
          this.emit({ type: 'warning', code: event.code, message: event.message })
        }
        break
      case 'stopped':
        if (!this.finalizing && this.currentState !== 'failed') {
          this.currentState = 'stopping'
          this.finalizing = this.finalize()
        }
        break
      default:
        break
    }
  }

  private async finalize(): Promise<RecordingResult> {
    clearTimeout(this.stopTimer)
    const { store, logger } = this.deps
    try {
      const stopped = await this.stoppedEvent
      // the helper must be gone before its file is renamed (Windows file locks)
      await waitForExit(this.helper, this.deps.exitTimeoutMs ?? DEFAULT_EXIT_TIMEOUT_MS)
      logger.info('recording.stopped', {
        durationMs: stopped.durationMs,
        frames: stopped.frames,
        stoppedBy: this.stopReason,
      })

      if (stopped.durationMs < MIN_DURATION_MS) {
        await rm(this.projectDir, { recursive: true, force: true })
        logger.info('recording.discarded', { reason: 'too_short' })
        return this.succeed({
          discarded: 'too_short',
          stoppedBy: this.stopReason,
          durationMs: stopped.durationMs,
        })
      }

      try {
        await stat(this.init.partial)
      } catch {
        throw new RecordingError('output_missing', 'the helper left no video file')
      }
      await renameWithRetry(this.init.partial, join(this.projectDir, SCREEN_FILE))

      const project = createProject({
        id: this.projectId,
        name: this.request.name,
        source: this.source,
        durationMs: Math.round(stopped.durationMs),
        createdAt: this.init.createdAt,
        ...(this.request.style ? { style: this.request.style } : {}),
        ...(this.request.cursor ? { cursor: this.request.cursor } : {}),
      })
      await saveProject(store, project)
      await clearRecordingMarker(store, this.projectId)
      return this.succeed({ project, stoppedBy: this.stopReason, frames: stopped.frames })
    } catch (error) {
      // keep the folder (marker + partial): recovery offers it on the next launch
      const failure = toRecordingError(error, 'internal')
      this.fail(failure)
      throw failure
    }
  }

  private succeed(result: RecordingResult): RecordingResult {
    this.currentState = 'finished'
    this.resolveDone(result)
    this.emit({ type: 'finished', result })
    return result
  }

  private fail(error: RecordingError): void {
    if (this.currentState === 'failed' || this.currentState === 'finished') return
    clearTimeout(this.stopTimer)
    this.currentState = 'failed'
    this.deps.logger.error('recording.failed', { code: error.code, message: error.message })
    this.rejectDone(error)
    this.emit({ type: 'failed', error })
  }

  private emit(status: RecordingStatus): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(status)
      } catch (error) {
        this.deps.logger.error('recording.listener_failed', { error })
      }
    }
  }
}
