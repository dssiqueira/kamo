import { describe, expect, it } from 'vitest'
import type { MouseEventRecord } from '../events/events.ts'
import { createProject } from '../project/project.ts'
import { Project, type Zoom } from '../project/schema.ts'
import { createHistory } from './history.ts'
import { endTrimSuggestionFor, setTrim, suggestEndTrim, zoomsInTrim } from './trim.ts'
import {
  createZoomAt,
  deleteZoom,
  moveZoom,
  newZoomId,
  resizeZoom,
  setZoomScale,
  snapZoomScale,
  zoomGapAt,
} from './zooms.ts'

const SOURCE = {
  kind: 'display',
  width: 1920,
  height: 1080,
  scaleFactor: 1,
  fps: 30,
} as const

function zoom(id: string, startMs: number, endMs: number, extra: Partial<Zoom> = {}): Zoom {
  return {
    id,
    startMs,
    endMs,
    scale: 2,
    target: { x: 960, y: 540 },
    follow: true,
    origin: 'auto',
    leadMs: 300,
    ...extra,
  }
}

function project(zooms: Zoom[] = [], durationMs = 20_000, trim?: [number, number]): Project {
  const base = createProject({
    name: 'Test',
    source: SOURCE,
    durationMs,
    id: '00000000-0000-4000-8000-000000000000',
    createdAt: new Date('2026-11-04T00:00:00Z'),
  })
  return Project.parse({
    ...base,
    zooms,
    trim: trim ? { startMs: trim[0], endMs: trim[1] } : base.trim,
  })
}

function valid(p: Project): boolean {
  return Project.safeParse(p).success
}

describe('moveZoom', () => {
  const p = project([zoom('a', 1000, 3000), zoom('b', 5000, 6000), zoom('c', 8000, 9000)])

  it('moves keeping the length and marks the block manual', () => {
    const next = moveZoom(p, 'b', 500)
    expect(next.zooms[1]).toMatchObject({ startMs: 5500, endMs: 6500, origin: 'manual' })
    expect(next.zooms[0]).toBe(p.zooms[0])
    expect(p.zooms[1]?.startMs).toBe(5000)
  })

  it('stops against the neighbors', () => {
    expect(moveZoom(p, 'b', -10_000).zooms[1]).toMatchObject({ startMs: 3000, endMs: 4000 })
    expect(moveZoom(p, 'b', 10_000).zooms[1]).toMatchObject({ startMs: 7000, endMs: 8000 })
  })

  it('stops at the start and the end of the video', () => {
    expect(moveZoom(p, 'a', -5000).zooms[0]).toMatchObject({ startMs: 0, endMs: 2000 })
    expect(moveZoom(p, 'c', 50_000).zooms[2]).toMatchObject({ startMs: 19_000, endMs: 20_000 })
  })

  it('stays inside the trim', () => {
    const trimmed = project([zoom('a', 3000, 4000)], 20_000, [2000, 15_000])
    expect(moveZoom(trimmed, 'a', -5000).zooms[0]).toMatchObject({ startMs: 2000 })
    expect(moveZoom(trimmed, 'a', 50_000).zooms[0]).toMatchObject({ endMs: 15_000 })
  })

  it('does not jump a block that already straddles the trim', () => {
    const trimmed = project([zoom('a', 1000, 3000)], 20_000, [2000, 15_000])
    expect(moveZoom(trimmed, 'a', -500)).toBe(trimmed)
    expect(moveZoom(trimmed, 'a', 500).zooms[0]).toMatchObject({ startMs: 1500, endMs: 3500 })
  })

  it('returns the same project for no-ops', () => {
    expect(moveZoom(p, 'missing', 100)).toBe(p)
    expect(moveZoom(p, 'b', 0)).toBe(p)
    expect(moveZoom(p, 'a', -5000).zooms[0]?.startMs).toBe(0)
    const atStart = moveZoom(p, 'a', -5000)
    expect(moveZoom(atStart, 'a', -1)).toBe(atStart)
    expect(moveZoom(p, 'b', Number.NaN)).toBe(p)
  })

  it('never touches a fractional neighbor from the wrong side', () => {
    const q = project([zoom('a', 1000.4, 2000.6), zoom('b', 4000.2, 5000.7)])
    const next = moveZoom(q, 'b', -5000)
    expect(next.zooms[1]?.startMs).toBe(2001)
    expect(valid(next)).toBe(true)
  })
})

