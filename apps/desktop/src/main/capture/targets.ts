// A-08: what the renderer may ask to record, checked before anything starts, plus the pure
// pieces of the window list (ids, bounds, thumbnails). No Electron here, so it is tested in Node.
import { z } from 'zod'
import type { CaptureTarget, WindowInfo } from '../../shared/capture.ts'

const Id = z.string().min(1).max(64)
const WindowId = z.string().regex(/^[0-9]{1,20}$/)
const Rect = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})

const Target = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('display'), displayId: Id }),
  z.strictObject({ kind: z.literal('window'), windowId: WindowId, displayId: Id.optional() }),
  z.strictObject({ kind: z.literal('region'), displayId: Id, rect: Rect }),
])

/**
 * What `startRecording` received: a target, or a bare display id (the call before A-08).
 * Throws on anything else.
 */
export function parseCaptureTarget(value: unknown): CaptureTarget {
  if (typeof value === 'string') return { kind: 'display', displayId: Id.parse(value) }
  return Target.parse(value) as CaptureTarget
}

/** One window as the helper lists it (protocol `windows` event). */
export interface HelperWindow {
  id: string
  title: string
  app: string
  x: number
  y: number
  width: number
  height: number
}

/** desktopCapturer's id for a window (`window:<id>:0`) → the helper's id. */
export function capturerWindowId(sourceId: string): string | null {
  return /^window:(\d+):/.exec(sourceId)?.[1] ?? null
}

/**
 * The helper's list joined with what Electron knows: each window's display and DIP size (from
 * `toDip`, which converts the helper's bounds) and its thumbnail (desktopCapturer, by id).
 * Windows with no thumbnail are kept: the card shows the app name instead.
 */
export function joinWindows(
  windows: readonly HelperWindow[],
  toDip: (bounds: HelperWindow) => { width: number; height: number; displayId: string | null },
  thumbnails: ReadonlyMap<string, string>,
  icons: ReadonlyMap<string, string> = new Map(),
): WindowInfo[] {
  return windows.map((window) => {
    const placed = toDip(window)
    return {
      id: window.id,
      title: window.title.trim(),
      app: window.app,
      displayId: placed.displayId,
      width: Math.round(placed.width),
      height: Math.round(placed.height),
      thumbnail: thumbnails.get(window.id) ?? null,
      icon: icons.get(window.id) ?? null,
    }
  })
}
