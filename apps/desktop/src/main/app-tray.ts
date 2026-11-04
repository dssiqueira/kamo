// Kamo's own tray icon (menu bar on Mac) while "Close to tray" is on (F-15): the main window
// hides there instead of quitting. During a recording the recording tray icon
// (recording-tray.ts) takes its place, so only one Kamo icon is ever shown.
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { join } from 'node:path'

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

/**
 * The small tray icons in build/tray/ (scripts/make-tray-icons.mjs), a few KB in all. Mac gets
 * the monochrome template the menu bar tints; Windows and Linux the colour one. Electron loads
 * the matching `@1.5x`/`@2x`/`@3x` file next to it for the display's scaling.
 */
export function trayIconFile(
  trayDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return join(trayDir, platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
}

function trayImage(iconPath: string): NativeImage {
  const image = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') image.setTemplateImage(true)
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

  /** False when the icon file was not found (the tray would show an empty square). */
  hasIcon(): boolean {
    this.image ??= trayImage(this.iconPath)
    return !this.image.isEmpty()
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
