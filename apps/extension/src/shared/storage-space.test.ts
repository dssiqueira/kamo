import { describe, expect, it } from 'vitest'
import {
  LOW_SPACE_BYTES,
  PROJECTS_WARNING_BYTES,
  hasLowSpace,
  isOverWarning,
} from './storage-space.ts'

describe('storage space (E-03)', () => {
  it('warns past 2GB of projects', () => {
    expect(isOverWarning(PROJECTS_WARNING_BYTES)).toBe(false)
    expect(isOverWarning(PROJECTS_WARNING_BYTES + 1)).toBe(true)
  })

  it('says the browser is almost full before recording', () => {
    expect(hasLowSpace({ quota: 10e9, usage: 1e9 })).toBe(false)
    expect(hasLowSpace({ quota: 10e9, usage: 10e9 - LOW_SPACE_BYTES + 1 })).toBe(true)
    // Unknown quota: no warning rather than a false alarm.
    expect(hasLowSpace({})).toBe(false)
  })
})
