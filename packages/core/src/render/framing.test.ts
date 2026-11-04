import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURE_VIDEO } from '../../fixtures/generate.ts'
import { buildCameraTrack, viewportAt } from '../camera/camera.ts'
import { buildCursorTrack, cursorAt } from '../cursor/cursor.ts'
import { parseEvents, type MouseEventRecord } from '../events/events.ts'
import { DEFAULT_CURSOR } from '../project/schema.ts'
import { generateZooms } from '../zoom/generate.ts'
import {
  FRAMING_DEAD_ZONE,
  buildFramingTrack,
  cropSizeIn,
  framingAt,
  framingFor,
} from './framing.ts'
import { CROP_KEEP_MARGIN, cropFor, outputSize, paddedArea } from './layout.ts'
import { splitRegions } from './split.ts'

const video = { width: FIXTURE_VIDEO.width, height: FIXTURE_VIDEO.height }
const FRAME_MS = 1000 / 30
const FIXTURES = ['spaced-clicks', 'click-burst', 'drag', 'edge-clicks', 'outside-display']

const fixture = (name: string): MouseEventRecord[] =>
  parseEvents(readFileSync(new URL(`../../fixtures/${name}.jsonl`, import.meta.url), 'utf8')).events

function tracks(events: MouseEventRecord[]) {
  const durationMs = (events[events.length - 1]?.t ?? 0) + 1000
  const { zooms } = generateZooms({ events, video, durationMs })
  return {
    durationMs,
    camera: buildCameraTrack({ zooms, events, video, durationMs }),
    cursor: buildCursorTrack({ events, settings: DEFAULT_CURSOR, durationMs }),
  }
}

/** The crop aspects A-02 uses: full 9:16, 1:1 and the split layout's screen card. */
const ASPECTS = (() => {
  const vertical = outputSize('9:16', '1080p')
  const area = paddedArea(vertical, 8)
  const card = splitRegions(vertical, 8, undefined, 1).screen
  return { vertical: area.width / area.height, square: 1, card: card.width / card.height }
})()

const inside = (
  p: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
) =>
  p.x >= box.x - 1e-6 &&
  p.x <= box.x + box.width + 1e-6 &&
  p.y >= box.y - 1e-6 &&
  p.y <= box.y + box.height + 1e-6

