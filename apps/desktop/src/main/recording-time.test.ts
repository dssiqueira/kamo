import { describe, expect, it } from 'vitest'
import { formatTimecodeShort } from './recording-time.ts'

describe('formatTimecodeShort', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [61_000, '1:01'],
    [3_723_000, '1:02:03'],
    [-5, '0:00'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatTimecodeShort(ms)).toBe(text)
  })
})
