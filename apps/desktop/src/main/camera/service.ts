// Webcam recording (A-03). Like the microphone (D-024), the camera is recorded in Electron by a
// hidden, sandboxed renderer page (src/renderer/camera-recorder.html): getUserMedia for the
// camera, MediaRecorder for the file. It is a page of its own, apart from the audio recorder,
// so a camera or video encoder that fails never takes the audio down with it.
//
// This service owns that window and streams the recorded chunks to a temp file that
// RecordingController moves into the project once it is saved. The window only exists from
// the countdown to the end of the recording: the camera light is never on otherwise (Home's
// preview is Home's own stream).
import type { BrowserWindow, WebContents } from 'electron'
import { mkdir, open, rm, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/api.ts'
import type {
  CameraCommand,
  CameraReport,
  CameraSource,
  CameraWarning,
} from '../../shared/camera.ts'

/** How long stop waits for the recorder page to hand over the last chunks. */
const STOP_TIMEOUT_MS = 5000
/** How long a fresh recorder page has to load and say `ready`. */
const READY_TIMEOUT_MS = 10_000

export interface CameraLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

export interface CameraServiceOptions {
  /** Creates the hidden recorder window (`createAppWindow('camera-recorder', ...)`). */
  createWindow(): BrowserWindow
  /** Folder for in-progress recordings (cleared on start; nothing is kept there). */
  tempDir: string
  log: CameraLogger
  newId?: () => string
}

/** The recorded camera, still in the temp folder. */
export interface RecordedCamera {
  path: string
  mimeType: string
  /** `Date.now()` in the recorder when MediaRecorder started. */
  startedAt: number
  bytes: number
  width: number
  height: number
}

export interface CameraTake {
  /** Null when nothing usable was recorded. */
  video: RecordedCamera | null
  warnings: CameraWarning[]
  /** Deletes the temp files (discarded or failed recording, or after they were moved). */
  discard(): Promise<void>
}

export interface CameraSession {
  pause(): Promise<void>
  resume(): Promise<void>
  /** Stops the recorder and closes the file. Never rejects. */
  stop(): Promise<CameraTake>
}

export class CameraService {
  private window: BrowserWindow | undefined
  private ready: Promise<void> | undefined
  private markReady: (() => void) | undefined
  private recording: ActiveRecording | undefined
  private cleaned: Promise<void> | undefined

  constructor(private readonly options: CameraServiceOptions) {}

  /** Whether a web contents is the recorder page this service opened. */
  isRecorder(contents: WebContents): boolean {
    return (
      this.window !== undefined &&
      !this.window.isDestroyed() &&
      this.window.webContents === contents
    )
  }

  /** Countdown: opens the camera now, so the 3 seconds cover its start-up. */
  async prepare(source: CameraSource): Promise<void> {
    if (this.recording || !source.enabled) return
    await this.send({ type: 'prepare', source })
  }

  /** Countdown cancelled: the camera goes off again. */
  restore(): Promise<void> {
    if (!this.recording) this.closeWindow()
    return Promise.resolve()
  }

  /**
   * Starts recording the camera; null when it is off. Does not wait for the device: the
   * offset recorded at the recorder's start keeps it in sync with the video.
   */
  async begin(source: CameraSource): Promise<CameraSession | null> {
    if (!source.enabled || this.recording) return null
    this.cleaned ??= rm(this.options.tempDir, { recursive: true, force: true }).catch(() => {})
    await this.cleaned
    const dir = join(this.options.tempDir, (this.options.newId ?? (() => crypto.randomUUID()))())
    await mkdir(dir, { recursive: true })
    const path = join(dir, 'webcam.part')
    const recording = new ActiveRecording(dir, path, await open(path, 'w'), this.options.log)
    this.recording = recording
    try {
      await this.send({ type: 'start', source })
    } catch (error) {
      this.options.log.error('camera.start.failed', { error })
      recording.crashed = true
      recording.settle()
    }
    this.options.log.info('camera.recording.requested', { device: source.deviceId !== null })

    return {
      pause: async () => {
        if (this.recording === recording) await this.send({ type: 'pause' }).catch(() => {})
      },
      resume: async () => {
        if (this.recording === recording) await this.send({ type: 'resume' }).catch(() => {})
      },
      stop: async () => {
        if (this.recording === recording && !recording.crashed) {
          await this.send({ type: 'stop' }).catch(() => recording.settle())
        }
        const take = await recording.finish(STOP_TIMEOUT_MS)
        if (this.recording === recording) this.recording = undefined
        // The camera goes off with the recording.
        this.closeWindow()
        return take
      },
    }
  }

  /** A report from the recorder page (already validated). */
  handleReport(report: CameraReport): void {
    if (report.type === 'ready') this.markReady?.()
    else this.recording?.handleReport(report)
  }

  /** One MediaRecorder chunk, in order, from the recorder page. */
  writeChunk(bytes: Uint8Array): Promise<void> {
    return this.recording?.write(bytes) ?? Promise.resolve()
  }

  /** App quit or tests: closes the window (an active recording is stopped by its owner). */
  dispose(): void {
    this.closeWindow(true)
  }

  private async send(command: CameraCommand): Promise<void> {
    const window = this.ensureWindow()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('camera recorder did not load')), READY_TIMEOUT_MS)
    })
    try {
      await Promise.race([this.ready, timeout])
    } finally {
      clearTimeout(timer)
    }
    if (window.isDestroyed()) throw new Error('camera recorder window is gone')
    window.webContents.send(IpcChannel.cameraCommand, command)
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const window = this.options.createWindow()
    // Hidden window: its recorder must not be throttled.
    window.webContents.setBackgroundThrottling(false)
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      this.options.log.error('camera.recorder.gone', { reason: details.reason })
      if (this.recording) {
        this.recording.crashed = true
        this.recording.settle()
      }
      this.markReady?.()
      if (!window.isDestroyed()) window.destroy()
    })
    window.on('closed', () => {
      if (this.window !== window) return
      this.window = undefined
      this.markReady?.()
    })
    this.window = window
    return window
  }

  private closeWindow(force = false): void {
    if (this.recording && !force) return
    const window = this.window
    if (window && !window.isDestroyed()) window.destroy()
  }
}

