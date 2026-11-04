// Tray icon while recording: the controls stay reachable even when the floating bar is on
// another monitor or hidden behind a full-screen app (F-02).
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { formatTimecodeShort } from './recording-time.ts'

export interface TrayLabels {
  recording(elapsed: string): string
  paused(elapsed: string): string
  pause: string
  resume: string
  stop: string
}

export interface TrayActions {
  pause(): void
  resume(): void
  stop(): void
}

const TICK_MS = 1000

/** The REC dot (DESIGN.md: coral is reserved for it), drawn at runtime: no image file. */
function recDot(size: number, opacity = 1): NativeImage {
  const bitmap = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2
  const radius = size * 0.36
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Anti-aliased edge: coverage falls off over one pixel.
      const coverage = Math.max(0, Math.min(1, radius - Math.hypot(x - center, y - center) + 0.5))
      const i = (y * size + x) * 4
      // BGRA, premultiplied: #E0604F
      const a = coverage * opacity
      bitmap[i] = Math.round(0x4f * a)
      bitmap[i + 1] = Math.round(0x60 * a)
      bitmap[i + 2] = Math.round(0xe0 * a)
      bitmap[i + 3] = Math.round(255 * a)
    }
  }
  const image = nativeImage.createFromBitmap(bitmap, { width: size, height: size })
  return image
}

export class RecordingTray {
  private tray: Tray | null = null
  private timer: NodeJS.Timeout | undefined
  private paused = false

  constructor(
    private readonly labels: () => TrayLabels,
    private readonly actions: TrayActions,
    private readonly elapsedMs: () => number,
  ) {}

  show(): void {
    if (this.tray) return
    this.tray = new Tray(recDot(32))
    // Windows shows the menu on right click only; left click should open it too.
    this.tray.on('click', () => this.tray?.popUpContextMenu())
    this.refresh()
    this.timer = setInterval(() => this.refresh(), TICK_MS)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.tray?.setImage(recDot(32, paused ? 0.45 : 1))
    this.refresh()
  }

  hide(): void {
    clearInterval(this.timer)
    this.tray?.destroy()
    this.tray = null
    this.paused = false
  }

  private refresh(): void {
    if (!this.tray) return
    const labels = this.labels()
    const elapsed = formatTimecodeShort(this.elapsedMs())
    const status = this.paused ? labels.paused(elapsed) : labels.recording(elapsed)
    this.tray.setToolTip(status)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: status, enabled: false },
        { type: 'separator' },
        this.paused
          ? { label: labels.resume, click: () => this.actions.resume() }
          : { label: labels.pause, click: () => this.actions.pause() },
        { label: labels.stop, click: () => this.actions.stop() },
      ]),
    )
  }
}
