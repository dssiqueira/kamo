// Microphone and computer sound (F-04, D-024). Audio is recorded in Electron, by a hidden and
// sandboxed renderer page (src/renderer/audio-recorder.html), not by the native capture
// helper: getUserMedia for the microphone, getDisplayMedia loopback for the computer sound
// (Windows), MediaRecorder for both. That page also feeds the Home level meters.
//
// This service owns that window, forwards devices/levels to Home, and streams the recorded
// chunks to temp files that RecordingController moves into the project once it is saved.
import type { BrowserWindow, WebContents } from 'electron'
import { mkdir, open, rm, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/api.ts'
import type {
  AudioLevels,
  AudioSources,
  AudioStatus,
  AudioSupport,
  AudioTrackName,
  AudioWarning,
  RecorderCommand,
  RecorderReport,
} from '../../shared/audio.ts'
import { hasAnySource } from './model.ts'

/** How long stop waits for the recorder page to hand over the last chunks. */
const STOP_TIMEOUT_MS = 5000
/** How long a fresh recorder page has to load and say `ready`. */
const READY_TIMEOUT_MS = 10_000

export interface AudioLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

export interface AudioServiceOptions {
  support: AudioSupport
  /** Creates the hidden recorder window (`createAppWindow('audio-recorder', ...)`). */
  createWindow(): BrowserWindow
  /** Folder for in-progress recordings (cleared on start; nothing is kept there). */
  tempDir: string
  log: AudioLogger
  onStatus(status: AudioStatus): void
  onLevels(levels: AudioLevels): void
  newId?: () => string
}

/** One recorded track, still in the temp folder. */
export interface RecordedTrack {
  track: AudioTrackName
  path: string
  mimeType: string
  /** `Date.now()` in the recorder when MediaRecorder started. */
  startedAt: number
  bytes: number
}

export interface AudioTake {
  tracks: RecordedTrack[]
  warnings: AudioWarning[]
  /** Deletes the temp files (discarded or failed recording, or after they were moved). */
  discard(): Promise<void>
}

export interface AudioSession {
  pause(): Promise<void>
  resume(): Promise<void>
  /** Stops the recorders and closes the files. Never rejects. */
  stop(): Promise<AudioTake>
}

interface TrackState {
  handle: FileHandle
  path: string
  bytes: number
  writes: Promise<void>
  writeFailed: boolean
  startedAt?: number
  mimeType?: string
  failed?: 'denied' | 'unavailable'
  lost: boolean
  stopped: boolean
}

const offStatus = (support: AudioSupport, devices: AudioStatus['devices'] = []): AudioStatus => ({
  devices,
  mic: 'off',
  system: support.system ? 'off' : 'unsupported',
})

export class AudioService {
  private window: BrowserWindow | undefined
  private ready: Promise<void> | undefined
  private markReady: (() => void) | undefined
  private monitor: AudioSources | null = null
  private status: AudioStatus
  private recording: ActiveRecording | undefined
  private cleaned: Promise<void> | undefined

  constructor(private readonly options: AudioServiceOptions) {
    this.status = offStatus(options.support)
  }

  get lastStatus(): AudioStatus {
    return this.status
  }

  /** Whether a web contents is the recorder page this service opened. */
  isRecorder(contents: WebContents): boolean {
    return (
      this.window !== undefined &&
      !this.window.isDestroyed() &&
      this.window.webContents === contents
    )
  }

  /** Home meters: opens these sources, or closes everything (null or all off). */
  async setMonitor(sources: AudioSources | null): Promise<void> {
    const sanitized = sources && this.sanitize(sources)
    this.monitor = sanitized && hasAnySource(sanitized) ? sanitized : null
    if (this.recording) return
    if (!this.monitor) {
      this.closeWindow()
      return
    }
    await this.send({ type: 'configure', sources: this.monitor })
  }

  /**
   * Countdown: opens the sources of the coming recording now, so the 3 seconds cover the
   * device start-up (a cold microphone plus loopback takes ~1-2s on Windows).
   */
  async prepare(sources: AudioSources): Promise<void> {
    const wanted = this.sanitize(sources)
    if (this.recording || !hasAnySource(wanted)) return
    await this.send({ type: 'configure', sources: wanted })
  }

  /** Countdown cancelled: back to what Home shows. */
  async restore(): Promise<void> {
    if (!this.recording) await this.setMonitor(this.monitor)
  }

  /**
   * Starts recording the enabled sources; null when there is nothing to record. Does not wait
   * for the devices: the offsets recorded at each track's start keep everything in sync.
   */
  async begin(sources: AudioSources): Promise<AudioSession | null> {
    const wanted = this.sanitize(sources)
    if (!hasAnySource(wanted) || this.recording) return null
    this.cleaned ??= rm(this.options.tempDir, { recursive: true, force: true }).catch(() => {})
    await this.cleaned
    const dir = join(this.options.tempDir, (this.options.newId ?? (() => crypto.randomUUID()))())
    await mkdir(dir, { recursive: true })
    const tracks = new Map<AudioTrackName, TrackState>()
    for (const track of ['mic', 'system'] as const) {
      if (!wanted[track]) continue
      const path = join(dir, `${track}.part`)
      tracks.set(track, {
        handle: await open(path, 'w'),
        path,
        bytes: 0,
        writes: Promise.resolve(),
        writeFailed: false,
        lost: false,
        stopped: false,
      })
    }
    const recording = new ActiveRecording(dir, tracks, this.options.log)
    this.recording = recording
    try {
      await this.send({ type: 'start', sources: wanted })
    } catch (error) {
      this.options.log.error('audio.start.failed', { error })
      recording.crashed = true
      recording.settle()
    }
    this.options.log.info('audio.recording.requested', { mic: wanted.mic, system: wanted.system })

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
        // Back to what Home shows (or close the devices if Home has nothing on).
        void this.setMonitor(this.monitor).catch(() => {})
        return take
      },
    }
  }

  /** A report from the recorder page (already validated). */
  handleReport(report: RecorderReport): void {
    switch (report.type) {
      case 'ready':
        this.markReady?.()
        break
      case 'status':
        this.status = {
          ...report.status,
          // Never claim computer sound where it cannot be recorded.
          system: this.options.support.system ? report.status.system : 'unsupported',
        }
        this.options.onStatus(this.status)
        break
      case 'levels':
        this.options.onLevels(report.levels)
        break
      default:
        this.recording?.handleReport(report)
        break
    }
  }

  /** One MediaRecorder chunk, in order, from the recorder page. */
  writeChunk(track: AudioTrackName, bytes: Uint8Array): Promise<void> {
    return this.recording?.write(track, bytes) ?? Promise.resolve()
  }

  /** App quit or tests: closes the window (an active recording is stopped by its owner). */
  dispose(): void {
    this.closeWindow(true)
  }

  private sanitize(sources: AudioSources): AudioSources {
    return { ...sources, system: sources.system && this.options.support.system }
  }

  private async send(command: RecorderCommand): Promise<void> {
    const window = this.ensureWindow()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('audio recorder did not load')), READY_TIMEOUT_MS)
    })
    try {
      await Promise.race([this.ready, timeout])
    } finally {
      clearTimeout(timer)
    }
    if (window.isDestroyed()) throw new Error('audio recorder window is gone')
    window.webContents.send(IpcChannel.audioCommand, command)
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const window = this.options.createWindow()
    // Hidden window: its timers (level meters) must not be throttled.
    window.webContents.setBackgroundThrottling(false)
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      this.options.log.error('audio.recorder.gone', { reason: details.reason })
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
      this.status = offStatus(this.options.support, this.status.devices)
      this.options.onStatus(this.status)
      this.options.onLevels({ mic: 0, system: 0 })
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

  constructor(
    readonly dir: string,
    private readonly tracks: Map<AudioTrackName, TrackState>,
    private readonly log: AudioLogger,
  ) {}

  handleReport(report: RecorderReport): void {
    if (!('track' in report)) return
    const state = this.tracks.get(report.track)
    if (!state) return
    switch (report.type) {
      case 'started':
        state.startedAt = report.at
        state.mimeType = report.mimeType
        this.log.info('audio.track.started', { track: report.track, mimeType: report.mimeType })
        break
      case 'failed':
        state.failed = report.reason
        this.log.warn('audio.track.failed', { track: report.track, reason: report.reason })
        break
      case 'lost':
        state.lost = true
        this.log.warn('audio.track.lost', { track: report.track })
        break
      case 'stopped':
        state.stopped = true
        if ([...this.tracks.values()].every((t) => t.stopped)) this.settle()
        break
    }
  }

  write(track: AudioTrackName, bytes: Uint8Array): Promise<void> {
    const state = this.tracks.get(track)
    if (!state || state.stopped || state.writeFailed) return Promise.resolve()
    state.writes = state.writes.then(async () => {
      try {
        let offset = 0
        while (offset < bytes.byteLength) {
          const { bytesWritten } = await state.handle.write(bytes, offset)
          offset += bytesWritten
        }
        state.bytes += bytes.byteLength
      } catch (error) {
        state.writeFailed = true
        this.log.error('audio.write.failed', { track, error })
      }
    })
    return state.writes
  }

  /** Wakes up `finish` (all tracks stopped, or the recorder is gone). */
  settle(): void {
    this.settled = true
    this.wake?.()
  }

  async finish(timeoutMs: number): Promise<AudioTake> {
    if (!this.settled) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs)
        this.wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
    if (!this.settled) this.log.warn('audio.stop.timeout', { timeoutMs })
    const tracks: RecordedTrack[] = []
    const warnings = new Set<AudioWarning>()
    for (const [track, state] of this.tracks) {
      await state.writes
      await state.handle.close().catch(() => {})
      const usable =
        state.startedAt !== undefined && state.mimeType !== undefined && state.bytes > 0
      if (usable) {
        tracks.push({
          track,
          path: state.path,
          mimeType: state.mimeType ?? '',
          startedAt: state.startedAt ?? 0,
          bytes: state.bytes,
        })
      }
      if (track === 'mic') {
        if (!usable) warnings.add('mic_unavailable')
        else if (state.lost) warnings.add('mic_lost')
      } else if (!usable) {
        warnings.add('system_unavailable')
      }
      if (state.writeFailed || (this.crashed && usable)) warnings.add('audio_failed')
    }
    this.log.info('audio.recording.finished', {
      tracks: tracks.map((t) => ({ track: t.track, bytes: t.bytes })),
      warnings: [...warnings],
    })
    return {
      tracks,
      warnings: [...warnings],
      discard: () => rm(this.dir, { recursive: true, force: true }).catch(() => {}),
    }
  }
}
