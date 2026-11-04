// Click ripple easing (F-07). The cursor track reports a linear `progress` 0..1; here it is
// reshaped by the 170/26 spring (rule 10), so the ring grows and fades like everything else
// in Kamo instead of at constant speed.
import { CLICK_RIPPLE_MS } from '../cursor/cursor.ts'
import { springStep } from '../spring.ts'

/** Ripple radius at the click and at the end, in cursor units (video px at size 1.0). */
export const RIPPLE_START_RADIUS = 4
export const RIPPLE_END_RADIUS = 22
/** Opacity right at the click. */
export const RIPPLE_START_OPACITY = 0.9

const RIPPLE_SECONDS = CLICK_RIPPLE_MS / 1000
const SPRING_AT_END = springStep({ x: 0, v: 0 }, 1, RIPPLE_SECONDS).x

/**
 * Spring easing of the ripple's linear progress: a unit spring released from rest at the
 * click, sampled at `progress × CLICK_RIPPLE_MS` and normalized so 1 maps to exactly 1.
 * Starts slowly (zero velocity), rushes through the middle and settles at the end.
 */
export function rippleEase(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  if (p === 0) return 0
  if (p === 1) return 1
  return springStep({ x: 0, v: 0 }, 1, p * RIPPLE_SECONDS).x / SPRING_AT_END
}

export interface RippleLook {
  /** cursor units; multiply by cursor size × layout scale for output pixels */
  radius: number
  opacity: number
}

/** Radius and opacity of the ripple at `progress`, both driven by rippleEase. */
export function rippleLook(progress: number): RippleLook {
  const e = rippleEase(progress)
  return {
    radius: RIPPLE_START_RADIUS + (RIPPLE_END_RADIUS - RIPPLE_START_RADIUS) * e,
    opacity: RIPPLE_START_OPACITY * (1 - e),
  }
}
