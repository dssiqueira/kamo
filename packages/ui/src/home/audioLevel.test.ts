import { describe, expect, it } from 'vitest'
import { METER_FLOOR_DB, levelFromRms, rmsOf, smoothLevel } from './audioLevel.ts'

describe('rmsOf', () => {
  it('is 0 for silence and for no samples', () => {
    expect(rmsOf(new Float32Array(128))).toBe(0)
    expect(rmsOf([])).toBe(0)
  })

  it('is the amplitude of a square wave and amplitude / sqrt(2) of a sine', () => {
    expect(rmsOf([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5)
    const sine = Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * i) / 48))
    expect(rmsOf(sine)).toBeCloseTo(Math.SQRT1_2, 3)
  })
})

describe('levelFromRms', () => {
  it('maps the dB range to 0..1', () => {
    expect(levelFromRms(1)).toBe(1)
    expect(levelFromRms(0)).toBe(0)
    expect(levelFromRms(10 ** (METER_FLOOR_DB / 20))).toBeCloseTo(0)
    // -30 dBFS, a normal voice at a laptop mic, sits in the middle
    expect(levelFromRms(10 ** (-30 / 20))).toBeCloseTo(0.5)
  })

  it('clamps out-of-range and invalid input', () => {
    expect(levelFromRms(4)).toBe(1)
    expect(levelFromRms(1e-9)).toBe(0)
    expect(levelFromRms(Number.NaN)).toBe(0)
    expect(levelFromRms(-1)).toBe(0)
  })
})

describe('smoothLevel', () => {
  it('rises at once', () => {
    expect(smoothLevel(0.1, 0.8)).toBe(0.8)
  })

  it('falls gradually but reaches silence', () => {
    let level = 1
    const steps: number[] = []
    for (let i = 0; i < 40; i++) {
      level = smoothLevel(level, 0)
      steps.push(level)
    }
    expect(steps[0]).toBeGreaterThan(0.3)
    expect(steps[0]).toBeLessThan(1)
    expect(steps.at(-1)).toBe(0)
    expect(steps.every((value, i) => i === 0 || value <= (steps[i - 1] ?? 1))).toBe(true)
  })
})
