import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURE_VIDEO } from '../../fixtures/generate.ts'
import { parseEvents, type MouseEventRecord } from '../events/events.ts'
import type { Zoom } from '../project/schema.ts'
import {
  CAMERA_TRAVEL_MS,
  buildCameraTrack,
  cameraAt,
  viewportAt,
  zoomClickMs,
  type CameraTrack,
} from './camera.ts'

const video = { width: FIXTURE_VIDEO.width, height: FIXTURE_VIDEO.height }
const FRAME_MS = 1000 / 30

const fixture = (name: string): MouseEventRecord[] =>
  parseEvents(readFileSync(new URL(`../../fixtures/${name}.jsonl`, import.meta.url), 'utf8')).events

const clicks = (events: MouseEventRecord[]) =>
  events.filter((e) => e.type === 'down' && e.button === 'left')

function zoom(partial: Partial<Zoom> & Pick<Zoom, 'startMs' | 'endMs' | 'target'>): Zoom {
  return {
    id: `z${partial.startMs}`,
    scale: 2,
    follow: false,
    origin: 'manual',
    leadMs: 300,
    ...partial,
  }
}

/** Zoom built by hand the way the generator does it: leadMs before the click, 1s after. */
function zoomOnClick(click: MouseEventRecord, extra: Partial<Zoom> = {}): Zoom {
  const leadMs = 300
  return zoom({
    startMs: Math.max(0, click.t - leadMs),
    endMs: click.t + 1000,
    target: { x: click.x, y: click.y },
    leadMs: Math.min(leadMs, click.t),
    ...extra,
  })
}

function clampedTarget(z: Zoom) {
  const halfW = video.width / (2 * z.scale)
  const halfH = video.height / (2 * z.scale)
  return {
    x: Math.min(Math.max(z.target.x, halfW), video.width - halfW),
    y: Math.min(Math.max(z.target.y, halfH), video.height - halfH),
  }
}

function frames(durationMs: number, fps: number): number[] {
  const out: number[] = []
  for (let i = 0; i * (1000 / fps) <= durationMs; i++) out.push(i * (1000 / fps))
  return out
}

function expectArrived(track: CameraTrack, z: Zoom) {
  const target = clampedTarget(z)
  // Â± 1 frame at 30fps around the click.
  for (const dt of [0, -FRAME_MS, FRAME_MS]) {
    const t = zoomClickMs(z) + dt
    if (t < 0 || t > track.durationMs) continue
    const camera = cameraAt(track, t)
    expect(Math.abs(camera.scale - z.scale) / z.scale).toBeLessThan(0.01)
    expect(Math.abs(camera.x - target.x) / video.width).toBeLessThan(0.02)
    expect(Math.abs(camera.y - target.y) / video.height).toBeLessThan(0.02)
  }
}

function lastT(events: MouseEventRecord[]) {
  return events.at(-1)?.t ?? 0
}

