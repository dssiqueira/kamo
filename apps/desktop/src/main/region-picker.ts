// A-08: "Region" on Home. Covers the chosen display with Kamo's own overlay window, where the
// user drags a rectangle; Esc (a key of that focused window only, never a global listener:
// rule 2) cancels. Main hides its window meanwhile, so it is not in the way.
import {
  ipcMain,
  screen,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import { IpcChannel } from '../shared/api.ts'
import type { CaptureRect } from '../shared/capture.ts'
import { clipRegion } from './capture/targets.ts'
import { createAppWindow } from './windows.ts'

interface Picking {
  window: BrowserWindow
  displayId: string
  size: { width: number; height: number; scaleFactor: number }
  resolve(rect: CaptureRect | null): void
}

export interface RegionPickerOptions {
  mainWindow(): BrowserWindow | undefined
  /** A rectangle was picked: remember it (settings.lastRegion). */
  onPicked(displayId: string, rect: CaptureRect): void
}

export class RegionPicker {
  private picking: Picking | null = null

  constructor(private readonly options: RegionPickerOptions) {}

  /** Opens the overlay on the display; resolves with the rectangle, or null when cancelled. */
  pick(displayId: string): Promise<CaptureRect | null> {
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    if (!display) return Promise.resolve(null)
    // one overlay at a time: a second click on Home brings the open one back
    if (this.picking) {
      this.picking.window.focus()
      return Promise.resolve(null)
    }
    const main = this.options.mainWindow()
    const window = createAppWindow('region-picker', {
      ...display.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
    })
    window.setAlwaysOnTop(true, 'screen-saver')
    // On Windows a frameless window can land a few DIP off on a scaled display.
    window.once('ready-to-show', () => {
      window.setBounds(display.bounds)
      window.show()
      window.focus()
    })
    return new Promise((resolve) => {
      this.picking = {
        window,
        displayId,
        size: {
          width: display.bounds.width,
          height: display.bounds.height,
          scaleFactor: display.scaleFactor,
        },
        resolve,
      }
      main?.hide()
      window.on('closed', () => this.settle(window, null))
    })
  }

  /** For the overlay page: its display's size and scale. */
  info(sender: WebContents) {
    return this.owner(sender)?.size ?? null
  }

  /** From the overlay page: the rectangle (DIP, display-local), or null to cancel. */
  finish(sender: WebContents, rect: CaptureRect | null): void {
    const picking = this.owner(sender)
    if (!picking) return
    const clipped = rect && clipRegion(rect, picking.size)
    this.settle(picking.window, clipped)
  }

  private owner(sender: WebContents): Picking | null {
    const picking = this.picking
    return picking && !picking.window.isDestroyed() && picking.window.webContents === sender
      ? picking
      : null
  }

  private settle(window: BrowserWindow, rect: CaptureRect | null): void {
    const picking = this.picking
    if (!picking || picking.window !== window) return
    this.picking = null
    if (rect) this.options.onPicked(picking.displayId, rect)
    picking.resolve(rect)
    if (!window.isDestroyed()) window.destroy()
    const main = this.options.mainWindow()
    if (main && !main.isDestroyed()) {
      main.show()
      main.focus()
    }
  }
}

const parseRect = (value: unknown): CaptureRect | null => {
  if (value === null) return null
  if (typeof value !== 'object') throw new Error('rect must be an object or null')
  const { x, y, width, height } = value as Record<string, unknown>
  const all = [x, y, width, height]
  if (!all.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('rect must have finite x, y, width, height')
  }
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

/** IPC of the overlay page; only the overlay window that is open may call it. */
export function registerRegionPickerIpc(picker: RegionPicker): void {
  const sender = (event: IpcMainInvokeEvent) => event.sender
  ipcMain.handle(IpcChannel.getRegionPicker, (event) => picker.info(sender(event)))
  ipcMain.handle(IpcChannel.finishRegionPicker, (event, rect: unknown) =>
    picker.finish(sender(event), parseRect(rect)),
  )
}
