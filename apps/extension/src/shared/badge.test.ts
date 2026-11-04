import { describe, expect, it } from 'vitest'
import { formatBadge } from './badge.ts'

describe('formatBadge', () => {
  it('shows m:ss under ten minutes', () => {
    expect(formatBadge(0, 'en')).toBe('0:00')
    expect(formatBadge(42_900, 'en')).toBe('0:42')
    expect(formatBadge(599_999, 'en')).toBe('9:59')
  })

  it('shortens to whole minutes, then hours, through Intl', () => {
    expect(formatBadge(12 * 60_000 + 30_000, 'en')).toBe('12m')
    expect(formatBadge(75 * 60_000, 'en')).toBe('1h')
    const minutes = new Intl.NumberFormat('ja', {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'narrow',
    }).format(12)
    expect(formatBadge(12 * 60_000, 'ja')).toBe(minutes)
  })

  it('never goes negative', () => {
    expect(formatBadge(-500, 'en')).toBe('0:00')
  })
})
