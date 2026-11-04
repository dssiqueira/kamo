// Webcam bubble (A-03): where the round camera overlay sits in the output, how big it is and
// how visible it is at any instant. Pure math, shared by the editor preview and the export
// (rule 11), so both paint the same bubble for the same time.
//
// Decisions:
// - The bubble is an overlay on the OUTPUT frame, not on the recording: the virtual camera
//   never moves or zooms it. It sits in the chosen corner of the output, WEBCAM_MARGIN of
//   the output's short side away from both edges.
// - Diameter is a fraction of the output's short side (WEBCAM_DIAMETER), so it reads the
//   same in 16:9, 1:1 and 9:16 and at 1080p and 4K.
// - The camera frame is cover-fitted into the circle (centered square crop) and mirrored
//   horizontally, like every selfie view: people expect to see themselves as in a mirror.
// - Shapes: circle (default), rounded square, 16:9 and 9:16 rounded rectangles. The camera is
//   cover-cropped to the shape's aspect, so a portrait camera fills a 9:16 bubble whole.
// - Dragged in the preview, the bubble can sit anywhere (`anchor`, a fraction of the output,
//   so it carries over to 1:1 and 9:16); dropped near a corner it snaps back to that corner.
// - Shrink on zoom follows the camera's own scale, which is already the 170/26 spring
//   (rule 10). No second spring, so the bubble moves exactly with the zoom and stays a pure
//   function of time. While shrinking, the bubble keeps its outer corner in place.
// - Hidden stretches fade (opacity) and scale the bubble with the same spring. The fade out
//   starts WEBCAM_FADE_LEAD_MS before the stretch so it is gone when the stretch begins;
//   the fade in starts when the stretch ends. Inside a stretch the bubble is never drawn.
import { springSettleTime, springStep, type SpringState } from '../spring.ts'
import type { WebcamPosition, WebcamSettings, WebcamShape, WebcamSize } from '../project/schema.ts'
import type { Box, Size } from './types.ts'

/** Bubble diameter as a fraction of the output's short side (1080p: 173, 238, 324px). */
export const WEBCAM_DIAMETER: Readonly<Record<WebcamSize, number>> = {
  small: 0.16,
  medium: 0.22,
  large: 0.3,
}

/** Gap between the bubble and the output edges, as a fraction of the short side (43px). */
export const WEBCAM_MARGIN = 0.04

/** Size of the bubble while the camera is fully zoomed, relative to its normal size. */
export const WEBCAM_SHRINK_MIN = 0.6

/** Camera scale at which the bubble is fully shrunk (the default zoom, 2.0×). */
export const WEBCAM_FULL_SHRINK_SCALE = 2

/** Visibility left when the fade out is considered done (invisible on screen). */
export const WEBCAM_FADE_EPSILON = 0.02

/** The fade out starts this long before a hidden stretch (spring settle time, ~0.46s). */
export const WEBCAM_FADE_LEAD_MS = springSettleTime(1, WEBCAM_FADE_EPSILON) * 1000

/** Smallest size of the bubble while it fades (it grows from here to full when appearing). */
export const WEBCAM_FADE_MIN_SCALE = 0.85

/** Cream ring around the camera, width in pixels at 1080p (DESIGN.md background). */
export const WEBCAM_RING = { width: 4, color: '#FAF7F2' } as const

/** Soft shadow under the bubble at 1080p (smaller than the frame's, same tone). */
export const WEBCAM_SHADOW = { blur: 28, offsetY: 8, color: 'rgba(43, 42, 38, 0.28)' } as const

/**
 * Width and height of each shape, in units of the size's diameter. The rectangles keep about
 * the circle's area at the same size, so switching shape does not make the camera jump in
 * size; 16:9 suits a camera recorded landscape, 9:16 one recorded portrait.
 */
export const WEBCAM_SHAPE_BOX: Readonly<Record<WebcamShape, { width: number; height: number }>> = {
  circle: { width: 1, height: 1 },
  square: { width: 1, height: 1 },
  landscape: { width: 1.4, height: (1.4 * 9) / 16 },
  portrait: { width: (1.4 * 9) / 16, height: 1.4 },
}

