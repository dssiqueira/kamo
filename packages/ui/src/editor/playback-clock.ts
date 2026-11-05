// The playhead as a tiny external store. Playback moves it on every presented frame (30–60
// times a second); keeping that out of React state means only the few components that show
// the time (timecodes, the timeline's playhead) re-render per frame, not the whole editor.
import { useSyncExternalStore } from 'react'

export interface PlaybackClock {
  /** Video time now, in ms. */
  get(): number
  /** Called after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

export interface WritablePlaybackClock extends PlaybackClock {
  set(timeMs: number): void
}

export function createPlaybackClock(initialMs: number): WritablePlaybackClock {
  let value = initialMs
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(timeMs) {
      if (timeMs === value || Number.isNaN(timeMs)) return
      value = timeMs
      for (const listener of [...listeners]) listener()
    },
  }
}

/** A fixed time as a clock (tests, and callers that only have a number). */
export function fixedPlaybackClock(timeMs: number): PlaybackClock {
  return { get: () => timeMs, subscribe: () => () => {} }
}

/** The clock's time; the component re-renders on every change. */
export function usePlaybackTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.get, clock.get)
}

/**
 * Something derived from the clock's time (a boolean, a whole frame): the component
 * re-renders only when that value changes, not on every frame. `select` must return a
 * primitive (or the same object for the same input).
 */
export function usePlaybackValue<T>(clock: PlaybackClock, select: (timeMs: number) => T): T {
  const snapshot = () => select(clock.get())
  return useSyncExternalStore(clock.subscribe, snapshot, snapshot)
}
