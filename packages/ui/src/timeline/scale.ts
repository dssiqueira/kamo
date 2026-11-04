// Pure timeline math: time ↔ pixels, ruler ticks, frame snapping, trim drags and nudges.
// No React and no DOM, so it is unit-tested in Node.
import { minTrimmedMs } from '@kamo/core'

export interface TimeScale {
  readonly durationMs: number
  readonly widthPx: number
  /** milliseconds per pixel (0 when there is no width or no duration) */
  readonly msPerPx: number
  /** position of an instant, in px from the start of the track */
  toPx(ms: number): number
  /** instant under a position, clamped to the video */
  toMs(px: number): number
  /** a horizontal drag distance in ms (not clamped) */
  deltaToMs(dxPx: number): number
}

/** The whole video fits the track width: 0ms at 0px, `durationMs` at `widthPx`. */
export function createTimeScale(durationMs: number, widthPx: number): TimeScale {
  const ok = durationMs > 0 && widthPx > 0
  const msPerPx = ok ? durationMs / widthPx : 0
  const pxPerMs = ok ? widthPx / durationMs : 0
  return {
    durationMs,
    widthPx,
    msPerPx,
    toPx: (ms) => ms * pxPerMs,
    toMs: (px) => Math.min(Math.max(px * msPerPx, 0), Math.max(durationMs, 0)),
    deltaToMs: (dxPx) => dxPx * msPerPx,
  }
}

export function frameMs(fps: number): number {
  return 1000 / fps
}

/** Rounds to the nearest whole frame. */
export function snapToFrame(ms: number, fps: number): number {
  return (Math.round((ms * fps) / 1000) * 1000) / fps
}

/** Major tick step and how many minor divisions it has. Nice values for a video ruler. */
const TICK_STEPS: readonly (readonly [number, number])[] = [
  [100, 2],
  [200, 4],
  [500, 5],
  [1000, 4],
  [2000, 4],
  [5000, 5],
  [10_000, 5],
  [15_000, 3],
  [30_000, 3],
  [60_000, 4],
  [120_000, 4],
  [300_000, 5],
  [600_000, 5],
  [900_000, 3],
  [1_800_000, 3],
  [3_600_000, 4],
]

/** Room a hh:mm:ss:ff label needs on the ruler. */
export const MIN_LABEL_SPACING_PX = 96

export interface TickStep {
  majorMs: number
  minorMs: number
}

/** Smallest nice step whose labels are at least `minSpacingPx` apart. */
export function tickStep(scale: TimeScale, minSpacingPx = MIN_LABEL_SPACING_PX): TickStep {
  const fallback = TICK_STEPS[TICK_STEPS.length - 1] ?? [1000, 4]
  const [majorMs, divisions] =
    TICK_STEPS.find(([step]) => scale.toPx(step) >= minSpacingPx) ?? fallback
  return { majorMs, minorMs: majorMs / divisions }
}

export interface Tick {
  ms: number
  major: boolean
}

export function rulerTicks(scale: TimeScale, step: TickStep = tickStep(scale)): Tick[] {
  if (scale.widthPx <= 0 || scale.durationMs <= 0) return []
  const divisions = Math.round(step.majorMs / step.minorMs)
  const ticks: Tick[] = []
  for (let i = 0; i * step.minorMs <= scale.durationMs; i++) {
    ticks.push({ ms: i * step.minorMs, major: i % divisions === 0 })
  }
  return ticks
}

export type TrimEdge = 'start' | 'end'

export interface TrimDrag {
  startMs: number
  endMs: number
  /** the drag hit the 1s minimum (F-16: prevented, with a warning) */
  limited: boolean
}

/**
 * Trim after dragging one handle by `deltaMs` from where it was when the drag began. The
 * other edge does not move; at least 1s of video always remains.
 */
export function dragTrim(
  edge: TrimEdge,
  trim: { startMs: number; endMs: number },
  durationMs: number,
  deltaMs: number,
): TrimDrag {
  const minLength = minTrimmedMs(durationMs)
  if (edge === 'start') {
    const raw = Math.round(trim.startMs + deltaMs)
    const max = trim.endMs - minLength
    return {
      startMs: Math.min(Math.max(raw, 0), Math.max(max, 0)),
      endMs: trim.endMs,
      limited: raw > max,
    }
  }
  const raw = Math.round(trim.endMs + deltaMs)
  const min = trim.startMs + minLength
  return {
    startMs: trim.startMs,
    endMs: Math.max(Math.min(raw, durationMs), Math.min(min, durationMs)),
    limited: raw < min,
  }
}

/** Arrow keys move by one frame, or by one second with Shift. Other keys: null. */
export function nudgeMs(key: string, shiftKey: boolean, fps: number): number | null {
  const step = shiftKey ? 1000 : frameMs(fps)
  if (key === 'ArrowLeft') return -step
  if (key === 'ArrowRight') return step
  return null
}