/** Corner radius of the square and rectangles, as a fraction of their short side. */
export const WEBCAM_CORNER = 0.18

/** The bubble in one frame, in output pixels. */
export interface WebcamBubble {
  /** center */
  x: number
  y: number
  /** outer size, ring included */
  width: number
  height: number
  /** corner radius of the outer edge; half the side for the circle */
  cornerRadius: number
  /** half the short side (the circle's radius): snap distance and ring limit */
  radius: number
  /** 0..1 */
  opacity: number
}

type BubbleBox = Omit<WebcamBubble, 'opacity'>

/**
 * The bubble's center and size in output pixels, `scale` times its full size. In a corner it
 * keeps the outer corner in place while scaled; at a free `anchor` it keeps its center,
 * pulled in so the full-size bubble stays WEBCAM_MARGIN inside the frame in any format.
 */
export function webcamBubbleBase(
  position: WebcamPosition,
  size: WebcamSize,
  output: Size,
  scale = 1,
  anchor?: { x: number; y: number },
  shape: WebcamShape = 'circle',
): BubbleBox {
  const short = Math.min(output.width, output.height)
  const diameter = WEBCAM_DIAMETER[size] * short
  const box = WEBCAM_SHAPE_BOX[shape]
  const fullW = diameter * box.width
  const fullH = diameter * box.height
  const width = fullW * scale
  const height = fullH * scale
  const radius = Math.min(width, height) / 2
  const cornerRadius = shape === 'circle' ? radius : Math.min(width, height) * WEBCAM_CORNER
  const margin = WEBCAM_MARGIN * short
  if (anchor) {
    const insetX = margin + fullW / 2
    const insetY = margin + fullH / 2
    return {
      x: clamp(anchor.x * output.width, insetX, output.width - insetX),
      y: clamp(anchor.y * output.height, insetY, output.height - insetY),
      width,
      height,
      cornerRadius,
      radius,
    }
  }
  const left = position === 'top-left' || position === 'bottom-left'
  const top = position === 'top-left' || position === 'top-right'
  return {
    x: left ? margin + width / 2 : output.width - margin - width / 2,
    y: top ? margin + height / 2 : output.height - margin - height / 2,
    width,
    height,
    cornerRadius,
    radius,
  }
}

/** Whether `point` (output pixels) falls on the bubble, rounded corners ignored. */
export function webcamBubbleContains(
  bubble: Pick<WebcamBubble, 'x' | 'y' | 'width' | 'height'>,
  point: { x: number; y: number },
): boolean {
  return (
    Math.abs(point.x - bubble.x) <= bubble.width / 2 &&
    Math.abs(point.y - bubble.y) <= bubble.height / 2
  )
}

/**
 * Where a bubble dropped with its center at `center` (output pixels) ends up: the nearest
 * corner when the center lands within half the bubble's short side of that corner's spot
 * (snap), otherwise a free anchor.
 */
export function webcamPlacementAt(
  center: { x: number; y: number },
  size: WebcamSize,
  output: Size,
  shape: WebcamShape = 'circle',
): { position: WebcamPosition; anchor?: { x: number; y: number } } {
  let nearest: WebcamPosition = 'bottom-right'
  let best = Infinity
  for (const corner of WEBCAM_CORNERS) {
    const spot = webcamBubbleBase(corner, size, output, 1, undefined, shape)
    const distance = Math.hypot(spot.x - center.x, spot.y - center.y)
    if (distance < best) {
      best = distance
      nearest = corner
    }
  }
  const { radius } = webcamBubbleBase(nearest, size, output, 1, undefined, shape)
  if (best <= radius) return { position: nearest }
  // Stored already clamped, so the anchor is where the bubble is actually drawn.
  const placed = webcamBubbleBase(
    nearest,
    size,
    output,
    1,
    { x: center.x / output.width, y: center.y / output.height },
    shape,
  )
  return { position: nearest, anchor: { x: placed.x / output.width, y: placed.y / output.height } }
}

