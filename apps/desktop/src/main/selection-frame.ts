// A-08 "Select": the selection frame. A transparent, always-on-top window over the chosen display
// draws the frame and its toolbar; the page moves and resizes the frame itself (CSS), so the
// window never moves or resizes (no DPI rounding of window bounds on Windows).
//
// The see-through middle lets clicks through: the window ignores the mouse except while the
// pointer is over the areas the page reports (the edges' grab bands, the toolbar, its menu) or
// a drag is going on. Main reads the pointer position (`screen.getCursorScreenPoint`, a plain
// query; no hook) about 60 times a second while the frame is open and switches
// `setIgnoreMouseEvents`. Electron's `forward: true` would let the page do this from hover
// events, but on Windows it delivers no moves with current Electron, and polling works the same
// on Mac. Esc is a key of this focused window only, never a global listener (rule 2). Main
// hides its own window meanwhile.
import { clampRect, hitsAny, initialSelection, toDip, type Rect } from '@kamo/ui/selection'
import { app, ipcMain, screen, type BrowserWindow, type Display, type WebContents } from 'electron'
import { IpcChannel, type SelectionInfo } from '../shared/api.ts'
import type { CaptureRect, CaptureTarget } from '../shared/capture.ts'
import { createAppWindow } from './windows.ts'

interface Open {
  window: BrowserWindow
  displayId: string
  display: { width: number; height: number; scaleFactor: number }
  /** The display's top left in global DIP (pointer → page coordinates). */
  origin: { x: number; y: number }
  initial: Rect
  areas: Rect[]
  holding: boolean
  /** Whether the window takes the mouse now. */
  interactive: boolean
  poll: NodeJS.Timeout
  resolve(rect: CaptureRect | null): void
}

/** How often the pointer is checked while the frame is open. */
const POLL_MS = 16
/** At most this many hit areas from the page. */
const MAX_AREAS = 32

export interface SelectionFrameOptions {
  mainWindow(): BrowserWindow | undefined
  /** The selection remembered last time (settings.lastRegion), DIP. */
  remembered(): Promise<{ displayId: string; rect: CaptureRect } | null>
  /** The selection when the frame closes or records (saved as lastRegion). */
  onSelected(displayId: string, rect: CaptureRect): void
  /** Record pressed on the toolbar: the same start Home's Record uses. */
  record(target: CaptureTarget): void
  /** The global stop shortcut (accelerator), shown on the Record button. */
  stopShortcut(): string
}

export class SelectionFrame {
  private current: Open | null = null

  constructor(private readonly options: SelectionFrameOptions) {
    // `screen` exists only once the app is ready.
    void app.whenReady().then(() =>
      screen.on('display-removed', (_event, display) => {
        const open = this.current
        if (open && open.displayId === String(display.id)) this.settle(open, null, false)
      }),
    )
  }

