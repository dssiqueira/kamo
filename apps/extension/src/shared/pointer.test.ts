import { formatEvent, parseEvents, type MouseEventRecord } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import type { RawPointerSample } from '../content/mouse-capture.ts'
import { RecordingTimer } from './clock.ts'
import { parsePointerSample, toMouseEvent, toVideoPoint } from './pointer.ts'

import samples from '../../fixtures/tab-pointer-samples.json'

const fixture = samples as {
  video: { width: number; height: number }
  recordingStartedAt: number
  samples: unknown[]
}

const sample = (over: Partial<RawPointerSample>): RawPointerSample => ({
  kind: 'move',
  at: 0,
  x: 0,
  y: 0,
  vw: 1280,
  vh: 720,
  scale: 1,
  ox: 0,
  oy: 0,
  ...over,
})

describe('toVideoPoint', () => {
  const video = { width: 1920, height: 1080 }

  it('scales CSS pixels to the video (DPR and browser zoom fold into the viewport size)', () => {
    expect(toVideoPoint(sample({ x: 640, y: 360 }), video)).toEqual({ x: 960, y: 540 })
    // Browser zoom 125%: the same spot on screen is in a smaller CSS viewport.
    expect(toVideoPoint(sample({ x: 512, y: 288, vw: 1024, vh: 576 }), video)).toEqual({
      x: 960,
      y: 540,
    })
  })

  it('follows pinch zoom through the visual viewport', () => {
    const point = toVideoPoint(sample({ x: 150, y: 100, scale: 2, ox: 100, oy: 50 }), video)
    expect(point).toEqual({ x: 150, y: 150 })
  })

  it('letterboxes a window resized during the recording', () => {
    // 1280×900 into 1920×1080: fit 1.2, a 1536px wide page centered (192px bars each side).
    expect(toVideoPoint(sample({ x: 640, y: 450, vh: 900 }), video)).toEqual({ x: 960, y: 540 })
    expect(toVideoPoint(sample({ x: 0, y: 0, vh: 900 }), video)).toEqual({ x: 192, y: 0 })
  })
})

describe('parsePointerSample', () => {
  it('rejects anything that is not a mouse sample', () => {
    expect(parsePointerSample(null)).toBeNull()
    expect(parsePointerSample(sample({ kind: 'keydown' as never }))).toBeNull()
    expect(parsePointerSample({ ...sample({}), vw: 0 })).toBeNull()
    expect(parsePointerSample(sample({ kind: 'down' }))).toBeNull()
    expect(parsePointerSample({ ...sample({ kind: 'scroll' }), dx: 1 })).toBeNull()
  })

  it('keeps only the known fields', () => {
    const parsed = parsePointerSample({ ...sample({ kind: 'down', button: 0 }), text: 'secret' })
    expect(parsed).not.toHaveProperty('text')
  })
})

describe('events.jsonl from the fixture', () => {
  it('lands every mouse sample in video pixels and recording time', () => {
    let now = fixture.recordingStartedAt
    const timer = new RecordingTimer(30, () => now)
    timer.start()
    now += 10_000
    const events: MouseEventRecord[] = []
    for (const raw of fixture.samples) {
      const parsed = parsePointerSample(raw)
      if (!parsed) continue
      const t = timer.recordedAt(parsed.at)
      if (t === null) continue
      const event = toMouseEvent(parsed, fixture.video, t)
      if (event) events.push(event)
    }
    const jsonl = events.map((e) => formatEvent(e)).join('')
    // Same format as the desktop: the core parser reads it back without skipping a line.
    expect(parseEvents(jsonl).skippedLines).toEqual([])
    expect(jsonl).toMatchSnapshot()
    expect(events.map((e) => e.type)).toEqual([
      'move',
      'down',
      'up',
      'down',
      'down',
      'down',
      'down',
      'scroll',
      'move',
    ])
    expect(events.at(-1)).toMatchObject({ type: 'move', outside: true })
  })
})

describe('RecordingTimer.recordedAt', () => {
  it('drops what happens while paused and removes the pause from later times', () => {
    let now = 0
    const timer = new RecordingTimer(30, () => now)
    timer.start()
    now = 1000
    timer.pause()
    expect(timer.recordedAt(1100)).toBeNull()
    now = 3000
    timer.resume()
    expect(timer.recordedAt(2999)).toBeNull()
    expect(timer.recordedAt(3500)).toBe(1500)
  })
})