describe('resizeZoom', () => {
  const p = project([zoom('a', 1000, 3000), zoom('b', 5000, 6000)])

  it('pulls either edge and marks the block manual', () => {
    expect(resizeZoom(p, 'a', 'start', -500).zooms[0]).toMatchObject({
      startMs: 500,
      endMs: 3000,
      origin: 'manual',
    })
    expect(resizeZoom(p, 'a', 'end', 1000).zooms[0]).toMatchObject({ startMs: 1000, endMs: 4000 })
  })

  it('keeps at least 600ms', () => {
    expect(resizeZoom(p, 'a', 'start', 5000).zooms[0]).toMatchObject({ startMs: 2400 })
    expect(resizeZoom(p, 'a', 'end', -5000).zooms[0]).toMatchObject({ endMs: 1600 })
  })

  it('stops at the neighbors and the ends of the video', () => {
    expect(resizeZoom(p, 'a', 'end', 9000).zooms[0]?.endMs).toBe(5000)
    expect(resizeZoom(p, 'b', 'start', -9000).zooms[1]?.startMs).toBe(3000)
    expect(resizeZoom(p, 'a', 'start', -9000).zooms[0]?.startMs).toBe(0)
    expect(resizeZoom(p, 'b', 'end', 99_000).zooms[1]?.endMs).toBe(20_000)
  })

  it('returns the same project for no-ops', () => {
    expect(resizeZoom(p, 'missing', 'end', 10)).toBe(p)
    expect(resizeZoom(p, 'a', 'end', 0)).toBe(p)
  })
})

describe('setZoomScale', () => {
  const p = project([zoom('a', 1000, 3000)])

  it('snaps to 0.25 inside 1.0–4.0', () => {
    expect(setZoomScale(p, 'a', 2.6).zooms[0]?.scale).toBe(2.5)
    expect(setZoomScale(p, 'a', 2.13).zooms[0]?.scale).toBe(2.25)
    expect(setZoomScale(p, 'a', 9).zooms[0]?.scale).toBe(4)
    expect(setZoomScale(p, 'a', 0).zooms[0]?.scale).toBe(1)
    expect(snapZoomScale(Number.NaN)).toBe(2)
  })

  it('marks the block manual, and 1.0 keeps the block', () => {
    const next = setZoomScale(p, 'a', 1)
    expect(next.zooms[0]).toMatchObject({ scale: 1, origin: 'manual' })
  })

  it('returns the same project when nothing changes', () => {
    expect(setZoomScale(p, 'a', 2.05)).toBe(p)
    expect(setZoomScale(p, 'missing', 3)).toBe(p)
  })
})

describe('deleteZoom', () => {
  it('removes the block, and is a no-op for unknown ids', () => {
    const p = project([zoom('a', 1000, 3000), zoom('b', 5000, 6000)])
    expect(deleteZoom(p, 'a').zooms.map((z) => z.id)).toEqual(['b'])
    expect(deleteZoom(p, 'x')).toBe(p)
  })
})

