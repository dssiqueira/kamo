// Drives a recording from the Record button to Stop (flows.md §3–4, F-01, F-02):
// idle → countdown → recording ⇄ paused → stopping → idle.
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { IpcChannel, type RecordingClock, type RecordingStatus } from '../shared/api.ts'
import type { AudioWarning } from '../shared/audio.ts'
import { DEFAULT_STOP_SHORTCUT } from './accelerator.ts'
import type { AudioSession, AudioTake } from './audio/service.ts'
import { RecordingTray, type TrayLabels } from './recording-tray.ts'
import { createAppWindow } from './windows.ts'

/** The default; Settings can change it (F-15), so the controller reads it through a getter. */
export const STOP_SHORTCUT = DEFAULT_STOP_SHORTCUT
const COUNTDOWN_SECONDS = 3
const BAR_WIDTH = 440
const BAR_HEIGHT = 64
const BAR_BOTTOM_MARGIN = 48

/** What actually records. The native helper implements it (D-023). */
export interface RecordingBackend {
  start(displayId: string): Promise<BackendSession>
}

export interface BackendSession {
  readonly fps: number
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<BackendResult>
  /** The backend ended the recording by itself (display lost, disk full, crash). */
  onEnded(listener: (result: BackendResult) => void): void
}

export type BackendResult =
  | { kind: 'saved'; projectId: string; warning?: 'display_lost' | 'disk_full' }
  | { kind: 'discarded'; reason: 'too_short' }
  | { kind: 'failed'; code: string }

/**
 * Microphone and computer sound alongside the video (F-04, src/main/audio, D-024). Audio is
 * recorded in Electron, so it starts, pauses and stops in step with the helper here.
 */
export interface RecordingAudio {
  /** Countdown started: open the devices early so the recording starts warm. */
  prepare(): Promise<void>
  /** Countdown cancelled. */
  cancel(): Promise<void>
  /** Starts the enabled sources (Home toggles); null when none is on. Never waits for devices. */
  begin(): Promise<AudioSession | null>
  /** Moves the audio into the saved project with its offset; returns warnings for Home. */
  attach(projectId: string, take: AudioTake, videoStartedAt: number): Promise<AudioWarning[]>
}

type State =
  | { name: 'idle' }
  | {
      name: 'countdown'
      displayId: string
      /** Where the user was when they pressed Record: the floating bar opens there. */
      controlDisplayId: number
      window: BrowserWindow
      timer: NodeJS.Timeout
    }
  | {
      name: 'recording'
      session: BackendSession
      bar: BrowserWindow
      clock: RecordingClock
      /** Resolves once the audio recorder was asked to start (null: no audio). */
      audio: Promise<AudioSession | null>
      /** `Date.now()` when the helper confirmed the first frame: video time 0. */
      videoStartedAt: number
    }
  | { name: 'stopping' }

export class RecordingController {
  private state: State = { name: 'idle' }

  constructor(
    private readonly backend: RecordingBackend,
    private readonly mainWindow: () => BrowserWindow | undefined,
    private readonly log: { info(e: string, d?: object): void; error(e: string, d?: object): void },
    /** A new project is on disk (Home refreshes its list). */
    private readonly onSaved: (projectId: string) => void = () => {},
    /** The global stop shortcut to register on start (the setting, F-15). */
    private readonly stopShortcut: () => string = () => STOP_SHORTCUT,
    /** Microphone and computer sound (F-04). Omitted: video only. */
    private readonly audio?: RecordingAudio,
    /** Tray menu texts in the UI language. Omitted: no tray icon. */
    trayLabels?: () => TrayLabels,
  ) {
    this.tray = trayLabels
      ? new RecordingTray(
          trayLabels,
          {
            pause: () => void this.pause(),
            resume: () => void this.resume(),
            stop: () => void this.stop(),
          },
          () => (this.state.name === 'recording' ? elapsedNow(this.state.clock) : 0),
        )
      : null
  }

  private readonly tray: RecordingTray | null

  /** The stop shortcut registered for the current recording (null when none). */
  private registeredShortcut: string | null = null

  /** Record button: hides the app and shows the 3-2-1 on the chosen display. */
  start(displayId: string): void {
    if (this.state.name !== 'idle') return
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    if (!display) return this.report({ kind: 'error', code: 'display_not_found' })

    // The bar goes where the user is looking (the monitor with Kamo's window), which may not be
    // the one being recorded. It is excluded from capture either way.
    const main = this.mainWindow()
    const controlDisplayId = (
      main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()
    ).id
    main?.hide()
    const window = createAppWindow('countdown', {
      ...display.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
    })
    window.setAlwaysOnTop(true, 'screen-saver')
    // Never part of the video, even if capture starts a little early.
    window.setContentProtection(true)
    window.once('ready-to-show', () => window.focus())
    // Safety net if the countdown page never reports back.
    const timer = setTimeout(() => void this.countdownDone(), (COUNTDOWN_SECONDS + 2) * 1000)
    this.state = { name: 'countdown', displayId, controlDisplayId, window, timer }
    void this.audio?.prepare().catch((error: unknown) => {
      this.log.error('recording.audio.prepare.failed', { error })
    })
  }

  /** Esc during the countdown: back to Home, no project created (F-01). */
  cancelCountdown(): void {
    if (this.state.name !== 'countdown') return
    clearTimeout(this.state.timer)
    this.state.window.destroy()
    this.state = { name: 'idle' }
    void this.audio?.cancel().catch(() => {})
    this.showMain()
  }

