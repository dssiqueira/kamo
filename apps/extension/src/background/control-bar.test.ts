import { describe, expect, it } from 'vitest'
import type { Session } from '../shared/messages.ts'
import { BAR_MARGIN, BAR_SIZE, barBounds, planBar } from './control-bar.ts'

const ids = { tabId: 1, projectId: 'p' }
const recording = (state: 'recording' | 'paused' = 'recording'): Session => ({
  phase: 'recording',
  ...ids,
  clock: { state, elapsedMs: 1000, at: 0, fps: 30 },
})

describe('planBar', () => {
  it('opens a bar once the recording starts', () => {
    expect(planBar(recording(), undefined, [])).toEqual({ open: true, close: [], next: undefined })
  })

  it('keeps the bar while paused (it shows Resume)', () => {
    expect(planBar(recording('paused'), 7, [7])).toEqual({ open: false, close: [], next: 7 })
  })

  it('does not open a second bar when the worker restarts with one open', () => {
    expect(planBar(recording(), 7, [7])).toEqual({ open: false, close: [], next: 7 })
  })

  it('adopts an open bar it lost track of instead of opening another', () => {
    expect(planBar(recording(), undefined, [9])).toEqual({ open: false, close: [], next: 9 })
    expect(planBar(recording(), 'closed', [9])).toEqual({ open: false, close: [], next: 9 })
  })

  it('closes duplicates, keeping the one this recording opened', () => {
    expect(planBar(recording(), 7, [9, 7, 11])).toEqual({ open: false, close: [9, 11], next: 7 })
    expect(planBar(recording(), 5, [9, 11])).toEqual({ open: false, close: [11], next: 9 })
  })

  it('does not reopen a bar the user closed; the recording goes on', () => {
    expect(planBar(recording(), 7, [])).toEqual({ open: false, close: [], next: 'closed' })
    expect(planBar(recording(), 'closed', [])).toEqual({ open: false, close: [], next: 'closed' })
  })

  it('closes every bar and forgets it outside a recording (stop, save, cancel, failure)', () => {
    const others: Session[] = [
      { phase: 'idle' },
      { phase: 'countdown', ...ids, value: 2 },
      { phase: 'starting', ...ids },
      { phase: 'saving', ...ids },
    ]
    for (const session of others) {
      expect(planBar(session, 7, [7])).toEqual({ open: false, close: [7], next: undefined })
      expect(planBar(session, 'closed', [])).toEqual({ open: false, close: [], next: undefined })
      expect(planBar(session, undefined, [])).toEqual({ open: false, close: [], next: undefined })
    }
  })

  it('a new recording after one whose bar was closed opens a bar again', () => {
    // The bar record is cleared when the session leaves 'recording'.
    const after = planBar({ phase: 'saving', ...ids }, 'closed', []).next
    expect(planBar(recording(), after, []).open).toBe(true)
  })
})

describe('barBounds', () => {
  it('sits bottom-center of the browser window', () => {
    const bounds = barBounds({ left: 100, top: 50, width: 1280, height: 800 })
    expect(bounds).toEqual({
      ...BAR_SIZE,
      left: 100 + (1280 - BAR_SIZE.width) / 2,
      top: 50 + 800 - BAR_SIZE.height - BAR_MARGIN,
    })
  })

  it('stays inside a window smaller than the bar', () => {
    expect(barBounds({ left: 10, top: 20, width: 200, height: 90 })).toEqual({
      ...BAR_SIZE,
      left: 10,
      top: 20,
    })
  })

  it('lets Chrome place it when the window has no bounds', () => {
    expect(barBounds({})).toEqual(BAR_SIZE)
  })
})