describe('buildCameraTrack', () => {
  it('rests at scale 1, centered, when there are no zooms', () => {
    const events = fixture('no-clicks')
    const track = buildCameraTrack({ zooms: [], events, video, durationMs: lastT(events) })
    for (const t of frames(track.durationMs, 30)) {
      expect(cameraAt(track, t)).toEqual({ x: 960, y: 540, scale: 1 })
    }
    expect(viewportAt(track, 1000)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('arrives at the target at the click instant (Â± 1 frame)', () => {
    const events = fixture('spaced-clicks')
    const zooms = clicks(events).map((c) => zoomOnClick(c))
    const track = buildCameraTrack({ zooms, events, video, durationMs: lastT(events) + 2000 })
    zooms.forEach((z) => expectArrived(track, z))
  })

  it('arrives even at 4× and with a zoom right at the start of the video', () => {
    const zooms = [
      zoom({ startMs: 0, endMs: 1500, leadMs: 100, target: { x: 300, y: 300 }, scale: 4 }),
      zoom({ startMs: 4000, endMs: 4700, leadMs: 0, target: { x: 1500, y: 800 }, scale: 3 }),
    ]
    const track = buildCameraTrack({ zooms, events: [], video, durationMs: 6000 })
    zooms.forEach((z) => expectArrived(track, z))
  })

  it('a zoom shorter than the spring still reaches its target, then goes back to rest', () => {
    const z = zoom({ startMs: 2000, endMs: 2100, leadMs: 100, target: { x: 400, y: 300 } })
    const track = buildCameraTrack({ zooms: [z], events: [], video, durationMs: 5000 })
    expectArrived(track, z)
    const after = cameraAt(track, 5000)
    expect(after.x).toBeCloseTo(960, 3)
    expect(after.y).toBeCloseTo(540, 3)
    expect(after.scale).toBeCloseTo(1, 5)
  })

  it('zooms in and out with a spring: monotonic, not linear', () => {
    const z = zoom({ startMs: 2000, endMs: 4000, target: { x: 960, y: 540 } })
    const track = buildCameraTrack({ zooms: [z], events: [], video, durationMs: 7000 })
    const click = zoomClickMs(z)
    const zoomIn = frames(track.durationMs, 60)
      .filter((t) => t >= click - CAMERA_TRAVEL_MS && t <= click)
      .map((t) => cameraAt(track, t).scale)
    const steps = zoomIn.slice(1).map((s, i) => s - (zoomIn[i] ?? s))
    steps.forEach((step) => expect(step).toBeGreaterThanOrEqual(-1e-9))
    // Eases in and out: slow at both ends, fast in the middle (a linear ramp would be flat).
    const fastest = Math.max(...steps)
    expect(steps.indexOf(fastest)).toBeGreaterThan(0)
    expect(steps[0]).toBeLessThan(fastest * 0.75)
    expect(steps.at(-1)).toBeLessThan(fastest / 5)
    // Before the departure the camera is still; after the end it springs back to 1×.
    expect(cameraAt(track, click - CAMERA_TRAVEL_MS - 50).scale).toBe(1)
    expect(cameraAt(track, 4100).scale).toBeGreaterThan(1)
    expect(cameraAt(track, 4100).scale).toBeLessThan(2)
    expect(cameraAt(track, 6000).scale).toBeCloseTo(1, 3)
  })

  it('never shows outside the video, even for clicks on the edges', () => {
    const events = fixture('edge-clicks')
    const zooms = clicks(events).map((c, i) => zoomOnClick(c, { scale: 2 + i, follow: true }))
    const track = buildCameraTrack({ zooms, events, video, durationMs: lastT(events) + 2000 })
    for (const t of frames(track.durationMs, 60)) {
      const v = viewportAt(track, t)
      expect(v.x).toBeGreaterThanOrEqual(-1e-6)
      expect(v.y).toBeGreaterThanOrEqual(-1e-6)
      expect(v.x + v.width).toBeLessThanOrEqual(video.width + 1e-6)
      expect(v.y + v.height).toBeLessThanOrEqual(video.height + 1e-6)
    }
    // At the click, the corner is in view (pushed to the edge, not centered on it).
    zooms.forEach((z) => expectArrived(track, z))
    const corner = viewportAt(track, zoomClickMs(zooms[0] as Zoom))
    expect(corner.x).toBeCloseTo(0, 0)
    expect(corner.y).toBeCloseTo(0, 0)
  })

  it('keeps the cursor inside the frame while following a drag', () => {
    const events = fixture('drag')
    const down = clicks(events)[0] as MouseEventRecord
    const up = events.find((e) => e.type === 'up') as MouseEventRecord
    const z = zoom({
      startMs: down.t - 300,
      endMs: up.t + 1000,
      target: { x: down.x, y: down.y },
      follow: true,
    })
    const track = buildCameraTrack({ zooms: [z], events, video, durationMs: lastT(events) + 2000 })
    expectArrived(track, z)
    let cursor = { x: down.x, y: down.y }
    let index = 0
    let panned = 0
    for (const t of frames(track.durationMs, 60)) {
      while (index < events.length && (events[index]?.t ?? Infinity) <= t) {
        const e = events[index++] as MouseEventRecord
        cursor = { x: e.x, y: e.y }
      }
      if (t < zoomClickMs(z) || t > z.endMs) continue
      const v = viewportAt(track, t)
      expect(cursor.x).toBeGreaterThanOrEqual(v.x)
      expect(cursor.x).toBeLessThanOrEqual(v.x + v.width)
      expect(cursor.y).toBeGreaterThanOrEqual(v.y)
      expect(cursor.y).toBeLessThanOrEqual(v.y + v.height)
      panned = Math.max(panned, cameraAt(track, t).x - clampedTarget(z).x)
    }
    // The drag goes from x=500 to x=1200, beyond the 2× frame: the camera did follow.
    expect(panned).toBeGreaterThan(200)
  })

  it('does not jitter on small cursor moves inside the dead zone', () => {
    const events: MouseEventRecord[] = []
    for (let t = 1000; t < 3000; t += 16) {
      events.push({ t, type: 'move', x: 960 + Math.sin(t / 50) * 40, y: 540 })
    }
    const z = zoom({ startMs: 700, endMs: 3000, target: { x: 960, y: 540 }, follow: true })
    const track = buildCameraTrack({ zooms: [z], events, video, durationMs: 3000 })
    for (const t of frames(2900, 60).filter((t) => t >= zoomClickMs(z) + 50)) {
      expect(cameraAt(track, t).x).toBeCloseTo(960, 0)
    }
  })

  it('ignores moves outside the recorded display', () => {
    const events: MouseEventRecord[] = [{ t: 900, type: 'move', x: 960, y: 540 }]
    for (let t = 1000; t < 3000; t += 16) {
      events.push({ t, type: 'move', x: 100, y: 100, outside: true })
    }
    const z = zoom({ startMs: 500, endMs: 3000, target: { x: 960, y: 540 }, follow: true })
    const track = buildCameraTrack({ zooms: [z], events, video, durationMs: 3000 })
    for (const t of frames(3000, 60).filter((t) => t >= zoomClickMs(z))) {
      expect(cameraAt(track, t).x).toBeCloseTo(960, 3)
      expect(cameraAt(track, t).y).toBeCloseTo(540, 3)
    }
  })

  it('goes straight between adjacent zooms without passing through 1.0×', () => {
    const zooms = [
      zoom({ startMs: 1000, endMs: 3000, target: { x: 400, y: 300 } }),
      zoom({ startMs: 3000, endMs: 5000, target: { x: 1500, y: 800 } }),
      // A short gap is also bridged.
      zoom({ startMs: 5400, endMs: 7000, target: { x: 900, y: 500 }, scale: 3 }),
    ]
    const track = buildCameraTrack({ zooms, events: [], video, durationMs: 9000 })
    zooms.forEach((z) => expectArrived(track, z))
    const from = zoomClickMs(zooms[0] as Zoom)
    for (const t of frames(7000, 60).filter((t) => t >= from)) {
      expect(cameraAt(track, t).scale).toBeGreaterThan(1.9)
    }
  })

  it('returns to 1.0× between zooms far apart', () => {
    const zooms = [
      zoom({ startMs: 1000, endMs: 2000, target: { x: 400, y: 300 } }),
      zoom({ startMs: 5000, endMs: 6000, target: { x: 1500, y: 800 } }),
    ]
    const track = buildCameraTrack({ zooms, events: [], video, durationMs: 7000 })
    expect(cameraAt(track, 3800).scale).toBeCloseTo(1, 2)
  })

  it('a 1.0× zoom holds the camera at the whole frame', () => {
    const z = zoom({ startMs: 1000, endMs: 3000, target: { x: 200, y: 200 }, scale: 1 })
    const track = buildCameraTrack({ zooms: [z], events: [], video, durationMs: 4000 })
    for (const t of frames(4000, 30)) {
      expect(cameraAt(track, t)).toEqual({ x: 960, y: 540, scale: 1 })
    }
  })

  it('is deterministic: 30fps and 60fps read the same camera at shared instants', () => {
    const events = fixture('click-burst')
    const zooms = clicks(events).map((c) => zoomOnClick(c, { follow: true }))
    const input = { zooms: dropOverlaps(zooms), events, video, durationMs: lastT(events) }
    const a = buildCameraTrack(input)
    const b = buildCameraTrack(input)
    const at30 = new Map(frames(a.durationMs, 30).map((t) => [Math.round(t), cameraAt(a, t)]))
    for (const t of frames(b.durationMs, 60)) {
      const shared = at30.get(Math.round(t))
      if (shared && Math.abs(Math.round(t) - t) < 1e-9) expect(cameraAt(b, t)).toEqual(shared)
    }
    // Every 30fps frame is also a 60fps frame (same instant, same camera).
    for (const t of frames(a.durationMs, 30)) expect(cameraAt(b, t)).toEqual(cameraAt(a, t))
  })

  it('builds 10 minutes of camera quickly and reads it in O(1)', () => {
    const durationMs = 10 * 60 * 1000
    const events: MouseEventRecord[] = []
    for (let t = 0; t < durationMs; t += 1000 / 60) {
      events.push({ t, type: 'move', x: 960 + Math.sin(t / 700) * 800, y: 540 })
    }
    const zooms: Zoom[] = []
    for (let s = 1000; s + 3000 < durationMs; s += 5000) {
      zooms.push(zoom({ startMs: s, endMs: s + 3000, target: { x: 960, y: 540 }, follow: true }))
    }
    const started = performance.now()
    const track = buildCameraTrack({ zooms, events, video, durationMs })
    expect(performance.now() - started).toBeLessThan(300)
    const readStart = performance.now()
    for (let t = 0; t < durationMs; t += 1000 / 60) cameraAt(track, t)
    expect(performance.now() - readStart).toBeLessThan(300)
  })
})

/** Same rule as the generator (no overlap): keeps the first zoom of a collision. */
function dropOverlaps(zooms: Zoom[]): Zoom[] {
  const out: Zoom[] = []
  for (const z of zooms) {
    const previous = out.at(-1)
    if (previous && z.startMs < previous.endMs) previous.endMs = Math.max(previous.endMs, z.endMs)
    else out.push(z)
  }
  return out
}
