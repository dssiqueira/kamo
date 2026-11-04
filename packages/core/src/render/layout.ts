// Frame layout (F-08, F-11): where the video goes in the output and which part of the source
// fills it. Pure math, shared by preview and export (rule 11) and tested in Node.
import type { Aspect, Style } from '../project/schema.ts'
import type { Box, Point, Size } from './types.ts'

export type Resolution = '1080p' | '4k'

/** Short side of the output at 1080p. `style.radius` is in pixels at this size. */
export const REFERENCE_SHORT_SIDE = 1080

/** Output pixels: 16:9 → 1920×1080, 1:1 → 1080×1080, 9:16 → 1080×1920; 4k doubles. */
export function outputSize(aspect: Aspect, resolution: Resolution): Size {
  const k = resolution === '4k' ? 2 : 1
  const short = REFERENCE_SHORT_SIDE * k
  const long = Math.round((REFERENCE_SHORT_SIDE * 16) / 9) * k
  if (aspect === '16:9') return { width: long, height: short }
  if (aspect === '9:16') return { width: short, height: long }
  return { width: short, height: short }
}

export interface LayoutInput {
  output: Size
  sourceSize: Size
  style: Pick<Style, 'padding' | 'radius'>
  aspect: Aspect
  /** camera viewport in source pixels (viewportAt); null/undefined = the whole source */
  viewport?: Box | null
}

export interface Layout {
  output: Size
  /** where the video sits, in output pixels */
  frame: Box
  /** corner radius in output pixels */
  radius: number
  /** part of the source drawn into the frame, in source pixels (same aspect as the frame) */
  crop: Box
  /** output pixels per source pixel (frame.width / crop.width) */
  scale: number
}

const ASPECT_EPSILON = 1e-9

/**
 * Layout of one frame.
 *
 * Frame: the output minus `padding`% of its width on the left and right and of its height
 * on top and bottom (so the padded area keeps the output's aspect).
 * - 16:9 is the full format: the frame takes the source's aspect, fitted and centered in the
 *   padded area, so nothing of the recording is cut (a 16:9 source fills it exactly; a 16:10
 *   Mac display gets thin side bands of wallpaper).
 * - 1:1 and 9:16 are crop formats: the frame is the whole padded area and the crop follows
 *   the camera (F-11), never a fixed crop.
 *
 * Crop: the largest rect with the frame's aspect inside the camera viewport, centered on the
 * viewport's center and clamped inside the source. When the aspects match (16:9) it is the
 * viewport itself.
 *
 * Radius: `style.radius` is pixels at 1080p, scaled by the output's short side / 1080, and
 * never more than half the frame's short side.
 */
export function computeLayout({
  output,
  sourceSize,
  style,
  aspect,
  viewport,
}: LayoutInput): Layout {
  const pad = clamp(style.padding, 0, 20) / 100
  const area: Box = {
    x: output.width * pad,
    y: output.height * pad,
    width: output.width * (1 - 2 * pad),
    height: output.height * (1 - 2 * pad),
  }
  const frame = aspect === '16:9' ? fitInside(area, sourceSize.width / sourceSize.height) : area

  const scaleToOutput = Math.min(output.width, output.height) / REFERENCE_SHORT_SIDE
  const radius = clamp(
    Math.max(0, style.radius) * scaleToOutput,
    0,
    Math.min(frame.width, frame.height) / 2,
  )

  const crop = cropFor(viewport ?? fullSource(sourceSize), sourceSize, frame.width / frame.height)
  return { output, frame, radius, crop, scale: frame.width / crop.width }
}

/**
 * Largest rect of `aspect` (width / height) inside `viewport`, centered on it, then clamped
 * inside the source.
 */
export function cropFor(viewport: Box, sourceSize: Size, aspect: number): Box {
  const view = clampBox(viewport, sourceSize)
  const viewAspect = view.width / view.height
  if (Math.abs(viewAspect - aspect) <= ASPECT_EPSILON * aspect) return view

  let width: number
  let height: number
  if (viewAspect > aspect) {
    height = view.height
    width = height * aspect
  } else {
    width = view.width
    height = width / aspect
  }
  const cx = view.x + view.width / 2
  const cy = view.y + view.height / 2
  return clampBox({ x: cx - width / 2, y: cy - height / 2, width, height }, sourceSize)
}

/** Source pixel → output pixel. Used to place the cursor and the ripple. */
export function sourceToOutput(point: Point, layout: Layout): Point {
  const { frame, crop } = layout
  return {
    x: frame.x + ((point.x - crop.x) * frame.width) / crop.width,
    y: frame.y + ((point.y - crop.y) * frame.height) / crop.height,
  }
}

/** Output pixel → source pixel (inverse of sourceToOutput; for hit tests in the editor). */
export function outputToSource(point: Point, layout: Layout): Point {
  const { frame, crop } = layout
  return {
    x: crop.x + ((point.x - frame.x) * crop.width) / frame.width,
    y: crop.y + ((point.y - frame.y) * crop.height) / frame.height,
  }
}

/** True when a source point is inside the crop (and therefore inside the frame). */
export function isInCrop(point: Point, layout: Layout): boolean {
  const { crop } = layout
  return (
    point.x >= crop.x &&
    point.x <= crop.x + crop.width &&
    point.y >= crop.y &&
    point.y <= crop.y + crop.height
  )
}

function fullSource(size: Size): Box {
  return { x: 0, y: 0, width: size.width, height: size.height }
}

/** Biggest rect of `aspect` centered in `area`. */
function fitInside(area: Box, aspect: number): Box {
  const areaAspect = area.width / area.height
  if (Math.abs(areaAspect - aspect) <= ASPECT_EPSILON * aspect) return area
  const width = areaAspect > aspect ? area.height * aspect : area.width
  const height = areaAspect > aspect ? area.height : area.width / aspect
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  }
}

/** Shrinks `box` (keeping its aspect) to fit the source, then moves it inside. */
function clampBox(box: Box, size: Size): Box {
  const shrink = Math.min(1, size.width / box.width, size.height / box.height)
  const width = box.width * shrink
  const height = box.height * shrink
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return {
    x: clamp(cx - width / 2, 0, size.width - width),
    y: clamp(cy - height / 2, 0, size.height - height),
    width,
    height,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
