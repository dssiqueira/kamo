import { describe, expect, it } from 'vitest'
import { REST_POSE, gazeDelayMs, gazeTimeline, pickGazeMove } from './gaze.ts'

describe('pickGazeMove', () => {
  it('is mostly blinks, with glances now and then', () => {
    expect(pickGazeMove(0)).toBe('blink')
    expect(pickGazeMove(0.44)).toBe('blink')
    expect(pickGazeMove(0.5)).toBe('glance-side')
    expect(pickGazeMove(0.75)).toBe('glance-up')
    expect(pickGazeMove(0.9)).toBe('double-blink')
    expect(pickGazeMove(0.999)).toBe('double-blink')
  })

  it('never repeats a glance right away', () => {
    expect(pickGazeMove(0.5, 'glance-side')).toBe('blink')
    expect(pickGazeMove(0.75, 'glance-up')).toBe('blink')
    expect(pickGazeMove(0.5, 'glance-up')).toBe('glance-side')
    expect(pickGazeMove(0, 'blink')).toBe('blink')
  })
})

describe('gazeTimeline', () => {
  it('blinks for under a quarter second and looks back', () => {
    expect(gazeTimeline('blink')).toEqual([
      { pose: 'head-blink', atMs: 0 },
      { pose: REST_POSE, atMs: 180 },
    ])
  })

  it('every move ends at rest, in order, within two seconds', () => {
    for (const move of ['blink', 'double-blink', 'glance-side', 'glance-up'] as const) {
      const steps = gazeTimeline(move)
      expect(steps.at(-1)?.pose).toBe(REST_POSE)
      expect(steps[0]?.atMs).toBe(0)
      const times = steps.map((s) => s.atMs)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(steps.at(-1)?.atMs).toBeLessThanOrEqual(2000)
    }
  })
})

describe('gazeDelayMs', () => {
  it('rests 3 to 7 seconds', () => {
    expect(gazeDelayMs(0)).toBe(3000)
    expect(gazeDelayMs(1)).toBe(7000)
    expect(gazeDelayMs(2)).toBe(7000)
  })
})
