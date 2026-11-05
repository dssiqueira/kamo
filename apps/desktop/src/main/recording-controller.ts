// Drives a recording from the Record button to Stop (flows.md §3–4, F-01, F-02):
// idle → countdown → recording ⇄ paused → stopping → idle.
import { borderWindow } from '@kamo/ui/selection'
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { IpcChannel, type RecordingClock, type RecordingStatus } from '../shared/api.ts'
import type { AudioWarning } from '../shared/audio.ts'
import type { CameraWarning } from '../shared/camera.ts'
import type { CaptureTarget } from '../shared/capture.ts'
import { DEFAULT_STOP_SHORTCUT } from './accelerator.ts'
import type { AudioSession, AudioTake } from './audio/service.ts'
import type { CameraSession, CameraTake } from './camera/service.ts'
import { RecordingTray, type TrayLabels } from './recording-tray.ts'
import { sendTo } from './safe-send.ts'
import { createAppWindow } from './windows.ts'

/** The default; Settings can change it (F-15), so the controller reads it through a getter. */
export const STOP_SHORTCUT = DEFAULT_STOP_SHORTCUT
const COUNTDOWN_SECONDS = 3
const BAR_WIDTH = 440
const BAR_HEIGHT = 64
const BAR_BOTTOM_MARGIN = 48
/** A bar that keeps dying is not brought back forever: the tray and the shortcut still stop. */
const MAX_BAR_RECREATIONS = 5
/** A-08: the line around a recorded selection (DIP), as the frame draws it (SELECTION_BORDER). */
const SELECTION_LINE = 2

/** What actually records. The native helper implements it (D-023). */
export interface RecordingBackend {
  /** A display, a window or a region (A-08). */
  start(target: CaptureTarget): Promise<BackendSession>
}

export interface BackendSession {
  readonly fps: number
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<BackendResult>
  /** The backend ended the recording by itself (display lost, disk full, crash). */
  onEnded(listener: (result: BackendResult) => void): void
  /**
   * Links the audio and camera temp takes to the recording marker, so a crash of main can
   * still recover them with the video (media-takes.ts). Optional: tests and fakes skip it.
   */
  linkMedia?(media: { videoStartedAt: number; audio?: string; camera?: string }): Promise<void>
}

export type BackendResult =
  | {
      kind: 'saved'
      projectId: string
      warning?: 'display_lost' | 'disk_full' | 'window_lost'
      /** D-024: audio the backend itself was to record (the Mac computer sound). */
      audioWarnings?: AudioWarning[]
    }
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

/**
 * The webcam alongside the video (A-03, src/main/camera). Recorded in Electron like the audio,
 * so it starts, pauses and stops in step with the helper here. It never costs the video.
 */
export interface RecordingCamera {
  prepare(): Promise<void>
  cancel(): Promise<void>
  /** Starts the camera when the Home toggle is on; null otherwise. Never waits for the device. */
  begin(): Promise<CameraSession | null>
  /** Moves webcam.mp4 into the saved project with its offset; returns warnings for Home. */
  attach(projectId: string, take: CameraTake, videoStartedAt: number): Promise<CameraWarning[]>
}

