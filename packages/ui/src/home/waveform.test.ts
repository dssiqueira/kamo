import { SPRING } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import {
  WAVE_BARS,
  WAVE_FLOOR,
  stepWave,
  waveEnvelope,
  waveSeed,
  waveTargets,
  type WaveBar,
} from './waveform.ts'

describe('waveTargets', () => {
  it('is a row of dots in silence', () => {
    const heights = waveTargets(0, 7)
    expect(heights).toHaveLength(WAVE_BARS)
    for (const height of heights) expect(height).toBeCloseTo(WAVE_FLOOR)
  })

  it('is taller in the middle than on the sides', () => {
    const heights = waveTargets(0.8, 3)
    const middle = heights[(WAVE_BARS - 1) / 2] ?? 0
    expect(middle).toBeGreaterThan((heights[0] ?? 0) * 3)
    expect(middle).toBeGreaterThan((heights[WAVE_BARS - 1] ?? 0) * 3)
  })

  it('stays between 0 and 1, even for a level out of range', () => {
    for (const level of [-1, 0.3, 1, 5]) {
      for (const height of waveTargets(level, 11)) {
        expect(height).toBeGreaterThanOrEqual(0)
        expect(height).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is the same for the same level and tick (no random flicker)', () => {
    expect(waveTargets(0.6, 42)).toEqual(waveTargets(0.6, 42))
  })

  it('drifts only a little from one update to the next', () => {
    const a = waveTargets(0.7, 10)
    const b = waveTargets(0.7, 11)
    for (let i = 0; i < WAVE_BARS; i++) {
      expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(0.25)
    }
  })
})

describe('waveEnvelope and waveSeed', () => {
  it('peaks at 1 in the middle and is symmetric', () => {
    expect(waveEnvelope(15, 31)).toBe(1)
    expect(waveEnvelope(0, 31)).toBeCloseTo(waveEnvelope(30, 31))
    expect(waveEnvelope(0, 1)).toBe(1)
  })

  it('gives each bar a fixed number in [0, 1)', () => {
    for (let i = 0; i < WAVE_BARS; i++) {
      expect(waveSeed(i)).toBeGreaterThanOrEqual(0)
      expect(waveSeed(i)).toBeLessThan(1)
      expect(waveSeed(i)).toBe(waveSeed(i))
    }
  })
})

describe('stepWave', () => {
  it('uses the Kamo spring and settles on the target', () => {
    expect(SPRING).toMatchObject({ stiffness: 170, damping: 26 })
    const bars: WaveBar[] = [{ x: 0, v: 0 }]
    let moving = true
    let frames = 0
    while (moving && frames < 600) {
      moving = stepWave(bars, [0.9], 1 / 60)
      frames++
    }
    expect(moving).toBe(false)
    expect(bars[0]?.x).toBe(0.9)
    // Settles in well under two seconds, so it follows speech.
    expect(frames).toBeLessThan(120)
  })

  it('caps a long frame instead of jumping', () => {
    const bars: WaveBar[] = [{ x: 0, v: 0 }]
    stepWave(bars, [1], 5)
    expect(bars[0]?.x).toBeLessThan(0.2)
  })
})
