// Drives a recording from the Record button to Stop (flows.md §3–4, F-01, F-02):
// idle → countdown → recording ⇄ paused → stopping → idle.
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { IpcChannel, type RecordingClock, type RecordingStatus } from '../shared/api.ts'
import { createAppWindow } from './windows.ts'

export const STOP_SHORTCUT = 'CommandOrControl+Shift+2'
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

type State =
  | { name: 'idle' }
  | { name: 'countdown'; displayId: string; window: BrowserWindow; timer: NodeJS.Timeout }
  | { name: 'recording'; session: BackendSession; bar: BrowserWindow; clock: RecordingClock }
  | { name: 'stopping' }

export class RecordingController {
  private state: State = { name: 'idle' }

  constructor(
    private readonly backend: RecordingBackend,
    private readonly mainWindow: () => BrowserWindow | undefined,
    private readonly log: { info(e: string, d?: object): void; error(e: string, d?: object): void },
  ) {}

  /** Record button: hides the app and shows the 3-2-1 on the chosen display. */
  start(displayId: string): void {
    if (this.state.name !== 'idle') return
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    if (!display) return this.report({ kind: 'error', code: 'display_not_found' })

    this.mainWindow()?.hide()
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
    this.state = { name: 'countdown', displayId, window, timer }
  }

  /** Esc during the countdown: back to Home, no project created (F-01). */
  cancelCountdown(): void {
    if (this.state.name !== 'countdown') return
    clearTimeout(this.state.timer)
    this.state.window.destroy()
    this.state = { name: 'idle' }
    this.showMain()
  }

  async countdownDone(): Promise<void> {
    if (this.state.name !== 'countdown') return
    const { displayId, window, timer } = this.state
    clearTimeout(timer)
    window.destroy()
    this.state = { name: 'stopping' }

    let session: BackendSession
    try {
      session = await this.backend.start(displayId)
    } catch (error) {
      this.log.error('recording.start.failed', { error })
      this.state = { name: 'idle' }
      return this.report({ kind: 'error', code: errorCode(error) })
    }

    const bar = this.openBar(displayId)
    const clock: RecordingClock = {
      state: 'recording',
      elapsedMs: 0,
      at: Date.now(),
      fps: session.fps,
    }
    this.state = { name: 'recording', session, bar, clock }
    session.onEnded((result) => void this.finish(result))
    globalShortcut.register(STOP_SHORTCUT, () => void this.stop())
    this.sendClock()
    this.log.info('recording.started', { fps: session.fps })
  }

  async pause(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'paused') return
    const { session, clock } = this.state
    await session.pause()
    this.state.clock = { ...clock, state: 'paused', elapsedMs: elapsedNow(clock), at: Date.now() }
    this.sendClock()
  }

  async resume(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'recording') return
    await this.state.session.resume()
    this.state.clock = { ...this.state.clock, state: 'recording', at: Date.now() }
    this.sendClock()
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

  getClock(): RecordingClock | null {
    return this.state.name === 'recording' ? this.state.clock : null
  }

  private async finish(result: BackendResult): Promise<void> {
    if (this.state.name !== 'recording') return
    globalShortcut.unregister(STOP_SHORTCUT)
    this.state.bar.destroy()
    this.state = { name: 'idle' }
    this.log.info('recording.finished', { kind: result.kind })
    this.report(
      result.kind === 'saved'
        ? {
            kind: 'saved',
            projectId: result.projectId,
            ...(result.warning ? { warning: result.warning } : {}),
          }
        : result.kind === 'discarded'
          ? { kind: 'error', code: 'too_short' }
          : { kind: 'error', code: result.code },
    )
  }

  private openBar(displayId: string): BrowserWindow {
    const display =
      screen.getAllDisplays().find((d) => String(d.id) === displayId) ?? screen.getPrimaryDisplay()
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