/** The chunks and timestamps of one recording, until it is moved into a project. */
class ActiveRecording {
  crashed = false
  private settled = false
  private wake: (() => void) | undefined
  private bytes = 0
  private writes: Promise<void> = Promise.resolve()
  private writeFailed = false
  private started: { at: number; mimeType: string; width: number; height: number } | undefined
  private lost = false
  private stopped = false

  constructor(
    readonly dir: string,
    private readonly path: string,
    private readonly handle: FileHandle,
    private readonly log: CameraLogger,
  ) {}

  handleReport(report: Exclude<CameraReport, { type: 'ready' }>): void {
    switch (report.type) {
      case 'started':
        this.started = report
        this.log.info('camera.started', {
          mimeType: report.mimeType,
          width: report.width,
          height: report.height,
        })
        break
      case 'failed':
        this.log.warn('camera.failed', { reason: report.reason })
        break
      case 'lost':
        this.lost = true
        this.log.warn('camera.lost')
        break
      case 'stopped':
        this.stopped = true
        this.settle()
        break
    }
  }

  write(bytes: Uint8Array): Promise<void> {
    if (this.stopped || this.writeFailed) return Promise.resolve()
    this.writes = this.writes.then(async () => {
      try {
        let offset = 0
        while (offset < bytes.byteLength) {
          const { bytesWritten } = await this.handle.write(bytes, offset)
          offset += bytesWritten
        }
        this.bytes += bytes.byteLength
      } catch (error) {
        this.writeFailed = true
        this.log.error('camera.write.failed', { error })
      }
    })
    return this.writes
  }

  /** Wakes up `finish` (stopped, or the recorder is gone). */
  settle(): void {
    this.settled = true
    this.wake?.()
  }

  async finish(timeoutMs: number): Promise<CameraTake> {
    if (!this.settled) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs)
        this.wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
    if (!this.settled) this.log.warn('camera.stop.timeout', { timeoutMs })
    await this.writes
    await this.handle.close().catch(() => {})
    const started = this.started
    const usable = started !== undefined && this.bytes > 0
    const warnings: CameraWarning[] = []
    // What was written before a failure is still complete fragments: keep it, and warn.
    if (!usable)
      warnings.push(this.writeFailed || this.crashed ? 'camera_failed' : 'camera_unavailable')
    else if (this.writeFailed || this.crashed) warnings.push('camera_failed')
    else if (this.lost) warnings.push('camera_lost')
    this.log.info('camera.recording.finished', { bytes: this.bytes, warnings })
    return {
      video:
        usable && started
          ? {
              path: this.path,
              mimeType: started.mimeType,
              startedAt: started.at,
              bytes: this.bytes,
              width: started.width,
              height: started.height,
            }
          : null,
      warnings,
      discard: () => rm(this.dir, { recursive: true, force: true }).catch(() => {}),
    }
  }
}