type State =
  | { name: 'idle' }
  | {
      name: 'countdown'
      target: CaptureTarget
      /** Where the user was when they pressed Record: the floating bar opens there. */
      controlDisplayId: number
      window: BrowserWindow
      timer: NodeJS.Timeout
    }
  | {
      name: 'recording'
      session: BackendSession
      bar: BrowserWindow
      /** A-08: the line around a recorded selection (never in the video), or null. */
      border: BrowserWindow | null
      /** Where the bar lives (it is recreated there if its page goes away). */
      controlDisplayId: number
      barRecreations: number
      /** The media link write in progress (stop waits for it), once the takes are known. */
      linkWrite?: Promise<void>
      /** Stop was asked for (the link is no longer written); every caller waits for it. */
      stopping?: Promise<void>
      clock: RecordingClock
      /** Resolves once the audio recorder was asked to start (null: no audio). */
      audio: Promise<AudioSession | null>
      /** Same for the webcam (null: camera off). */
      camera: Promise<CameraSession | null>
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
    /** Webcam (A-03). Omitted: no camera. */
    private readonly camera?: RecordingCamera,
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

  /**
   * Record button: hides the app and shows the 3-2-1 on the chosen display (for a window, the
   * one it was on when listed; A-08).
   */
  start(target: CaptureTarget): void {
    if (this.state.name !== 'idle') return
    const displayId = target.displayId
    const display =
      screen.getAllDisplays().find((d) => String(d.id) === displayId) ??
      (target.kind === 'window' ? screen.getPrimaryDisplay() : undefined)
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
    this.state = { name: 'countdown', target, controlDisplayId, window, timer }
    void this.audio?.prepare().catch((error: unknown) => {
      this.log.error('recording.audio.prepare.failed', { error })
    })
    void this.camera?.prepare().catch((error: unknown) => {
      this.log.error('recording.camera.prepare.failed', { error })
    })
  }

  /** Esc during the countdown: back to Home, no project created (F-01). */
  cancelCountdown(): void {
    if (this.state.name !== 'countdown') return
    clearTimeout(this.state.timer)
    this.state.window.destroy()
    this.state = { name: 'idle' }
    void this.audio?.cancel().catch(() => {})
    void this.camera?.cancel().catch(() => {})
    this.showMain()
  }

  async countdownDone(): Promise<void> {
    if (this.state.name !== 'countdown') return
    const { target, controlDisplayId, window, timer } = this.state
    clearTimeout(timer)
    window.destroy()
    this.state = { name: 'stopping' }

    // Audio starts alongside the helper (not after it), so it covers the first frame; the
    // offset between the two starts goes into project.json (F-04 sync).
    const audio = this.beginAudio()
    const camera = this.beginCamera()
    let session: BackendSession
    try {
      session = await this.backend.start(target)
    } catch (error) {
      this.log.error('recording.start.failed', { error })
      this.state = { name: 'idle' }
      void audio.then((a) => a?.stop()).then((take) => take?.discard())
      void camera.then((c) => c?.stop()).then((take) => take?.discard())
      return this.report({ kind: 'error', code: errorCode(error) })
    }
    const videoStartedAt = Date.now()

    const bar = this.openBar(controlDisplayId)
    const border = target.kind === 'region' ? this.openBorder(target) : null
    const clock: RecordingClock = {
      state: 'recording',
      elapsedMs: 0,
      at: Date.now(),
      fps: session.fps,
    }
    this.state = {
      name: 'recording',
      session,
      bar,
      border,
      controlDisplayId,
      barRecreations: 0,
      clock,
      audio,
      camera,
      videoStartedAt,
    }
    session.onEnded((result) => void this.finish(result))
    void this.linkMedia(session, audio, camera, videoStartedAt)
    const stopShortcut = this.stopShortcut()
    if (globalShortcut.register(stopShortcut, () => void this.stop())) {
      this.registeredShortcut = stopShortcut
    }
    this.sendClock()
    // The controls are UI: if the tray fails, the recording carries on and the bar (or the
    // stop shortcut) still ends it.
    try {
      this.tray?.show()
    } catch (error) {
      this.log.error('recording.tray.failed', { error })
    }
    this.notifyActive(true)
    this.log.info('recording.started', { fps: session.fps })
  }

  async pause(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'paused') return
    const { session, clock, audio, camera } = this.state
    // All at once, so the audio and the camera pause as close as possible to the video.
    await Promise.all([
      session.pause(),
      audio.then((a) => a?.pause()),
      camera.then((c) => c?.pause()),
    ])
    if (this.state.name !== 'recording') return
    this.state.clock = { ...clock, state: 'paused', elapsedMs: elapsedNow(clock), at: Date.now() }
    this.sendClock()
    this.tray?.setPaused(true)
  }

  async resume(): Promise<void> {
    if (this.state.name !== 'recording' || this.state.clock.state === 'recording') return
    const { session, audio, camera } = this.state
    await Promise.all([
      session.resume(),
      audio.then((a) => a?.resume()),
      camera.then((c) => c?.resume()),
    ])
    if (this.state.name !== 'recording') return
    this.state.clock = { ...this.state.clock, state: 'recording', at: Date.now() }
    this.sendClock()
    this.tray?.setPaused(false)
  }

  /** Bar, tray, shortcut or quit; every caller waits for the same stop and save. */
  stop(): Promise<void> {
    if (this.state.name !== 'recording') return Promise.resolve()
    this.state.stopping ??= this.stopSession(this.state.session)
    return this.state.stopping
  }

  private async stopSession(session: BackendSession): Promise<void> {
    // The marker must not be rewritten after the clean stop removed it.
    if (this.state.name === 'recording') await this.state.linkWrite
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

  /** Called when a recording starts and ends (the app tray gives way to the recording one). */
  onRecordingChange(listener: (recording: boolean) => void): () => void {
    this.activeListeners.add(listener)
    return () => this.activeListeners.delete(listener)
  }

  private readonly activeListeners = new Set<(recording: boolean) => void>()

  private notifyActive(recording: boolean): void {
    for (const listener of this.activeListeners) {
      try {
        listener(recording)
      } catch (error) {
        this.log.error('recording.listener.failed', { error })
      }
    }
  }

  getClock(): RecordingClock | null {
    return this.state.name === 'recording' ? this.state.clock : null
  }

  private async finish(result: BackendResult): Promise<void> {
    if (this.state.name !== 'recording') return
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut)
    this.registeredShortcut = null
    const { audio, camera, videoStartedAt, bar, border } = this.state
    // Idle first, so the bar closing below is not taken for a bar that went away.
    this.state = { name: 'idle' }
    if (!bar.isDestroyed()) bar.destroy()
    if (border && !border.isDestroyed()) border.destroy()
    this.tray?.hide()
    this.notifyActive(false)
    this.log.info('recording.finished', { kind: result.kind })
    // Both stop now; they are attached one after the other (each rewrites project.json).
    const cameraTake = this.stopCamera(camera)
    const audioWarnings = [
      ...(result.kind === 'saved' ? (result.audioWarnings ?? []) : []),
      ...(await this.finishAudio(audio, result, videoStartedAt)),
    ]
    const cameraWarnings = await this.finishCamera(cameraTake, result, videoStartedAt)
    if (result.kind === 'saved') this.onSaved(result.projectId)
    this.report(
      result.kind === 'saved'
        ? {
            kind: 'saved',
            projectId: result.projectId,
            ...(result.warning ? { warning: result.warning } : {}),
            ...(audioWarnings.length ? { audioWarnings } : {}),
            ...(cameraWarnings.length ? { cameraWarnings } : {}),
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
    // A failed recording stays on disk for recovery (F-02), and its audio with it (the marker
    // links the take). Anything else not saved has nothing to recover.
    if (result.kind === 'failed') return []
    if (result.kind !== 'saved' || !this.audio) {
      await take.discard()
      return []
    }
    return this.audio.attach(result.projectId, take, videoStartedAt).catch((error: unknown) => {
      this.log.error('recording.audio.attach.failed', { error })
      return ['audio_failed' as const]
    })
  }

  /** Never rejects: camera problems never cost the video. */
  private beginCamera(): Promise<CameraSession | null> {
    if (!this.camera) return Promise.resolve(null)
    return this.camera.begin().catch((error: unknown) => {
      this.log.error('recording.camera.start.failed', { error })
      return null
    })
  }

  private stopCamera(camera: Promise<CameraSession | null>): Promise<CameraTake | null> {
    return camera.then((c) => c?.stop() ?? null).catch(() => null)
  }

  /** A saved recording gets the camera, anything else deletes it. */
  private async finishCamera(
    stopping: Promise<CameraTake | null>,
    result: BackendResult,
    videoStartedAt: number,
  ): Promise<CameraWarning[]> {
    const take = await stopping
    if (!take) return []
    // Kept for recovery with the video, like the audio above.
    if (result.kind === 'failed') return []
    if (result.kind !== 'saved' || !this.camera) {
      await take.discard()
      return []
    }
    return this.camera.attach(result.projectId, take, videoStartedAt).catch((error: unknown) => {
      this.log.error('recording.camera.attach.failed', { error })
      return ['camera_failed' as const]
    })
  }

  /** Never rejects: the link only helps recovery, the recording goes on without it. */
  private async linkMedia(
    session: BackendSession,
    audio: Promise<AudioSession | null>,
    camera: Promise<CameraSession | null>,
    videoStartedAt: number,
  ): Promise<void> {
    if (!session.linkMedia) return
    try {
      const [a, c] = await Promise.all([audio, camera])
      if (!a && !c) return
      const state = this.state
      if (state.name !== 'recording' || state.session !== session || state.stopping) return
      state.linkWrite = session.linkMedia({
        videoStartedAt,
        ...(a ? { audio: a.id } : {}),
        ...(c ? { camera: c.id } : {}),
      })
      await state.linkWrite
    } catch (error) {
      this.log.error('recording.media_link.failed', { error })
    }
  }

  /**
   * The bar's window or page went away mid-recording (crash, closed, a reload that got
   * through): a new one opens where it was, so Pause and Stop stay on screen.
   */
  private replaceBar(old: BrowserWindow, reason: string): void {
    if (this.state.name !== 'recording' || this.state.bar !== old) return
    if (this.state.barRecreations >= MAX_BAR_RECREATIONS) {
      this.log.error('recording.bar.gone', { reason, recreated: false })
      return
    }
    this.state.barRecreations += 1
    this.log.error('recording.bar.gone', { reason, recreated: true })
    try {
      this.state.bar = this.openBar(this.state.controlDisplayId)
    } catch (error) {
      this.log.error('recording.bar.failed', { error })
    }
    if (!old.isDestroyed()) old.destroy()
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
    // Never reload mid-recording (the dev server's full reloads, a stray location.reload).
    bar.webContents.on('will-navigate', (event) => {
      if (this.state.name !== 'recording' || this.state.bar !== bar) return
      event.preventDefault()
      this.log.info('recording.bar.reload_blocked')
    })
    bar.webContents.on('render-process-gone', (_event, details) =>
      this.replaceBar(bar, details.reason),
    )
    bar.on('closed', () => this.replaceBar(bar, 'closed'))
    return bar
  }

  /**
   * A-08: while a selection records, its line stays on screen so the user sees what is
   * captured. Left out of the video like the bar (Windows: WDA_EXCLUDEFROMCAPTURE; Mac: the
   * helper leaves out Kamo's windows) and drawn outside the selection anyway; every click goes
   * through it. Null if the display is gone or the window fails (the recording goes on).
   */
  private openBorder(target: Extract<CaptureTarget, { kind: 'region' }>): BrowserWindow | null {
    const display = screen.getAllDisplays().find((d) => String(d.id) === target.displayId)
    if (!display) return null
    try {
      const { bounds, inner } = borderWindow(target.rect, display.bounds, SELECTION_LINE)
      const border = createAppWindow(
        'selection',
        {
          ...bounds,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          focusable: false,
          skipTaskbar: true,
          hasShadow: false,
          alwaysOnTop: true,
          show: false,
        },
        { border: [inner.x, inner.y, inner.width, inner.height].join(',') },
      )
      border.setAlwaysOnTop(true, 'screen-saver')
      border.setContentProtection(true)
      border.setIgnoreMouseEvents(true)
      border.once('ready-to-show', () => {
        if (border.isDestroyed()) return
        border.setBounds(bounds)
        border.showInactive()
      })
      return border
    } catch (error) {
      this.log.error('recording.border.failed', { error })
      return null
    }
  }

  private sendClock(): void {
    if (this.state.name !== 'recording') return
    sendTo(this.state.bar, IpcChannel.recordingClock, this.state.clock)
  }

  private report(status: RecordingStatus): void {
    this.showMain()
    sendTo(this.mainWindow(), IpcChannel.recordingStatus, status)
  }

  private showMain(): void {
    const main = this.mainWindow()
    if (!main || main.isDestroyed()) return
    main.show()
    main.focus()
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
