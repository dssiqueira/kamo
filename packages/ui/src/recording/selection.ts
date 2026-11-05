// A-08 "Select": the geometry of the selection frame, pure and platform-free. The frame page
// works in pixels of the recording (what the W × H fields show), relative to the display's top
// left; the helper takes DIP (points on Mac). Imported by main too (`@kamo/ui/selection`).

/** A rectangle relative to the display's top left. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** A display: its size in DIP (points on Mac) and how many pixels one DIP is. */
export interface SelectionDisplay {
  width: number
  height: number
  scaleFactor: number
}

/** Which edges a resize handle moves. */
export interface Edges {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

/** A-08: nothing smaller is recorded (pixels of the recording). */
export const MIN_SELECTION: Size = { width: 320, height: 240 }
/** Where a first selection starts: 1280 × 720, scaled down to fit a small display. */
export const DEFAULT_SELECTION: Size = { width: 1280, height: 720 }

export interface SelectionPreset {
  ratio: string
  width: number
  height: number
}

/** The quick sizes in the toolbar menu; each is scaled down (aspect kept) to fit the display. */
export const SELECTION_PRESETS: readonly SelectionPreset[] = [
  { ratio: '16:9', width: 1280, height: 720 },
  { ratio: '16:9', width: 1920, height: 1080 },
  { ratio: '1:1', width: 1080, height: 1080 },
  { ratio: '9:16', width: 1080, height: 1920 },
]

function scaleOf(display: SelectionDisplay): number {
  const s = display.scaleFactor
  return Number.isFinite(s) && s > 0 ? s : 1
}

const evenDown = (n: number) => Math.floor(n / 2) * 2

/** `want` within [lo, hi]; when the range is empty (a tiny display), `hi` wins. */
function within(want: number, lo: number, hi: number): number {
  return Math.max(Math.min(want, hi), Math.min(lo, hi))
}

/** The display in pixels of the recording. */
export function displayPixels(display: SelectionDisplay): Size {
  const s = scaleOf(display)
  return { width: Math.round(display.width * s), height: Math.round(display.height * s) }
}

/** Largest and smallest selection on the display: even sides, at least 320 × 240 if it fits. */
function limits(display: SelectionDisplay): { min: Size; max: Size } {
  const px = displayPixels(display)
  const max = { width: evenDown(px.width), height: evenDown(px.height) }
  const min = {
    width: Math.min(MIN_SELECTION.width, max.width),
    height: Math.min(MIN_SELECTION.height, max.height),
  }
  return { min, max }
}

/** A size the display can take: whole even pixels, at least the minimum, at most the display. */
export function clampSize(size: Size, display: SelectionDisplay): Size {
  const { min, max } = limits(display)
  const side = (value: number, lo: number, hi: number) =>
    Number.isFinite(value) ? within(evenDown(Math.round(value)), lo, hi) : lo
  return {
    width: side(size.width, min.width, max.width),
    height: side(size.height, min.height, max.height),
  }
}

/** The rectangle with a valid size (see clampSize), moved fully onto the display. */
export function clampRect(rect: Rect, display: SelectionDisplay): Rect {
  const px = displayPixels(display)
  const size = clampSize(rect, display)
  const position = (value: number, room: number) =>
    Number.isFinite(value) ? within(Math.round(value), 0, room) : 0
  return {
    x: position(rect.x, px.width - size.width),
    y: position(rect.y, px.height - size.height),
    ...size,
  }
}

/** Dragged by (dx, dy) pixels; stops at the display's edges. */
export function moveRect(rect: Rect, dx: number, dy: number, display: SelectionDisplay): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, display)
}

/**
 * A drag of edges or a corner by (dx, dy) pixels from `start`: the opposite edges stay put, the
 * size stays even and at least the minimum, and the moved edges stop at the display's edges.
 */
export function resizeRect(
  start: Rect,
  edges: Edges,
  dx: number,
  dy: number,
  display: SelectionDisplay,
): Rect {
  const base = clampRect(start, display)
  const { min } = limits(display)
  const px = displayPixels(display)
  const axis = (
    pos: number,
    length: number,
    delta: number,
    low: boolean | undefined,
    high: boolean | undefined,
    room: number,
    minimum: number,
  ): [number, number] => {
    if (high) {
      const length2 = within(evenDown(Math.round(length + delta)), minimum, evenDown(room - pos))
      return [pos, length2]
    }
    if (low) {
      const end = pos + length
      const length2 = within(evenDown(Math.round(length - delta)), minimum, evenDown(end))
      return [end - length2, length2]
    }
    return [pos, length]
  }
  const [x, width] = axis(base.x, base.width, dx, edges.left, edges.right, px.width, min.width)
  const [y, height] = axis(base.y, base.height, dy, edges.top, edges.bottom, px.height, min.height)
  return { x, y, width, height }
}

