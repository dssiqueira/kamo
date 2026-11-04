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
// - Shrink on zoom follows the camera's own scale, which is already the 170/26 spring
//   (rule 10). No second spring, so the bubble moves exactly with the zoom and stays a pure
//   function of time. While shrinking, the bubble keeps its outer corner in place.
// - Hidden stretches fade (opacity) and scale the bubble with the same spring. The fade out
//   starts WEBCAM_FADE_LEAD_MS before the stretch so it is gone when the stretch begins;
//   the fade in starts when the stretch ends. Inside a stretch the bubble is never drawn.
import { springSettleTime, springStep, type SpringState } from '../spring.ts'
import type { WebcamPosition, WebcamSettings, WebcamSize } from '../project/schema.ts'
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

/** The bubble in one frame, in output pixels. */
export interface WebcamBubble {
  /** center */
  x: number
  y: number
  /** outer radius, ring included */
  radius: number
  /** 0..1 */
  opacity: number
}

/** The bubble at its full size (no shrink, no fade): center and radius, output pixels. */
export function webcamBubbleBase(
  position: WebcamPosition,
  size: WebcamSize,
  output: Size,
  scale = 1,
): { x: number; y: number; radius: number } {
  const short = Math.min(output.width, output.height)
  const radius = (WEBCAM_DIAMETER[size] * short * scale) / 2
  const margin = WEBCAM_MARGIN * short
  const left = position === 'top-left' || position === 'bottom-left'
  const top = position === 'top-left' || position === 'top-right'
  return {
    x: left ? margin + radius : output.width - margin - radius,
    y: top ? margin + radius : output.height - margin - radius,
    radius,
  }
}

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
  const base = webcamBubbleBase(settings.position, settings.size, output, shrink * fade)
  return { ...base, opacity: visibility }
}

/** Webcam time (ms into webcam.mp4) shown at video time `timeMs` (offsetMs, A-03). */
export function webcamTimeMs(settings: Pick<WebcamSettings, 'offsetMs'>, timeMs: number): number {
  return Math.max(0, timeMs - (settings.offsetMs ?? 0))
}

/** Centered square of the camera frame that fills the circle (cover fit). */
export function webcamCoverCrop(size: Size): Box {
  const side = Math.min(size.width, size.height)
  return { x: (size.width - side) / 2, y: (size.height - side) / 2, width: side, height: side }
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
