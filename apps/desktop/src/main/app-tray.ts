// Kamo's own tray icon (menu bar on Mac) while "Close to tray" is on (F-15): the main window
// hides there instead of quitting. During a recording the recording tray icon
// (recording-tray.ts) takes its place, so only one Kamo icon is ever shown.
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'

export interface AppTrayLabels {
  tooltip: string
  open: string
  quit: string
  noticeTitle: string
  noticeBody: string
}

export interface AppTrayActions {
  open(): void
  quit(): void
}

/** 16pt at 1x and 2x: the size Windows and the Mac menu bar draw tray icons at. */
const TRAY_SIZE = 16

function trayImage(iconPath: string): NativeImage {
  const source = nativeImage.createFromPath(iconPath)
  if (source.isEmpty()) return source
  const image = nativeImage.createEmpty()
  for (const scaleFactor of [1, 2]) {
    const size = TRAY_SIZE * scaleFactor
    const resized = source.resize({ width: size, height: size, quality: 'best' })
    image.addRepresentation({ scaleFactor, width: size, height: size, buffer: resized.toPNG() })
  }
  return image
}

export class AppTray {
  private tray: Tray | null = null
  private image: NativeImage | null = null

  constructor(
    private readonly iconPath: string,
    private readonly labels: () => AppTrayLabels,
    private readonly actions: AppTrayActions,
  ) {}

  isShown(): boolean {
    return this.tray !== null
  }

  /** Throws when the OS has no tray (some Linux desktops); the caller keeps the window then. */
  show(): void {
    if (this.tray) return
    this.image ??= trayImage(this.iconPath)
    const tray = new Tray(this.image)
    // Windows opens the menu on right click only; a left or double click opens Kamo. On Mac a
    // click opens the menu, as menu bar icons do.
    if (process.platform !== 'darwin') {
      tray.on('click', () => this.actions.open())
      tray.on('double-click', () => this.actions.open())
    }
    this.tray = tray
    this.refresh()
  }

  hide(): void {
    this.tray?.destroy()
    this.tray = null
  }

  /** Texts in the current UI language (after a language change). */
  refresh(): void {
    if (!this.tray) return
    const labels = this.labels()
    this.tray.setToolTip(labels.tooltip)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: labels.open, click: () => this.actions.open() },
        { type: 'separator' },
        { label: labels.quit, click: () => this.actions.quit() },
      ]),
    )
  }

  /** Windows balloon: Kamo is still running in the tray. */
  showNotice(): void {
    if (!this.tray || process.platform !== 'win32') return
    const labels = this.labels()
    this.tray.displayBalloon({
      ...(this.image && !this.image.isEmpty() ? { icon: this.image } : { iconType: 'info' }),
      title: labels.noticeTitle,
      content: labels.noticeBody,
    })
  }
}