/**
 * A new size typed in the W × H fields (top left kept) or picked from the presets (center
 * kept); moved back onto the display if it now sticks out.
 */
export function resizeTo(
  rect: Rect,
  size: Size,
  display: SelectionDisplay,
  keep: 'top-left' | 'center' = 'top-left',
): Rect {
  const next = clampSize(size, display)
  if (keep === 'top-left') return clampRect({ ...rect, ...next }, display)
  return clampRect(
    {
      x: rect.x + (rect.width - next.width) / 2,
      y: rect.y + (rect.height - next.height) / 2,
      ...next,
    },
    display,
  )
}

/** A preset scaled down (aspect kept) to fit the display, then made valid. */
export function fitSize(size: Size, display: SelectionDisplay): Size {
  const { max } = limits(display)
  const fit = Math.min(1, max.width / size.width, max.height / size.height)
  return clampSize({ width: size.width * fit, height: size.height * fit }, display)
}

/** A size in the middle of the display. */
export function centered(size: Size, display: SelectionDisplay): Rect {
  const px = displayPixels(display)
  const valid = clampSize(size, display)
  return clampRect(
    { x: (px.width - valid.width) / 2, y: (px.height - valid.height) / 2, ...valid },
    display,
  )
}

/** Pixels of the recording → DIP (points on Mac), what the helper and settings take. */
export function toDip(rect: Rect, display: SelectionDisplay): Rect {
  const s = scaleOf(display)
  return { x: rect.x / s, y: rect.y / s, width: rect.width / s, height: rect.height / s }
}

/** DIP → whole pixels of the recording (the inverse of toDip, rounded). */
export function toPixels(rect: Rect, display: SelectionDisplay): Rect {
  const s = scaleOf(display)
  const left = Math.round(rect.x * s)
  const top = Math.round(rect.y * s)
  return {
    x: left,
    y: top,
    width: Math.round((rect.x + rect.width) * s) - left,
    height: Math.round((rect.y + rect.height) * s) - top,
  }
}

/**
 * Where the frame opens: the selection remembered for this display (DIP), made valid, or
 * 1280 × 720 in the middle (scaled down on a small display).
 */
export function initialSelection(remembered: Rect | null, display: SelectionDisplay): Rect {
  if (remembered) return clampRect(toPixels(remembered, display), display)
  return centered(fitSize(DEFAULT_SELECTION, display), display)
}

export type ToolbarPlacement = 'below' | 'above' | 'inside'

/**
 * Where the toolbar goes (all DIP): attached under the frame, above it when the frame reaches
 * the bottom of the display, inside its bottom edge when it fills the height; centered on the
 * frame and kept on the display.
 */
export function toolbarPosition(
  frame: Rect,
  toolbar: Size,
  display: Size,
  inset = 12,
): { x: number; y: number; placement: ToolbarPlacement } {
  const x = within(
    frame.x + (frame.width - toolbar.width) / 2,
    0,
    Math.max(0, display.width - toolbar.width),
  )
  const below = frame.y + frame.height
  if (below + toolbar.height <= display.height) return { x, y: below, placement: 'below' }
  const above = frame.y - toolbar.height
  if (above >= 0) return { x, y: above, placement: 'above' }
  const inside = within(
    frame.y + frame.height - toolbar.height - inset,
    0,
    Math.max(0, display.height - toolbar.height),
  )
  return { x, y: inside, placement: 'inside' }
}

/**
 * The window that draws the border while recording (global DIP): the selection grown by the
 * border on every side, cut to the display, and where the selection sits inside it.
 */
export function borderWindow(
  selection: Rect,
  display: Rect,
  border: number,
): { bounds: Rect; inner: Rect } {
  const left = Math.max(display.x, Math.floor(display.x + selection.x - border))
  const top = Math.max(display.y, Math.floor(display.y + selection.y - border))
  const right = Math.min(
    display.x + display.width,
    Math.ceil(display.x + selection.x + selection.width + border),
  )
  const bottom = Math.min(
    display.y + display.height,
    Math.ceil(display.y + selection.y + selection.height + border),
  )
  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    inner: {
      x: display.x + selection.x - left,
      y: display.y + selection.y - top,
      width: selection.width,
      height: selection.height,
    },
  }
}

/** Whether a point is inside any of the areas (the frame's grab bands and toolbar). */
export function hitsAny(areas: readonly Rect[], x: number, y: number): boolean {
  return areas.some((a) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)
}
