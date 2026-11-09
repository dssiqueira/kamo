import { describe, expect, it } from 'vitest'
import { playCountdownTick, tickRate } from './countdown-sound.ts'

describe('countdown tick (F-01)', () => {
  it('rises on the last number so it reads as "now"', () => {
    expect(tickRate(3)).toBe(tickRate(2))
    expect(tickRate(1)).toBeGreaterThan(tickRate(2))
  })

  it('never throws, even without audio', () => {
    expect(() => playCountdownTick(3)).not.toThrow()
    expect(() => playCountdownTick(0)).not.toThrow()
  })
})
