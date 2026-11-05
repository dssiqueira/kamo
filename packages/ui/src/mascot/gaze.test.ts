import { describe, expect, it } from 'vitest'
import { REST_POSE, gazeDelayMs, gazeTimeline, pickGazeMove } from './gaze.ts'

describe('REST_POSE', () => {
  it('looks straight ahead', () => {
    expect(REST_POSE).toBe('head-look-side')
  })
})

describe('pickGazeMove', () => {
  it('is mostly blinks, with glances now and then', () => {
    expect(pickGazeMove(0)).toBe('blink')
    expect(pickGazeMove(0.44)).toBe('blink')
    expect(pickGazeMove(0.5)).toBe('glance-back')
    expect(pickGazeMove(0.75)).toBe('glance-up')
    expect(pickGazeMove(0.9)).toBe('double-blink')
    expect(pickGazeMove(0.999)).toBe('double-blink')
  })

  it('never repeats a glance right away', () => {
    expect(pickGazeMove(0.5, 'glance-back')).toBe('blink')
    expect(pickGazeMove(0.75, 'glance-up')).toBe('blink')
    expect(pickGazeMove(0.5, 'glance-up')).toBe('glance-back')
    expect(pickGazeMove(0, 'blink')).toBe('blink')
  })
})

describe('gazeTimeline', () => {
  it('blinks for under a quarter second and looks ahead again', () => {
    expect(gazeTimeline('blink')).toEqual([
      { pose: 'head-blink', atMs: 0 },
      { pose: REST_POSE, atMs: 180 },
    ])
  })

  it('every move is a short excursion that ends looking ahead', () => {
    for (const move of ['blink', 'double-blink', 'glance-back', 'glance-up'] as const) {
      const steps = gazeTimeline(move)
      expect(steps.at(-1)?.pose).toBe(REST_POSE)
      expect(steps[0]?.atMs).toBe(0)
      const times = steps.map((s) => s.atMs)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(steps.at(-1)?.atMs).toBeLessThanOrEqual(1000)
    }
  })
})

describe('gazeDelayMs', () => {
  it('rests 6 to 12 seconds', () => {
    expect(gazeDelayMs(0)).toBe(6000)
    expect(gazeDelayMs(1)).toBe(12000)
    expect(gazeDelayMs(2)).toBe(12000)
  })
})
