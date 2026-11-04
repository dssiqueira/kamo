import { describe, expect, it } from 'vitest'
import {
  RIPPLE_END_RADIUS,
  RIPPLE_START_OPACITY,
  RIPPLE_START_RADIUS,
  rippleEase,
  rippleLook,
} from './ripple.ts'

describe('rippleEase', () => {
  it('goes from exactly 0 to exactly 1 and clamps outside', () => {
    expect(rippleEase(0)).toBe(0)
    expect(rippleEase(1)).toBe(1)
    expect(rippleEase(-1)).toBe(0)
    expect(rippleEase(2)).toBe(1)
  })

  it('is monotonic', () => {
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const e = rippleEase(i / 100)
      expect(e).toBeGreaterThanOrEqual(previous)
      previous = e
    }
  })

  it('is spring-shaped, not linear: slow start, fast middle, settling end', () => {
    // starts from rest: below the linear line right after the click
    expect(rippleEase(0.03)).toBeLessThan(0.03)
    // most of the motion is done well before the halfway point
    expect(rippleEase(0.5)).toBeGreaterThan(0.7)
    // the last quarter only covers a small remainder
    expect(1 - rippleEase(0.75)).toBeLessThan(0.1)
    // steps are uneven (a linear ease would have them all equal)
    const early = rippleEase(0.3) - rippleEase(0.2)
    const late = rippleEase(0.9) - rippleEase(0.8)
    expect(early).toBeGreaterThan(late * 5)
  })
})

describe('rippleLook', () => {
  it('grows and fades along the eased curve', () => {
    expect(rippleLook(0)).toEqual({ radius: RIPPLE_START_RADIUS, opacity: RIPPLE_START_OPACITY })
    expect(rippleLook(1)).toEqual({ radius: RIPPLE_END_RADIUS, opacity: 0 })
    const mid = rippleLook(0.5)
    const e = rippleEase(0.5)
    expect(mid.radius).toBeCloseTo(
      RIPPLE_START_RADIUS + (RIPPLE_END_RADIUS - RIPPLE_START_RADIUS) * e,
    )
    expect(mid.opacity).toBeCloseTo(RIPPLE_START_OPACITY * (1 - e))
  })
})