describe('createZoomAt', () => {
  it('creates a 2s 2.0× manual block centered on the instant', () => {
    const next = createZoomAt(project(), 5000, { x: 100, y: 200 })
    expect(next.zooms).toEqual([
      {
        id: 'manual-4000',
        startMs: 4000,
        endMs: 6000,
        scale: 2,
        target: { x: 480, y: 270 },
        follow: true,
        origin: 'manual',
        leadMs: 300,
      },
    ])
  })

  it('keeps the target when the zoomed view fits inside the video', () => {
    const next = createZoomAt(project(), 5000, { x: 900, y: 500 })
    expect(next.zooms[0]?.target).toEqual({ x: 900, y: 500 })
  })

  it('shifts the block to fit next to the edges and the neighbors', () => {
    expect(createZoomAt(project(), 300, { x: 960, y: 540 }).zooms[0]).toMatchObject({
      startMs: 0,
      endMs: 2000,
    })
    const p = project([zoom('a', 1000, 3000), zoom('b', 6000, 7000)])
    expect(createZoomAt(p, 3200, { x: 960, y: 540 }).zooms[1]).toMatchObject({
      startMs: 3000,
      endMs: 5000,
    })
  })

  it('shrinks the block to fill a tight gap, keeping the list sorted', () => {
    const p = project([zoom('a', 1000, 3000), zoom('b', 4000, 5000)])
    const next = createZoomAt(p, 3500, { x: 960, y: 540 })
    expect(next.zooms.map((z) => [z.startMs, z.endMs])).toEqual([
      [1000, 3000],
      [3000, 4000],
      [4000, 5000],
    ])
    expect(valid(next)).toBe(true)
  })

  it('refuses with less than 600ms of room, on a block or outside the trim', () => {
    const p = project([zoom('a', 1000, 3000), zoom('b', 3500, 5000)], 20_000, [500, 15_000])
    expect(createZoomAt(p, 3200, { x: 0, y: 0 })).toBe(p)
    expect(createZoomAt(p, 2000, { x: 0, y: 0 })).toBe(p)
    expect(createZoomAt(p, 200, { x: 0, y: 0 })).toBe(p)
    expect(createZoomAt(p, 16_000, { x: 0, y: 0 })).toBe(p)
  })

  it('creates unique ids and honors an explicit id', () => {
    const p = project([zoom('manual-4000', 0, 1000)])
    expect(createZoomAt(p, 5000, { x: 0, y: 0 }).zooms[1]?.id).toBe('manual-4000-2')
    expect(createZoomAt(p, 5000, { x: 0, y: 0 }, { id: 'mine' }).zooms[1]?.id).toBe('mine')
    expect(createZoomAt(p, 5000, { x: 0, y: 0 }, { id: 'manual-4000' })).toBe(p)
    expect(newZoomId([], 12.6)).toBe('manual-13')
  })
})

describe('zoomGapAt', () => {
  const zooms = [zoom('a', 1000, 3000), zoom('b', 5000, 6000)]
  const trim = { startMs: 500, endMs: 9000 }

  it('finds the empty stretch around an instant', () => {
    expect(zoomGapAt(zooms, trim, 10_000, 4000)).toEqual({ startMs: 3000, endMs: 5000 })
    expect(zoomGapAt(zooms, trim, 10_000, 700)).toEqual({ startMs: 500, endMs: 1000 })
    expect(zoomGapAt(zooms, trim, 10_000, 7000)).toEqual({ startMs: 6000, endMs: 9000 })
  })

  it('is null on a block or outside the trim', () => {
    expect(zoomGapAt(zooms, trim, 10_000, 2000)).toBeNull()
    expect(zoomGapAt(zooms, trim, 10_000, 100)).toBeNull()
    expect(zoomGapAt(zooms, trim, 10_000, 9500)).toBeNull()
  })
})

describe('setTrim', () => {
  const p = project([], 20_000)

  it('sets and clamps the trim to the video', () => {
    expect(setTrim(p, 1500, 18_000).trim).toEqual({ startMs: 1500, endMs: 18_000 })
    expect(setTrim(p, -50, 99_000)).toBe(p)
    expect(setTrim(p, 1000.4, 20_000).trim).toEqual({ startMs: 1000, endMs: 20_000 })
  })

  it('keeps at least 1s, stopping the edge that moved', () => {
    const q = setTrim(p, 5000, 10_000)
    expect(setTrim(q, 9800, 10_000).trim).toEqual({ startMs: 9000, endMs: 10_000 })
    expect(setTrim(q, 5000, 5200).trim).toEqual({ startMs: 5000, endMs: 6000 })
    expect(setTrim(q, 9000, 9100)).toBe(q)
  })

  it('accepts only the whole video when it is shorter than 1s', () => {
    const short = project([], 800)
    expect(setTrim(short, 100, 800)).toBe(short)
    expect(valid(setTrim(short, 100, 800))).toBe(true)
  })

  it('does not delete zooms outside the trim', () => {
    const q = project([zoom('a', 500, 1500), zoom('b', 5000, 6000)])
    const trimmed = setTrim(q, 2000, 20_000)
    expect(trimmed.zooms).toHaveLength(2)
    expect(zoomsInTrim(trimmed.zooms, trimmed.trim).map((z) => z.id)).toEqual(['b'])
  })
})

