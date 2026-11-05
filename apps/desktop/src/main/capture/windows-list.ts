// A-08: the windows Home can record. The capture helper lists them (`listWindows`: ids it can
// record, titles, apps, bounds; it never lists Kamo), Electron adds the thumbnails and app icons
// (desktopCapturer, like the display thumbnails, D-023) and maps the bounds to DIP and a display.
import { desktopCapturer, screen } from 'electron'
import type { WindowInfo } from '../../shared/capture.ts'
import { HelperProcess, type CaptureLogger } from './helper-process.ts'
import { capturerWindowId, joinWindows, type HelperWindow } from './targets.ts'

const TIMEOUT_MS = 5000
const THUMBNAIL_SIZE = { width: 360, height: 240 }
const THUMBNAIL_QUALITY = 70
/** App icons are shown at 16–24px; 32px keeps them sharp on 2x screens. */
const ICON_SIZE = 32

export interface WindowListOptions {
  /** Null when the helper is not there (not built yet, unsupported OS). */
  helperPath: () => string | null
  logger: CaptureLogger
}

/** Asks a fresh helper for the window list, then lets it exit. */
async function helperWindows(options: WindowListOptions): Promise<HelperWindow[]> {
  const executable = options.helperPath()
  if (!executable) return []
  const helper = new HelperProcess({ executable }, { logger: options.logger })
  try {
    await helper.waitFor('ready', { timeoutMs: TIMEOUT_MS })
    const answer = helper.waitFor('windows', { timeoutMs: TIMEOUT_MS })
    helper.send({ cmd: 'listWindows', excludePid: process.pid })
    return (await answer).windows
  } finally {
    helper.closeInput()
    // a helper that does not go away by itself is not waited for
    setTimeout(() => helper.dispose(), TIMEOUT_MS).unref()
  }
}

interface WindowPictures {
  thumbnails: Map<string, string>
  icons: Map<string, string>
}

/** Thumbnails and app icons, keyed by window id. */
async function pictures(): Promise<WindowPictures> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: THUMBNAIL_SIZE,
    fetchWindowIcons: true,
  })
  const thumbnails = new Map<string, string>()
  const icons = new Map<string, string>()
  for (const source of sources) {
    const id = capturerWindowId(source.id)
    if (!id) continue
    if (!source.thumbnail.isEmpty()) {
      const jpeg = source.thumbnail.toJPEG(THUMBNAIL_QUALITY).toString('base64')
      thumbnails.set(id, `data:image/jpeg;base64,${jpeg}`)
    }
    if (source.appIcon && !source.appIcon.isEmpty()) {
      const icon = source.appIcon.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' })
      icons.set(id, `data:image/png;base64,${icon.toPNG().toString('base64')}`)
    }
  }
  return { thumbnails, icons }
}

/** Helper bounds (Windows: physical pixels; Mac: points) → DIP size and display. */
function placeWindow(window: HelperWindow): {
  width: number
  height: number
  displayId: string | null
} {
  const rect = { x: window.x, y: window.y, width: window.width, height: window.height }
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, rect) : rect
  const display = screen.getDisplayMatching(dip)
  return { width: dip.width, height: dip.height, displayId: display ? String(display.id) : null }
}

let pending: Promise<WindowInfo[]> | null = null

/** The recordable windows, front to back. Concurrent calls share one listing. */
export function listCaptureWindows(options: WindowListOptions): Promise<WindowInfo[]> {
  pending ??= (async () => {
    try {
      const [windows, pics] = await Promise.all([
        helperWindows(options),
        pictures().catch((error: unknown): WindowPictures => {
          options.logger.warn('capture.windows.thumbnails_failed', { error: String(error) })
          return { thumbnails: new Map(), icons: new Map() }
        }),
      ])
      return joinWindows(windows, placeWindow, pics.thumbnails, pics.icons)
    } catch (error) {
      options.logger.warn('capture.windows.list_failed', { error: String(error) })
      return []
    } finally {
      pending = null
    }
  })()
  return pending
}
