import { describe, expect, it } from 'vitest'
import { SPRING } from './index.ts'

describe('core', () => {
  it('uses the 170/26 spring from rule 10', () => {
    expect(SPRING).toEqual({ stiffness: 170, damping: 26 })
  })
})
