// Split layout (A-02 + A-03): in the vertical 9:16 format the screen and the camera can be
// stacked instead of floating the bubble over the video. Pure math, shared by the editor
// preview and the export (rule 11).
//
// Decisions:
// - Two cards on the wallpaper, like the 16:9 frame: the style's padding, corners and shadow
//   apply to both, and the gap between them equals the side margin (padding × the short
//   side), so the gutters read as one grid. With padding 0 the gap is 0 and the two cards
//   meet edge to edge, a full-bleed split; one rule covers both looks.
// - `ratio` is the screen's share of the height left after the gap, clamped to
//   SPLIT_RATIO_MIN..SPLIT_RATIO_MAX so neither card gets too thin to read.
// - The screen card crops the recording like any crop format: it follows the virtual camera
//   and the cursor (framing.ts), with the card's own aspect.
// - The camera card cover-crops the webcam frame and mirrors it, like the bubble.
// - Hidden stretches: the camera card and the gap collapse toward the outer edge with the
//   bubble's visibility spring (webcamVisibility, a pure function of time), and the screen
//   card grows to the full height. Inside a stretch it is a plain 9:16 crop.
// - Only 9:16: in 16:9 and 1:1 a stacked camera would leave the screen too small, so those
//   formats keep the bubble.
import type { Aspect, WebcamSettings, WebcamSplit } from '../project/schema.ts'
import { paddedArea } from './layout.ts'
import type { Box, Size } from './types.ts'

export const SPLIT_RATIO_MIN = 0.3
export const SPLIT_RATIO_MAX = 0.7
export const SPLIT_RATIO_DEFAULT = 0.5

export interface SplitRegions {
  /** where the screen card goes, output pixels */
  screen: Box
  /** where the camera card goes; zero height when fully hidden */
  camera: Box
  /** space between the two cards at this visibility */
  gap: number
}

/** True when the webcam shows as a split card in this format (9:16, split, turned on). */
export function isSplitLayout(webcam: WebcamSettings | null | undefined, aspect: Aspect): boolean {
  return !!webcam && webcam.visible && webcam.layout === 'split' && aspect === '9:16'
}

/** The screen's share of the height, clamped; SPLIT_RATIO_DEFAULT when unset. */
export function splitRatio(split: WebcamSplit | undefined): number {
  const ratio = split?.ratio ?? SPLIT_RATIO_DEFAULT
  return Number.isFinite(ratio)
    ? clamp(ratio, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX)
    : SPLIT_RATIO_DEFAULT
}

/** Gap between the cards when the camera is fully shown: the side margin. */
export function splitGap(output: Size, padding: number): number {
  return (clamp(padding, 0, 20) / 100) * Math.min(output.width, output.height)
}

/**
 * The two cards for `visibility` (1 = camera shown, 0 = hidden: the screen takes the whole
 * padded area). The camera card and the gap shrink toward the outer edge.
 */
export function splitRegions(
  output: Size,
  padding: number,
  split: WebcamSplit | undefined,
  visibility = 1,
): SplitRegions {
  const area = paddedArea(output, padding)
  const v = clamp(visibility, 0, 1)
  const fullGap = Math.min(splitGap(output, padding), area.height / 4)
  const available = area.height - fullGap
  const cameraFull = available * (1 - splitRatio(split))
  const cameraHeight = cameraFull * v
  const gap = fullGap * v
  const screenHeight = area.height - cameraHeight - gap
  const cameraFirst = split?.cameraFirst === true
  const screenY = cameraFirst ? area.y + cameraHeight + gap : area.y
  const cameraY = cameraFirst ? area.y : area.y + screenHeight + gap
  return {
    screen: { x: area.x, y: screenY, width: area.width, height: screenHeight },
    camera: { x: area.x, y: cameraY, width: area.width, height: cameraHeight },
    gap,
  }
}

/** Middle of the gap between the cards (camera shown), where the divider handle sits. */
export function splitDividerY(output: Size, padding: number, split: WebcamSplit | undefined) {
  const { screen, camera, gap } = splitRegions(output, padding, split, 1)
  const upper = split?.cameraFirst === true ? camera : screen
  return upper.y + upper.height + gap / 2
}

/**
 * The ratio that puts the divider at `y` (output pixels), clamped and rounded to 0.01 so a
 * drag stores tidy values.
 */
export function splitRatioAt(output: Size, padding: number, cameraFirst: boolean, y: number) {
  const area = paddedArea(output, padding)
  const gap = Math.min(splitGap(output, padding), area.height / 4)
  const available = area.height - gap
  const screenHeight = cameraFirst ? area.y + area.height - y - gap / 2 : y - gap / 2 - area.y
  const ratio = clamp(screenHeight / available, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX)
  return Math.round(ratio * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
