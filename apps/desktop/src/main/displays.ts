import { desktopCapturer, screen, systemPreferences } from 'electron'
import type { DisplayInfo, ScreenAccess } from '../shared/api.ts'

const THUMBNAIL_BOX = 480
const THUMBNAIL_QUALITY = 70

/**
 * Displays with live thumbnails for Home (F-01). Thumbnails come from desktopCapturer, which
 * may show the system cursor; that is fine for a picker. Recording uses the native helper
 * (D-023).
 */
export async function listDisplays(): Promise<DisplayInfo[]> {
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: THUMBNAIL_BOX, height: THUMBNAIL_BOX },
  })

  return displays.map((display, index) => {
    // display_id can be empty on some Windows setups; fall back to the enumeration order.
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      (sources.every((s) => !s.display_id) ? sources[index] : undefined)
    const thumbnail =
      source && !source.thumbnail.isEmpty()
        ? `data:image/jpeg;base64,${source.thumbnail.toJPEG(THUMBNAIL_QUALITY).toString('base64')}`
        : null
    return {
      id: String(display.id),
      label: display.label,
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
      scaleFactor: display.scaleFactor,
      primary: display.id === primaryId,
      thumbnail,
    }
  })
}

export function getScreenAccess(): ScreenAccess {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen')
}

/** Notifies on any display change (connect, disconnect, resolution or scale). */
export function watchDisplays(onChange: () => void): () => void {
  const events = ['display-added', 'display-removed', 'display-metrics-changed'] as const
  for (const event of events) screen.on(event as 'display-added', onChange)
  return () => {
    for (const event of events) screen.off(event as 'display-added', onChange)
  }
}

/**
 * A point inside the display in physical pixels of the virtual screen, for the Windows capture
 * helper (PROTOCOL.md, `start` → `monitorPoint`): Electron's Display.id is not an HMONITOR, but
 * the monitor that contains a physical point is unambiguous. The center of the display's DIP
 * bounds, converted with Electron's own DIP → screen mapping. Undefined off Windows or when the
 * display is gone.
 */
export function monitorPointFor(displayId: string): { x: number; y: number } | undefined {
  if (process.platform !== 'win32') return undefined
  const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
  if (!display) return undefined
  const { x, y, width, height } = display.bounds
  const point = screen.dipToScreenPoint({ x: x + width / 2, y: y + height / 2 })
  return { x: Math.round(point.x), y: Math.round(point.y) }
}