const WEBCAM_CORNERS: readonly WebcamPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

/**
 * Size factor for a camera scale (1 = not zoomed): 1 at rest, WEBCAM_SHRINK_MIN from
 * WEBCAM_FULL_SHRINK_SCALE up, smoothstep in between so a slight zoom barely shrinks it.
 */
export function webcamShrink(cameraScale: number): number {
  const amount = clamp((cameraScale - 1) / (WEBCAM_FULL_SHRINK_SCALE - 1), 0, 1)
  const eased = amount * amount * (3 - 2 * amount)
  return 1 - (1 - WEBCAM_SHRINK_MIN) * eased
}

/**
 * How visible the bubble is at `timeMs` given the hidden stretches: 1 = fully shown,
 * 0 = gone. The spring target is 0 from WEBCAM_FADE_LEAD_MS before each stretch until its
 * end, 1 otherwise; the value is the exact spring response, so it only depends on time.
 * Always 0 inside a stretch.
 */
export function webcamVisibility(
  hidden: readonly { startMs: number; endMs: number }[],
  timeMs: number,
): number {
  if (hidden.some((h) => timeMs >= h.startMs && timeMs < h.endMs)) return 0
  const spans = mergeSpans(
    hidden
      .filter((h) => h.endMs > h.startMs)
      .map((h) => ({ from: h.startMs - WEBCAM_FADE_LEAD_MS, to: h.endMs })),
  )
  let state: SpringState = { x: 1, v: 0 }
  // Time `state` refers to; null = at rest on 1 since forever.
  let at: number | null = null
  for (const span of spans) {
    if (timeMs <= span.from) break
    if (at !== null) state = springStep(state, 1, (span.from - at) / 1000)
    const end = Math.min(span.to, timeMs)
    state = springStep(state, 0, (end - span.from) / 1000)
    at = end
    if (timeMs <= span.to) return clamp(state.x, 0, 1)
  }
  if (at !== null) state = springStep(state, 1, (timeMs - at) / 1000)
  return clamp(state.x, 0, 1)
}

/**
 * The bubble at `timeMs`, or null when nothing is drawn: no webcam, turned off, or inside
 * a hidden stretch. `cameraScale` is the virtual camera's scale at that instant (cameraAt).
 */
export function webcamBubbleAt(
  settings: WebcamSettings | null,
  output: Size,
  timeMs: number,
  cameraScale: number,
): WebcamBubble | null {
  if (!settings || !settings.visible) return null
  const visibility = webcamVisibility(settings.hidden, timeMs)
  if (visibility <= 0) return null
  const shrink = settings.shrinkOnZoom ? webcamShrink(cameraScale) : 1
  const fade = WEBCAM_FADE_MIN_SCALE + (1 - WEBCAM_FADE_MIN_SCALE) * visibility
  const base = webcamBubbleBase(
    settings.position,
    settings.size,
    output,
    shrink * fade,
    settings.anchor,
    settings.shape,
  )
  return { ...base, opacity: visibility }
}

/** Webcam time (ms into webcam.mp4) shown at video time `timeMs` (offsetMs, A-03). */
export function webcamTimeMs(settings: Pick<WebcamSettings, 'offsetMs'>, timeMs: number): number {
  return Math.max(0, timeMs - (settings.offsetMs ?? 0))
}

/**
 * Centered part of the camera frame that fills a bubble of `aspect` (width / height) without
 * stretching (cover fit): a square for the circle, wider or taller for the rectangles.
 */
export function webcamCoverCrop(size: Size, aspect = 1): Box {
  const width = Math.min(size.width, size.height * aspect)
  const height = width / aspect
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height }
}

function mergeSpans(spans: { from: number; to: number }[]): { from: number; to: number }[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  const merged: { from: number; to: number }[] = []
  for (const span of sorted) {
    const last = merged[merged.length - 1]
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to)
    else merged.push({ ...span })
  }
  return merged
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
