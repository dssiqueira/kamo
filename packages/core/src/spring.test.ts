import { describe, expect, it } from 'vitest'
import { SPRING, springSettleTime, springSettled, springStep, type SpringState } from './spring.ts'

function run(dt: number, seconds: number, start: SpringState = { x: 0, v: 0 }, target = 1) {
  let state = start
  for (let t = 0; t < seconds - 1e-9; t += dt) state = springStep(state, target, dt)
  return state
}

describe('springStep', () => {
  it('lands on the same value no matter how time is split (preview = export)', () => {
    const at30fps = run(1 / 30, 0.5)
    const at60fps = run(1 / 60, 0.5)
    const at1ms = run(1 / 1000, 0.5)
    expect(at60fps.x).toBeCloseTo(at30fps.x, 9)
    expect(at1ms.x).toBeCloseTo(at30fps.x, 9)
    expect(at1ms.v).toBeCloseTo(at30fps.v, 6)
  })

  it('matches a fine numeric integration of the same spring', () => {
    let numeric: SpringState = { x: 0, v: 0 }
    const dt = 1e-5
    for (let t = 0; t < 0.3; t += dt) {
      const a = -SPRING.stiffness * (numeric.x - 1) - SPRING.damping * numeric.v
      numeric = { x: numeric.x + numeric.v * dt, v: numeric.v + a * dt }
    }
    expect(run(0.3, 0.3).x).toBeCloseTo(numeric.x, 3)
  })

  it('eases in and out instead of moving linearly (rule 10)', () => {
    const quarter = run(0.05, 0.05).x
    const half = run(0.1, 0.1).x
    // A linear move would cover equal distance in equal time; a spring starts slow.
    expect(quarter).toBeLessThan(half / 2)
  })

  it('settles on the target and stays there', () => {
    const settled = run(1 / 60, 2)
    expect(springSettled(settled, 1)).toBe(true)
    expect(Math.abs(run(1 / 60, 3).x - 1)).toBeLessThan(1e-3)
  })

  it('handles critically and over damped configs', () => {
    const critical = { stiffness: 100, damping: 20 }
    const over = { stiffness: 100, damping: 40 }
    for (const config of [critical, over]) {
      let state: SpringState = { x: 0, v: 0 }
      for (let i = 0; i < 300; i++) state = springStep(state, 1, 1 / 100, config)
      expect(state.x).toBeCloseTo(1, 3)
      expect(state.x).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('does nothing for zero or negative dt', () => {
    expect(springStep({ x: 3, v: 2 }, 0, 0)).toEqual({ x: 3, v: 2 })
  })
})

describe('springSettleTime', () => {
  it('is around half a second for the Kamo spring', () => {
    const seconds = springSettleTime(1)
    expect(seconds).toBeGreaterThan(0.3)
    expect(seconds).toBeLessThan(1)
  })
})
