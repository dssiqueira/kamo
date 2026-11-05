import type { MouseEventRecord } from '@kamo/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabEventSource } from './tab-events.ts'

const listeners = new Set<unknown>()
vi.stubGlobal('chrome', {
  runtime: {
    onConnect: {
      addListener: (l: unknown) => listeners.add(l),
      removeListener: (l: unknown) => listeners.delete(l),
    },
  },
})
afterEach(() => listeners.clear())

const sample = {
  kind: 'down',
  at: 2000,
  x: 100,
  y: 50,
  button: 0,
  vw: 1000,
  vh: 500,
  scale: 1,
  ox: 0,
  oy: 0,
}

function source(recordedAt: (wall: number) => number | null = (wall) => wall - 1000) {
  const events: MouseEventRecord[] = []
  const tab = new TabEventSource({
    tabId: 7,
    video: () => ({ width: 2000, height: 1000 }),
    recordedAt,
  })
  void tab.start((event) => events.push(event))
  return { tab, events }
}

describe('TabEventSource (E-02)', () => {
  it('turns samples into events in video pixels on the recording clock', () => {
    const { tab, events } = source()
    tab.receive(sample)
    expect(events).toEqual([{ t: 1000, x: 200, y: 100, type: 'down', button: 'left' }])
    expect(listeners.size).toBe(1)
  })

  it('drops samples while paused, before the start and that are not mouse samples', () => {
    const { tab, events } = source((wall) => (wall < 1500 ? null : wall - 1000))
    tab.pause()
    tab.receive(sample)
    tab.resume()
    tab.receive({ ...sample, at: 1200 })
    tab.receive({ ...sample, kind: 'keydown' })
    tab.receive('click')
    expect(events).toEqual([])
  })

  it('stops listening on stop', async () => {
    const { tab, events } = source()
    await tab.stop()
    tab.receive(sample)
    expect(events).toEqual([])
    expect(listeners.size).toBe(0)
  })
})
