import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURES } from '../../fixtures/generate.ts'
import { parseEvents, type MouseEventRecord } from '../events/events.ts'
import { DEFAULT_CURSOR, type CursorSettings } from '../project/schema.ts'
import {
  CLICK_RIPPLE_MS,
  CURSOR_ARROW,
  CURSOR_IDLE_MS,
  buildCursorTrack,
  cursorAt,
  type CursorTrack,
} from './cursor.ts'

const FIXTURE_NAMES = Object.keys(FIXTURES)

const fixture = (name: string): MouseEventRecord[] =>
  parseEvents(readFileSync(new URL(`../../fixtures/${name}.jsonl`, import.meta.url), 'utf8')).events

function build(
  events: readonly MouseEventRecord[],
  settings: Partial<CursorSettings> = {},
  sampleRateHz?: number,
): CursorTrack {
  const durationMs = (events.at(-1)?.t ?? 0) + 1000
  return buildCursorTrack({
    events,
    settings: { ...DEFAULT_CURSOR, ...settings },
    durationMs,
    ...(sampleRateHz ? { sampleRateHz } : {}),
  })
}

/** Raw pointer at `t`: last inside event at or before it. */
function rawAt(events: readonly MouseEventRecord[], t: number) {
  let last = events[0]
  for (const event of events) {
    if (event.t > t) break
    if (event.type === 'move' && event.outside) continue
    last = event
  }
  return last ?? { x: 0, y: 0 }
}

/** Raw pointer between samples, interpolated: only to measure distances, never drawn. */
function rawPathAt(events: readonly MouseEventRecord[], t: number) {
  const next = events.find((e) => e.t > t)
  const prev = rawAt(events, t)
  // Never across a stretch on another display.
  if (!next || (next.type === 'move' && next.outside) || !('t' in prev) || next.t <= prev.t)
    return prev
  const p = (t - prev.t) / (next.t - prev.t)
  return { x: prev.x + (next.x - prev.x) * p, y: prev.y + (next.y - prev.y) * p }
}

function frames(fromMs: number, toMs: number, fps: number): number[] {
  const out: number[] = []
  for (let i = Math.ceil((fromMs * fps) / 1000); (i * 1000) / fps <= toMs; i++) {
    out.push((i * 1000) / fps)
  }
  return out
}

function squaredAcceleration(points: { x: number; y: number }[]): number {
  let sum = 0
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!
    const b = points[i - 1]!
    const c = points[i]!
    sum += (c.x - 2 * b.x + a.x) ** 2 + (c.y - 2 * b.y + a.y) ** 2
  }
  return sum
}