describe('buildFramingTrack', () => {
  it('returns null without events or without room to move', () => {
    const { camera, cursor, durationMs } = tracks(fixture('spaced-clicks'))
    expect(buildFramingTrack({ camera, cursor, aspect: 16 / 9, durationMs })).toBeNull()
    const empty = buildCursorTrack({ events: [], settings: DEFAULT_CURSOR, durationMs })
    expect(buildFramingTrack({ camera, cursor: empty, aspect: 9 / 16, durationMs })).toBeNull()
  })

  it('keeps the cursor inside every crop format, on every frame, in every fixture', () => {
    for (const name of FIXTURES) {
      const { camera, cursor, durationMs } = tracks(fixture(name))
      for (const aspect of Object.values(ASPECTS)) {
        const track = buildFramingTrack({ camera, cursor, aspect, durationMs })
        for (let t = 0; t <= durationMs; t += FRAME_MS) {
          const view = viewportAt(camera, t)
          const pointer = cursorAt(cursor, t)
          const crop = cropFor(view, video, aspect, framingAt(track, t), pointer)
          // The camera may leave the cursor out of its own viewport (follow off); inside
          // the viewport the crop always has it.
          if (inside(pointer, view)) {
            expect(inside(pointer, crop), `${name} ${aspect} at ${t}ms`).toBe(true)
          }
        }
      }
    }
  })

  it('moves the crop smoothly (no jumps between frames)', () => {
    for (const name of FIXTURES) {
      const { camera, cursor, durationMs } = tracks(fixture(name))
      const track = buildFramingTrack({ camera, cursor, aspect: ASPECTS.vertical, durationMs })
      let previous = framingAt(track, 0)
      for (let t = FRAME_MS; t <= durationMs; t += FRAME_MS) {
        const at = framingAt(track, t)
        // The spring never covers more than a fraction of the video width per frame.
        expect(Math.abs((at?.x ?? 0) - (previous?.x ?? 0))).toBeLessThan(video.width * 0.06)
        previous = at
      }
    }
  })

  it('holds still while the cursor wiggles inside the dead zone', () => {
    const events: MouseEventRecord[] = []
    for (let t = 0; t <= 4000; t += 16) {
      // ±40px around the center: well inside half the dead zone of a 9:16 crop (~150px).
      events.push({ t, type: 'move', x: 960 + 40 * Math.sin(t / 90), y: 540 })
    }
    const durationMs = 4000
    const camera = buildCameraTrack({ zooms: [], events, video, durationMs })
    const cursor = buildCursorTrack({ events, settings: DEFAULT_CURSOR, durationMs })
    const track = buildFramingTrack({ camera, cursor, aspect: ASPECTS.vertical, durationMs })
    const half = (cropSizeIn(viewportAt(camera, 0), ASPECTS.vertical).width / 2) * FRAMING_DEAD_ZONE
    expect(half).toBeGreaterThan(40)
    const start = framingAt(track, 0)?.x ?? NaN
    expect(Math.abs(start - 960)).toBeLessThanOrEqual(40)
    for (let t = 0; t <= durationMs; t += 100) {
      expect(framingAt(track, t)?.x).toBeCloseTo(start, 6)
    }
  })

  it('follows a cursor that crosses the screen, settling on its new side', () => {
    const events: MouseEventRecord[] = [
      { t: 0, type: 'move', x: 200, y: 540 },
      { t: 2000, type: 'move', x: 200, y: 540 },
      { t: 2016, type: 'move', x: 1700, y: 540 },
    ]
    const durationMs = 5000
    const camera = buildCameraTrack({ zooms: [], events, video, durationMs })
    const cursor = buildCursorTrack({ events, settings: DEFAULT_CURSOR, durationMs })
    const aspect = ASPECTS.vertical
    const track = buildFramingTrack({ camera, cursor, aspect, durationMs })
    const width = cropSizeIn(viewportAt(camera, 0), aspect).width
    // At the start the crop sits on the left edge, around the cursor.
    expect(framingAt(track, 500)?.x).toBeCloseTo(width / 2, 0)
    // After the move it ends with the cursor at the dead zone's edge.
    const end = framingAt(track, 4900)?.x ?? 0
    expect(1700 - end).toBeCloseTo((width / 2) * FRAMING_DEAD_ZONE, 0)
  })

  it('depends only on time: any frame rate reads the same framing', () => {
    const { camera, cursor, durationMs } = tracks(fixture('drag'))
    const track = buildFramingTrack({ camera, cursor, aspect: ASPECTS.card, durationMs })
    const again = buildFramingTrack({ camera, cursor, aspect: ASPECTS.card, durationMs })
    for (const t of [0, 123.4, 1000, 2500.5, durationMs]) {
      expect(framingAt(track, t)).toEqual(framingAt(again, t))
    }
  })
})

describe('cropFor with focus and keep', () => {
  const view = { x: 0, y: 0, width: 1920, height: 1080 }
  const aspect = 9 / 16

  it('centers on the focus, held inside the viewport', () => {
    const crop = cropFor(view, video, aspect, { x: 500, y: 540 })
    expect(crop.x + crop.width / 2).toBeCloseTo(500)
    const edge = cropFor(view, video, aspect, { x: 10, y: 540 })
    expect(edge.x).toBe(0)
  })

  it('moves the least needed to keep the point a margin inside', () => {
    const crop = cropFor(view, video, aspect, { x: 960, y: 540 }, { x: 1400, y: 540 })
    expect(crop.x + crop.width - 1400).toBeCloseTo(crop.width * CROP_KEEP_MARGIN)
    const untouched = cropFor(view, video, aspect, { x: 960, y: 540 }, { x: 1000, y: 540 })
    expect(untouched.x + untouched.width / 2).toBeCloseTo(960)
  })

  it('lets the viewport win when the point is outside it', () => {
    const crop = cropFor(view, video, aspect, { x: 960, y: 540 }, { x: 5000, y: 540 })
    expect(crop.x + crop.width).toBeCloseTo(1920)
  })
})

describe('framingFor', () => {
  it('reuses the track for the same camera, cursor and aspect', () => {
    const { camera, cursor } = tracks(fixture('spaced-clicks'))
    const a = framingFor(camera, cursor, ASPECTS.vertical)
    expect(framingFor(camera, cursor, ASPECTS.vertical)).toBe(a)
    expect(framingFor(camera, cursor, ASPECTS.card)).not.toBe(a)
  })
})
