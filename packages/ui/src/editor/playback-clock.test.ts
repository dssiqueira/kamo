import { describe, expect, it, vi } from 'vitest'
import { createPlaybackClock, fixedPlaybackClock } from './playback-clock.ts'

describe('createPlaybackClock', () => {
  it('starts at the initial time', () => {
    expect(createPlaybackClock(1200).get()).toBe(1200)
  })

  it('notifies every listener when the time changes', () => {
    const clock = createPlaybackClock(0)
    const a = vi.fn()
    const b = vi.fn()
    clock.subscribe(a)
    clock.subscribe(b)
    clock.set(33.3)
    expect(clock.get()).toBe(33.3)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the time does not change (a repeated frame, a NaN)', () => {
    const clock = createPlaybackClock(500)
    const listener = vi.fn()
    clock.subscribe(listener)
    clock.set(500)
    clock.set(Number.NaN)
    expect(listener).not.toHaveBeenCalled()
    expect(clock.get()).toBe(500)
  })

  it('stops notifying after unsubscribe, even from inside a notification', () => {
    const clock = createPlaybackClock(0)
    const later = vi.fn()
    let unsubscribeLater = () => {}
    const first = vi.fn(() => unsubscribeLater())
    clock.subscribe(first)
    unsubscribeLater = clock.subscribe(later)
    clock.set(1)
    // `later` was removed while the first listener ran: this round still reaches it once.
    expect(later).toHaveBeenCalledTimes(1)
    clock.set(2)
    expect(first).toHaveBeenCalledTimes(2)
    expect(later).toHaveBeenCalledTimes(1)
  })

  it('a subscribe function works unbound (as useSyncExternalStore calls it)', () => {
    const clock = createPlaybackClock(0)
    const { subscribe, get } = clock
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    clock.set(10)
    expect(get()).toBe(10)
    unsubscribe()
    clock.set(20)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('fixedPlaybackClock', () => {
  it('always reads the same time and never notifies', () => {
    const clock = fixedPlaybackClock(42)
    const listener = vi.fn()
    const unsubscribe = clock.subscribe(listener)
    expect(clock.get()).toBe(42)
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
  })
})