describe('cursor track', () => {
  it.each(FIXTURE_NAMES)('lands exactly on every click (%s)', (name) => {
    const events = fixture(name)
    for (const smooth of [true, false]) {
      const track = build(events, { smooth })
      for (const event of events.filter((e) => e.type === 'down')) {
        const frame = cursorAt(track, event.t)
        expect(Math.abs(frame.x - event.x)).toBeLessThan(1e-6)
        expect(Math.abs(frame.y - event.y)).toBeLessThan(1e-6)
      }
    }
  })

  it('stays continuous around a click (no jump on the click frame)', () => {
    const events = fixture('spaced-clicks')
    const track = build(events)
    for (const click of events.filter((e) => e.type === 'down')) {
      const before = cursorAt(track, click.t - 0.01)
      const after = cursorAt(track, click.t + 0.01)
      expect(Math.hypot(before.x - click.x, before.y - click.y)).toBeLessThan(0.05)
      expect(Math.hypot(after.x - click.x, after.y - click.y)).toBeLessThan(0.05)
    }
  })

  it('is smoother than the raw path', () => {
    const events = fixture('spaced-clicks')
    const track = build(events)
    const times = frames(0, events.at(-1)!.t, 60)
    const smooth = squaredAcceleration(times.map((t) => cursorAt(track, t)))
    const raw = squaredAcceleration(times.map((t) => rawAt(events, t)))
    expect(smooth).toBeLessThan(raw * 0.25)
  })

  it.each(FIXTURE_NAMES)('does not lag behind the real pointer (%s)', (name) => {
    const events = fixture(name)
    const track = build(events)
    // Within a few pixels of where the real pointer was at some point in the last or next
    // 150ms: a glide, not a trail.
    for (const t of frames(events[0]!.t, events.at(-1)!.t, 60)) {
      const frame = cursorAt(track, t)
      if (!frame.visible) continue
      let best = Infinity
      for (let tau = t - 150; tau <= t + 150; tau += 2) {
        const raw = rawPathAt(events, tau)
        best = Math.min(best, Math.hypot(frame.x - raw.x, frame.y - raw.y))
      }
      expect(best, `t=${t}`).toBeLessThan(6)
    }
  })

  it('shows a ripple for 400ms on each click, at the click point', () => {
    const events = fixture('spaced-clicks')
    const track = build(events)
    const clicks = events.filter((e) => e.type === 'down')
    for (const click of clicks) {
      expect(cursorAt(track, click.t - 1).ripple).toBeNull()
      expect(cursorAt(track, click.t).ripple).toEqual({
        x: click.x,
        y: click.y,
        progress: 0,
        button: click.type === 'down' ? click.button : 'left',
      })
      expect(cursorAt(track, click.t + CLICK_RIPPLE_MS / 2).ripple?.progress).toBeCloseTo(0.5, 9)
      expect(cursorAt(track, click.t + CLICK_RIPPLE_MS).ripple).toBeNull()
    }
    expect(clicks.some((c) => c.type === 'down' && c.button === 'right')).toBe(true)
  })

  it('has no ripple when it is turned off', () => {
    const events = fixture('click-burst')
    const track = build(events, { clickRipple: false })
    for (const t of frames(0, events.at(-1)!.t, 60)) expect(cursorAt(track, t).ripple).toBeNull()
  })

  it('fades out after 3s still and comes back when the pointer moves', () => {
    const events: MouseEventRecord[] = [
      { t: 0, type: 'move', x: 100, y: 100 },
      { t: 500, type: 'move', x: 200, y: 150 },
      { t: 6000, type: 'move', x: 210, y: 160 },
      { t: 6016, type: 'move', x: 220, y: 170 },
    ]
    const track = build(events)
    expect(cursorAt(track, 500 + CURSOR_IDLE_MS - 1).opacity).toBe(1)
    const fading = cursorAt(track, 500 + CURSOR_IDLE_MS + 150)
    expect(fading.opacity).toBeGreaterThan(0)
    expect(fading.opacity).toBeLessThan(1)
    const gone = cursorAt(track, 5500)
    expect(gone.visible).toBe(false)
    expect(gone.opacity).toBe(0)
    // Back on the first move after the pause, then fully visible.
    expect(cursorAt(track, 6000 + 100).visible).toBe(true)
    expect(cursorAt(track, 6000 + 800).opacity).toBeGreaterThan(0.99)
    // Opacity never jumps: consecutive 60fps frames differ by a fraction.
    let previous = cursorAt(track, 0).opacity
    for (const t of frames(0, 7000, 60)) {
      const { opacity } = cursorAt(track, t)
      expect(Math.abs(opacity - previous)).toBeLessThan(0.2)
      previous = opacity
    }
  })

  it('stays visible while still when auto-hide is off', () => {
    const events: MouseEventRecord[] = [
      { t: 0, type: 'move', x: 100, y: 100 },
      { t: 10_000, type: 'move', x: 110, y: 100 },
    ]
    const track = build(events, { autoHide: false })
    for (const t of frames(0, 10_000, 30)) expect(cursorAt(track, t).opacity).toBe(1)
  })

  it('never shows the cursor when hidden', () => {
    for (const name of FIXTURE_NAMES) {
      const events = fixture(name)
      const track = build(events, { hidden: true })
      for (const t of frames(0, events.at(-1)!.t + 500, 30)) {
        const frame = cursorAt(track, t)
        expect(frame.visible).toBe(false)
        expect(frame.opacity).toBe(0)
        expect(frame.ripple).toBeNull()
      }
    }
  })

  it('is invisible before the first event', () => {
    const events: MouseEventRecord[] = [{ t: 1000, type: 'move', x: 50, y: 60 }]
    const track = build(events)
    expect(cursorAt(track, 0)).toMatchObject({ visible: false, opacity: 0, ripple: null })
    expect(cursorAt(track, 999.9).visible).toBe(false)
    expect(cursorAt(track, 1000)).toMatchObject({ x: 50, y: 60, visible: true, opacity: 1 })
  })

  it('handles no events at all', () => {
    const track = build([])
    expect(cursorAt(track, 500)).toEqual({ x: 0, y: 0, visible: false, opacity: 0, ripple: null })
  })

  it('hides while the pointer is on another display and reappears at the re-entry point', () => {
    const events = fixture('outside-display')
    const track = build(events)
    const leave = events.find((e) => e.type === 'move' && e.outside)!
    const back = events.find((e) => e.t > leave.t && !(e.type === 'move' && e.outside))!
    const lastInside = [...events].reverse().find((e) => e.t < leave.t)!

    // Fades out where it left, without following the pointer on the other display.
    const leaving = cursorAt(track, leave.t + 100)
    expect(leaving.opacity).toBeLessThan(1)
    expect(Math.hypot(leaving.x - lastInside.x, leaving.y - lastInside.y)).toBeLessThan(15)
    for (const t of frames(leave.t + 700, back.t - 1, 60)) {
      expect(cursorAt(track, t).visible).toBe(false)
    }
    // Comes back exactly at the re-entry point, no glide across the screen.
    const reentry = cursorAt(track, back.t)
    expect(reentry.x).toBe(back.x)
    expect(reentry.y).toBe(back.y)
    const soon = cursorAt(track, back.t + 50)
    expect(soon.visible).toBe(true)
    expect(Math.hypot(soon.x - back.x, soon.y - back.y)).toBeLessThan(40)
  })

  it('follows the raw path when smoothing is off', () => {
    const events = fixture('drag')
    const track = build(events, { smooth: false })
    for (const t of frames(events[0]!.t, events.at(-1)!.t, 60)) {
      const frame = cursorAt(track, t)
      const raw = rawAt(events, t)
      expect([frame.x, frame.y]).toEqual([raw.x, raw.y])
    }
  })

  it('reads the same values at any frame rate and in any order', () => {
    const events = fixture('spaced-clicks')
    const track = build(events)
    const end = events.at(-1)!.t
    const at30 = new Map(frames(0, end, 30).map((t) => [t, cursorAt(track, t)]))
    for (const t of frames(0, end, 60)) {
      const expected = at30.get(t)
      if (expected) expect(cursorAt(track, t)).toEqual(expected)
    }
    const shuffled = [...at30.keys()].reverse()
    for (const t of shuffled) expect(cursorAt(track, t)).toEqual(at30.get(t))
    // Same input, same track.
    expect(build(events)).toEqual(track)
  })

  it.each(FIXTURE_NAMES)('does not depend on the internal sample rate (%s)', (name) => {
    const events = fixture(name)
    const a = build(events, {}, 60)
    const b = build(events, {}, 240)
    for (const t of frames(0, events.at(-1)!.t + 500, 30)) {
      const fa = cursorAt(a, t)
      const fb = cursorAt(b, t)
      expect(Math.hypot(fa.x - fb.x, fa.y - fb.y)).toBeLessThan(1e-6)
      expect(Math.abs(fa.opacity - fb.opacity)).toBeLessThan(1e-9)
    }
  })

  it('handles sparse events and long gaps', () => {
    const events: MouseEventRecord[] = [
      { t: 0, type: 'move', x: 0, y: 0 },
      { t: 400, type: 'move', x: 800, y: 400 },
      { t: 1500, type: 'down', button: 'left', x: 820, y: 410 },
      { t: 1580, type: 'up', button: 'left', x: 820, y: 410 },
      { t: 60_000, type: 'down', button: 'left', x: 100, y: 900 },
    ]
    const track = build(events)
    for (const t of frames(0, 61_000, 30)) {
      const { x, y } = cursorAt(track, t)
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
    expect(cursorAt(track, 1500)).toMatchObject({ x: 820, y: 410 })
    expect(cursorAt(track, 60_000)).toMatchObject({ x: 100, y: 900 })
    // A click after an idle stretch brings the cursor back.
    expect(cursorAt(track, 59_000).visible).toBe(false)
    expect(cursorAt(track, 60_300).visible).toBe(true)
  })

  it('builds 10 minutes of 60Hz moves quickly', () => {
    const events: MouseEventRecord[] = []
    let x = 960
    let y = 540
    for (let i = 0; i < 36_000; i++) {
      const t = (i * 1000) / 60
      x = Math.min(1919, Math.max(0, x + Math.sin(i / 40) * 6))
      y = Math.min(1079, Math.max(0, y + Math.cos(i / 55) * 4))
      events.push({ t, type: 'move', x, y })
      if (i % 300 === 0) events.push({ t: t + 1, type: 'down', button: 'left', x, y })
    }
    events.sort((a, b) => a.t - b.t)
    let best = Infinity
    let track = build(events)
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      track = build(events)
      best = Math.min(best, performance.now() - start)
    }
    expect(best).toBeLessThan(300)

    const start = performance.now()
    for (const t of frames(0, 600_000, 60)) cursorAt(track, t)
    expect(performance.now() - start).toBeLessThan(300)
    for (const click of events.filter((e) => e.type === 'down')) {
      expect(cursorAt(track, click.t)).toMatchObject({ x: click.x, y: click.y })
    }
  })

  it('exports the arrow as a vector polygon with the hotspot at the origin', () => {
    expect(CURSOR_ARROW[0]).toEqual([0, 0])
    for (const [px, py] of CURSOR_ARROW) {
      expect(px).toBeGreaterThanOrEqual(0)
      expect(py).toBeGreaterThanOrEqual(0)
    }
  })
})
