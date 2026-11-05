import { describe, expect, it } from 'vitest'
import { LOW_SPACE_BYTES, hasLowSpace } from './storage-space.ts'

describe('storage space (E-03)', () => {
  it('says the browser is almost full before recording', () => {
    expect(hasLowSpace({ quota: 10e9, usage: 1e9 })).toBe(false)
    expect(hasLowSpace({ quota: 10e9, usage: 10e9 - LOW_SPACE_BYTES + 1 })).toBe(true)
    // Unknown quota: no warning rather than a false alarm.
    expect(hasLowSpace({})).toBe(false)
  })
})
