import { describe, expect, it } from 'vitest'
import { createProject } from '../project/project.ts'
import { DEFAULT_WEBCAM, Project } from '../project/schema.ts'
import {
  CREATED_WEBCAM_HIDDEN_MS,
  MIN_WEBCAM_HIDDEN_MS,
  addWebcamHidden,
  deleteWebcamHidden,
  moveWebcamHidden,
  resizeWebcamHidden,
  setWebcam,
  webcamGapAt,
} from './webcam.ts'

type Range = { startMs: number; endMs: number }

function project(hidden: Range[] = [], withWebcam = true, durationMs = 20_000): Project {
  const base = createProject({
    name: 'Test',
    source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
    durationMs,
    id: '00000000-0000-4000-8000-000000000000',
    createdAt: new Date('2026-11-04T00:00:00Z'),
  })
  return Project.parse({ ...base, webcam: withWebcam ? { ...DEFAULT_WEBCAM, hidden } : null })
}

const hiddenOf = (p: Project) => p.webcam?.hidden ?? []
const valid = (p: Project) => Project.safeParse(p).success

describe('setWebcam', () => {
  it('changes the bubble settings and keeps the hidden stretches', () => {
    const p = project([{ startMs: 1000, endMs: 2000 }])
    const next = setWebcam(p, { position: 'top-left', size: 'large', shrinkOnZoom: false })
    expect(next.webcam).toMatchObject({ position: 'top-left', size: 'large', shrinkOnZoom: false })
    expect(hiddenOf(next)).toEqual(hiddenOf(p))
    expect(valid(next)).toBe(true)
  })

  it('returns the same project when nothing changes or there is no webcam', () => {
    const p = project()
    expect(setWebcam(p, { position: p.webcam!.position })).toBe(p)
    const none = project([], false)
    expect(setWebcam(none, { visible: false })).toBe(none)
  })
})

describe('addWebcamHidden', () => {
  it('hides 2s centered on the playhead', () => {
    const next = addWebcamHidden(project(), 5000)
    expect(hiddenOf(next)).toEqual([{ startMs: 4000, endMs: 4000 + CREATED_WEBCAM_HIDDEN_MS }])
    expect(valid(next)).toBe(true)
  })

  it('fits in a tight gap and keeps the stretches sorted', () => {
    const p = project([
      { startMs: 1000, endMs: 4000 },
      { startMs: 5000, endMs: 8000 },
    ])
    const next = addWebcamHidden(p, 4500)
    expect(hiddenOf(next)).toEqual([
      { startMs: 1000, endMs: 4000 },
      { startMs: 4000, endMs: 5000 },
      { startMs: 5000, endMs: 8000 },
    ])
  })

  it('does nothing on a stretch, without room, outside the trim or without a webcam', () => {
    const p = project([
      { startMs: 1000, endMs: 4000 },
      { startMs: 4300, endMs: 8000 },
    ])
    expect(addWebcamHidden(p, 2000)).toBe(p)
    expect(addWebcamHidden(p, 4100)).toBe(p)
    expect(addWebcamHidden(p, 30_000)).toBe(p)
    const none = project([], false)
    expect(addWebcamHidden(none, 5000)).toBe(none)
  })
})

describe('moveWebcamHidden / resizeWebcamHidden', () => {
  const p = project([
    { startMs: 1000, endMs: 2000 },
    { startMs: 5000, endMs: 6000 },
  ])

  it('moves keeping the length and stops at the neighbor', () => {
    expect(hiddenOf(moveWebcamHidden(p, 0, 500))[0]).toEqual({ startMs: 1500, endMs: 2500 })
    expect(hiddenOf(moveWebcamHidden(p, 0, 10_000))[0]).toEqual({ startMs: 4000, endMs: 5000 })
    expect(hiddenOf(moveWebcamHidden(p, 0, -10_000))[0]).toEqual({ startMs: 0, endMs: 1000 })
    expect(hiddenOf(moveWebcamHidden(p, 1, 60_000))[1]).toEqual({ startMs: 19_000, endMs: 20_000 })
  })

  it('resizes an edge without going under the minimum or over a neighbor', () => {
    expect(hiddenOf(resizeWebcamHidden(p, 0, 'end', 10_000))[0]).toEqual({
      startMs: 1000,
      endMs: 5000,
    })
    expect(hiddenOf(resizeWebcamHidden(p, 1, 'start', 10_000))[1]).toEqual({
      startMs: 6000 - MIN_WEBCAM_HIDDEN_MS,
      endMs: 6000,
    })
    expect(hiddenOf(resizeWebcamHidden(p, 1, 'start', -10_000))[1]).toEqual({
      startMs: 2000,
      endMs: 6000,
    })
  })

  it('returns the same project for an unknown index or no change', () => {
    expect(moveWebcamHidden(p, 5, 100)).toBe(p)
    expect(moveWebcamHidden(p, 0, 0)).toBe(p)
    expect(resizeWebcamHidden(p, 0, 'start', 0)).toBe(p)
  })
})

describe('deleteWebcamHidden', () => {
  it('shows the bubble again in that stretch', () => {
    const p = project([
      { startMs: 1000, endMs: 2000 },
      { startMs: 5000, endMs: 6000 },
    ])
    expect(hiddenOf(deleteWebcamHidden(p, 0))).toEqual([{ startMs: 5000, endMs: 6000 }])
    expect(deleteWebcamHidden(p, 9)).toBe(p)
  })
})

describe('webcamGapAt', () => {
  it('is the free stretch around the instant, inside the trim', () => {
    const hidden = [{ startMs: 1000, endMs: 2000 }]
    const trim = { startMs: 0, endMs: 10_000 }
    expect(webcamGapAt(hidden, trim, 10_000, 5000)).toEqual({ startMs: 2000, endMs: 10_000 })
    expect(webcamGapAt(hidden, trim, 10_000, 1500)).toBeNull()
  })
})
