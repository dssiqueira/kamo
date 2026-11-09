import { describe, expect, it } from 'vitest'
import { playCountdownTick, tickFrequency } from './countdown-sound.ts'

describe('countdown tick (F-01)', () => {
  it('rises on the last number so it reads as "now"', () => {
    expect(tickFrequency(3)).toBe(tickFrequency(2))
    expect(tickFrequency(1)).toBeGreaterThan(tickFrequency(2))
  })

  it('never throws, even without Web Audio', () => {
    expect(() => playCountdownTick(3)).not.toThrow()
    expect(() => playCountdownTick(0)).not.toThrow()
  })
})