describe('zoomsInTrim', () => {
  it('keeps the blocks that overlap the trim', () => {
    const zooms = [zoom('a', 0, 1000), zoom('b', 1500, 2500), zoom('c', 9000, 9800)]
    expect(zoomsInTrim(zooms, { startMs: 1000, endMs: 9000 }).map((z) => z.id)).toEqual(['b'])
    expect(zoomsInTrim(zooms, { startMs: 900, endMs: 9100 }).map((z) => z.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

describe('suggestEndTrim', () => {
  const move = (t: number): MouseEventRecord => ({ t, x: 0, y: 0, type: 'move' })
  const down = (t: number, button: 'left' | 'right' = 'left'): MouseEventRecord => ({
    t,
    x: 0,
    y: 0,
    type: 'down',
    button,
  })
  const up = (t: number): MouseEventRecord => ({ t, x: 0, y: 0, type: 'up', button: 'left' })

  it('suggests cutting the last 2s when the recording ends on a click', () => {
    expect(suggestEndTrim([move(100), down(500), up(600), move(9000), down(9500)], 10_000)).toBe(
      8000,
    )
    expect(suggestEndTrim([down(9500), up(9600), move(9700)], 10_000)).toBe(8000)
  })

  it('does not suggest otherwise', () => {
    expect(suggestEndTrim([], 10_000)).toBeNull()
    expect(suggestEndTrim([down(5000), move(9500)], 10_000)).toBeNull()
    expect(suggestEndTrim([down(9500, 'right')], 10_000)).toBeNull()
    expect(
      suggestEndTrim([down(9500), { t: 9600, x: 0, y: 0, type: 'scroll', dx: 0, dy: 1 }], 10_000),
    ).toBeNull()
    expect(suggestEndTrim([down(2500)], 2900)).toBeNull()
  })
})

describe('endTrimSuggestionFor', () => {
  const stop: MouseEventRecord[] = [{ t: 19_500, x: 0, y: 0, type: 'down', button: 'left' }]

  it('suggests the end trim until the user answers it', () => {
    expect(endTrimSuggestionFor(project(), stop)).toBe(18_000)
    expect(endTrimSuggestionFor({ ...project(), endTrimSuggestion: 'dismissed' }, stop)).toBeNull()
    expect(endTrimSuggestionFor({ ...project(), endTrimSuggestion: 'applied' }, stop)).toBeNull()
  })

  it('stays quiet when the trim already cuts there, or would leave too little', () => {
    expect(endTrimSuggestionFor(project([], 20_000, [0, 18_000]), stop)).toBeNull()
    expect(endTrimSuggestionFor(project([], 20_000, [0, 17_000]), stop)).toBeNull()
    expect(endTrimSuggestionFor(project([], 20_000, [17_500, 20_000]), stop)).toBeNull()
    expect(endTrimSuggestionFor(project([], 20_000, [1000, 19_000]), stop)).toBe(18_000)
    expect(endTrimSuggestionFor(project(), [])).toBeNull()
  })

  it('keeps the answer and the auto-zoom toggle valid in project.json', () => {
    expect(valid({ ...project(), endTrimSuggestion: 'applied', autoZoom: false })).toBe(true)
    expect(Project.safeParse({ ...project(), endTrimSuggestion: 'later' }).success).toBe(false)
  })
})

describe('createHistory', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    const h = createHistory(0)
    h.push(1)
    h.push(2)
    expect(h.canUndo()).toBe(true)
    expect(h.undo()).toBe(1)
    expect(h.canRedo()).toBe(true)
    expect(h.redo()).toBe(2)
    h.undo()
    h.push(5)
    expect(h.canRedo()).toBe(false)
    expect(h.undo()).toBe(1)
    expect(h.undo()).toBe(0)
    expect(h.undo()).toBe(0)
    expect(h.canUndo()).toBe(false)
  })

  it('ignores pushes of the same state', () => {
    const state = { n: 1 }
    const h = createHistory(state)
    h.push(state)
    expect(h.canUndo()).toBe(false)
  })

  it('keeps at least 50 steps and drops the oldest past the capacity', () => {
    const h = createHistory(0, { capacity: 10 })
    for (let i = 1; i <= 80; i++) h.push(i)
    let steps = 0
    while (h.canUndo()) {
      h.undo()
      steps++
    }
    expect(steps).toBe(50)
    expect(h.present).toBe(30)
  })

  it('coalesces a transaction into one step computed from its base', () => {
    const h = createHistory(10)
    h.push(11)
    h.begin()
    expect(h.base).toBe(11)
    for (const delta of [1, 5, 3]) h.push(h.base + delta)
    expect(h.present).toBe(14)
    expect(h.canRedo()).toBe(false)
    h.commit()
    expect(h.undo()).toBe(11)
    expect(h.undo()).toBe(10)
  })

  it('records nothing for an empty transaction and supports cancel', () => {
    const h = createHistory('a')
    h.begin()
    h.commit()
    expect(h.canUndo()).toBe(false)
    h.begin()
    h.push('b')
    expect(h.canUndo()).toBe(true)
    h.cancel()
    expect(h.present).toBe('a')
    expect(h.canUndo()).toBe(false)
  })

  it('commits an open transaction before undoing', () => {
    const h = createHistory(0)
    h.begin()
    h.push(1)
    h.push(2)
    expect(h.undo()).toBe(0)
    expect(h.inTransaction).toBe(false)
    expect(h.redo()).toBe(2)
  })

  it('notifies subscribers and resets', () => {
    const h = createHistory(0)
    let calls = 0
    const off = h.subscribe(() => calls++)
    h.push(1)
    h.undo()
    h.reset(7)
    off()
    h.push(8)
    expect(calls).toBe(3)
    expect(h.canUndo()).toBe(true)
  })
})

// Randomized sequences: whatever the user does, the project stays schema-valid.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('random edit sequences', () => {
  it('always yield schema-valid projects, and undo returns to the start', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const random = mulberry32(seed)
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)]
      const durationMs = Math.round(800 + random() * 60_000)
      let p = project([], durationMs)
      const history = createHistory(p)

      for (let step = 0; step < 80; step++) {
        const id = pick(p.zooms)?.id ?? 'none'
        const t = random() * durationMs * 1.2 - durationMs * 0.1
        const delta = (random() - 0.5) * durationMs
        const op = Math.floor(random() * 8)
        let next: Project
        if (op === 0 || op === 1)
          next = createZoomAt(p, t, { x: random() * 4000, y: random() * 2000 })
        else if (op === 2) next = moveZoom(p, id, delta)
        else if (op === 3) next = resizeZoom(p, id, random() < 0.5 ? 'start' : 'end', delta)
        else if (op === 4) next = setZoomScale(p, id, random() * 6 - 1)
        else if (op === 5) next = deleteZoom(p, id)
        else if (op === 6) next = setTrim(p, p.trim.startMs + delta * 0.3, p.trim.endMs)
        else next = setTrim(p, p.trim.startMs, p.trim.endMs + delta * 0.3)

        const result = Project.safeParse(next)
        if (!result.success) {
          throw new Error(`seed ${seed}, step ${step}, op ${op}: ${result.error.message}`)
        }
        for (const z of next.zooms) {
          if (!p.zooms.includes(z)) expect(z.origin).toBe('manual')
        }
        if (next !== p) {
          // Gestures go through a transaction, discrete edits straight in.
          if (op === 2 || op === 3) {
            history.begin()
            history.push(next)
            history.commit()
          } else history.push(next)
        }
        p = next
      }

      while (history.canUndo()) history.undo()
      expect(history.present.zooms).toEqual([])
      expect(history.present.trim).toEqual({ startMs: 0, endMs: durationMs })
    }
  })

  it('drag sequences from a fixed base never overlap, whatever the deltas', () => {
    const random = mulberry32(42)
    const base = project([zoom('a', 1000, 3000), zoom('b', 4000, 5000), zoom('c', 7000, 9000)])
    for (let i = 0; i < 500; i++) {
      const id = ['a', 'b', 'c'][i % 3] ?? 'a'
      const delta = (random() - 0.5) * 40_000
      expect(valid(moveZoom(base, id, delta))).toBe(true)
      expect(valid(resizeZoom(base, id, i % 2 ? 'start' : 'end', delta))).toBe(true)
    }
  })
})