  async countdownDone(): Promise<void> {
    if (this.state.name !== 'countdown') return
    const { displayId, controlDisplayId, window, timer } = this.state
    clearTimeout(timer)
    window.destroy()
    this.state = { name: 'stopping' }

    // Audio starts alongside the helper (not after it), so it covers the first frame; the
    // offset between the two starts goes into project.json (F-04 sync).
    const audio = this.beginAudio()
    let session: BackendSession
    try {
      session = await this.backend.start(displayId)
    } catch (error) {
      this.log.error('recording.start.failed', { error })
      this.state = { name: 'idle' }
      void audio.then((a) => a?.stop()).then((take) => take?.discard())
      return this.report({ kind: 'error', code: errorCode(error) })
    }
    const videoStartedAt = Date.now()

    const bar = this.openBar(controlDisplayId)
    const clock: RecordingClock = {
      state: 'recording',
      elapsedMs: 0,
      at: Date.now(),
      fps: session.fps,
    }
    this.state = { name: 'recording', session, bar, clock, audio, videoStartedAt }
    session.onEnded((result) => void this.finish(result))
    const stopShortcut = this.stopShortcut()
    if (globalShortcut.register(stopShortcut, () => void this.stop())) {
      this.registeredShortcut = stopShortcut
    }
    this.sendClock()
    this.tray?.show()
    this.log.info('recording.started', { fps: session.fps })
  }

  async pause(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'paused') return
    const { session, clock, audio } = this.state
    // Both at once, so the audio pauses as close as possible to the video.
    await Promise.all([session.pause(), audio.then((a) => a?.pause())])
    if (this.state.name !== 'recording') return
    this.state.clock = { ...clock, state: 'paused', elapsedMs: elapsedNow(clock), at: Date.now() }
    this.sendClock()
    this.tray?.setPaused(true)
  }

  async resume(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'recording') return
    const { session, audio } = this.state
    await Promise.all([session.resume(), audio.then((a) => a?.resume())])
    if (this.state.name !== 'recording') return
    this.state.clock = { ...this.state.clock, state: 'recording', at: Date.now() }
    this.sendClock()
    this.tray?.setPaused(false)
  }

  async stop(): Promise<void> {
    if (this.state.name !== 'recording') return
    const { session } = this.state
    let result: BackendResult
    try {
      result = await session.stop()
    } catch (error) {
      this.log.error('recording.stop.failed', { error })
      result = { kind: 'failed', code: errorCode(error) }
    }
    await this.finish(result)
  }

  isRecording(): boolean {
    return this.state.name === 'recording'
  }

  /** Settings: the shortcut Kamo holds right now is free for Kamo to keep. */
  activeStopShortcut(): string | null {
    return this.registeredShortcut
  }

  getClock(): RecordingClock | null {
    return this.state.name === 'recording' ? this.state.clock : null
  }

  private async finish(result: BackendResult): Promise<void> {
    if (this.state.name !== 'recording') return
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut)
    this.registeredShortcut = null
    const { audio, videoStartedAt } = this.state
    this.state.bar.destroy()
    this.tray?.hide()
    this.state = { name: 'idle' }
    this.log.info('recording.finished', { kind: result.kind })
    const audioWarnings = await this.finishAudio(audio, result, videoStartedAt)
    if (result.kind === 'saved') this.onSaved(result.projectId)
    this.report(
      result.kind === 'saved'
        ? {
            kind: 'saved',
            projectId: result.projectId,
            ...(result.warning ? { warning: result.warning } : {}),
            ...(audioWarnings.length ? { audioWarnings } : {}),
          }
        : result.kind === 'discarded'
          ? { kind: 'error', code: 'too_short' }
          : { kind: 'error', code: result.code },
    )
  }

  /** Never rejects: audio problems never cost the video. */
  private beginAudio(): Promise<AudioSession | null> {
    if (!this.audio) return Promise.resolve(null)
    return this.audio.begin().catch((error: unknown) => {
      this.log.error('recording.audio.start.failed', { error })
      return null
    })
  }

  /** Stops the audio; a saved recording gets it, anything else deletes it. */
  private async finishAudio(
    audio: Promise<AudioSession | null>,
    result: BackendResult,
    videoStartedAt: number,
  ): Promise<AudioWarning[]> {
    const take = await audio.then((a) => a?.stop() ?? null).catch(() => null)
    if (!take) return []
    if (result.kind !== 'saved' || !this.audio) {
      await take.discard()
      return []
    }
    return this.audio.attach(result.projectId, take, videoStartedAt).catch((error: unknown) => {
      this.log.error('recording.audio.attach.failed', { error })
      return ['audio_failed' as const]
    })
  }

  private openBar(displayId: number): BrowserWindow {
    const display =
      screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
    const { x, y, width, height } = display.workArea
    const bar = createAppWindow('recording-bar', {
      x: Math.round(x + (width - BAR_WIDTH) / 2),
      y: y + height - BAR_HEIGHT - BAR_BOTTOM_MARGIN,
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: true,
    })
    bar.setAlwaysOnTop(true, 'screen-saver')
    // Excluded from capture (Windows: WDA_EXCLUDEFROMCAPTURE; Mac: the helper also filters
    // out Kamo's own windows). F-02: the bar never shows in the video.
    bar.setContentProtection(true)
    bar.webContents.on('did-finish-load', () => this.sendClock())
    return bar
  }

  private sendClock(): void {
    if (this.state.name !== 'recording') return
    this.state.bar.webContents.send(IpcChannel.recordingClock, this.state.clock)
  }

  private report(status: RecordingStatus): void {
    this.showMain()
    this.mainWindow()?.webContents.send(IpcChannel.recordingStatus, status)
  }

  private showMain(): void {
    const main = this.mainWindow()
    main?.show()
    main?.focus()
  }
}

function elapsedNow(clock: RecordingClock): number {
  return clock.state === 'recording' ? clock.elapsedMs + (Date.now() - clock.at) : clock.elapsedMs
}

function errorCode(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'failed'
}