  /**
   * Opens the frame on the display, at the remembered selection (or 1280 × 720 in the middle).
   * Resolves with the selection (DIP, display-local) once it closes or records; null when the
   * display is gone. A second call while open brings the open frame back and resolves null.
   */
  async show(displayId: string): Promise<CaptureRect | null> {
    if (this.current) {
      this.current.window.focus()
      return null
    }
    const found = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    if (!found) return null
    const remembered = await this.options.remembered().catch(() => null)
    // Settings were read asynchronously: still nothing open?
    if (this.current) return null
    const display = sizeOf(found)
    const initial = initialSelection(
      remembered?.displayId === displayId ? remembered.rect : null,
      display,
    )
    const window = createAppWindow('selection', {
      ...found.bounds,
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
    // The see-through middle lets clicks through; the poll below takes them over the frame.
    window.setIgnoreMouseEvents(true)
    // On Windows a frameless window can land a few DIP off on a scaled display.
    window.once('ready-to-show', () => {
      window.setBounds(found.bounds)
      window.show()
      window.focus()
    })
    return new Promise((resolve) => {
      const open: Open = {
        window,
        displayId,
        display,
        origin: { x: found.bounds.x, y: found.bounds.y },
        initial,
        areas: [],
        holding: false,
        interactive: false,
        poll: setInterval(() => this.poll(open), POLL_MS),
        resolve,
      }
      this.current = open
      this.options.mainWindow()?.hide()
      window.on('closed', () => this.settle(open, null, false))
    })
  }

  /** For the frame page: its display and where the frame opens. */
  info(sender: WebContents): SelectionInfo | null {
    const open = this.owner(sender)
    return open
      ? { display: open.display, rect: open.initial, stopShortcut: this.options.stopShortcut() }
      : null
  }

  /** Where the frame takes the mouse (DIP, page coordinates), and whether a drag holds it. */
  setHitAreas(sender: WebContents, areas: Rect[], holding: boolean): void {
    const open = this.owner(sender)
    if (!open) return
    open.areas = areas
    open.holding = holding
    this.poll(open)
  }

  private poll(open: Open): void {
    if (open.window.isDestroyed()) return
    const point = screen.getCursorScreenPoint()
    const interactive =
      open.holding || hitsAny(open.areas, point.x - open.origin.x, point.y - open.origin.y)
    if (interactive === open.interactive) return
    open.interactive = interactive
    open.window.setIgnoreMouseEvents(!interactive)
  }

  /** × or Esc: closes, keeping the selection (pixels of the recording). */
  close(sender: WebContents, rect: Rect): void {
    const open = this.owner(sender)
    if (open) this.settle(open, toDip(clampRect(rect, open.display), open.display), false)
  }

  /** Record: closes and starts the countdown on that selection. */
  record(sender: WebContents, rect: Rect): void {
    const open = this.owner(sender)
    if (!open) return
    const dip = toDip(clampRect(rect, open.display), open.display)
    this.settle(open, dip, true)
    this.options.record({ kind: 'region', displayId: open.displayId, rect: dip })
  }

  private owner(sender: WebContents): Open | null {
    const open = this.current
    return open && !open.window.isDestroyed() && open.window.webContents === sender ? open : null
  }

  private settle(open: Open, rect: CaptureRect | null, recording: boolean): void {
    if (this.current !== open) return
    this.current = null
    clearInterval(open.poll)
    if (rect) this.options.onSelected(open.displayId, rect)
    open.resolve(rect)
    if (!open.window.isDestroyed()) open.window.destroy()
    // Recording keeps Home hidden: the countdown takes over.
    if (recording) return
    const main = this.options.mainWindow()
    if (main && !main.isDestroyed()) {
      main.show()
      main.focus()
    }
  }
}

function sizeOf(display: Display) {
  return {
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor,
  }
}

/** A rectangle from the page. */
function parseRect(value: unknown): Rect {
  if (typeof value !== 'object' || value === null) throw new Error('rect must be an object')
  const { x, y, width, height } = value as Record<string, unknown>
  const all = [x, y, width, height]
  if (!all.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('rect must have finite x, y, width, height')
  }
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

function parseAreas(value: unknown): Rect[] {
  if (!Array.isArray(value) || value.length > MAX_AREAS) throw new Error('areas must be a list')
  return value.map(parseRect)
}

/** IPC of the frame page; only the frame window that is open may call it. */
export function registerSelectionIpc(frame: SelectionFrame): void {
  ipcMain.handle(IpcChannel.getSelection, (event) => frame.info(event.sender))
  ipcMain.handle(IpcChannel.setSelectionHitAreas, (event, areas: unknown, holding: unknown) =>
    frame.setHitAreas(event.sender, parseAreas(areas), holding === true),
  )
  ipcMain.handle(IpcChannel.closeSelection, (event, rect: unknown) =>
    frame.close(event.sender, parseRect(rect)),
  )
  ipcMain.handle(IpcChannel.recordSelection, (event, rect: unknown) =>
    frame.record(event.sender, parseRect(rect)),
  )
}
