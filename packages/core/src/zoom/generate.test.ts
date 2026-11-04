import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURES, FIXTURE_VIDEO } from '../../fixtures/generate.ts'
import { parseEvents, type MouseButton, type MouseEventRecord } from '../events/events.ts'
import { createProject } from '../project/project.ts'
import { DEFAULT_LEAD_MS, DEFAULT_ZOOM_SCALE, Project, type Zoom } from '../project/schema.ts'
import { clampTarget, generateZooms, visibleZooms, type ZoomGenerationInput } from './index.ts'

const video = { width: FIXTURE_VIDEO.width, height: FIXTURE_VIDEO.height }

function fixture(name: string): ZoomGenerationInput {
  const text = readFileSync(new URL(`../../fixtures/${name}.jsonl`, import.meta.url), 'utf8')
  const build = FIXTURES[name]
  if (!build) throw new Error(`unknown fixture ${name}`)
  return { events: parseEvents(text).events, video, durationMs: Math.ceil(build().t) }
}

/** Builds a project with these zooms and runs it through the schema invariants. */
function assertValidProject(zooms: Zoom[], durationMs: number): void {
  const project = createProject({
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    name: 'Zooms',
    source: { kind: 'display', ...video, scaleFactor: 1, fps: 30 },
    durationMs,
    createdAt: new Date('2026-11-04T00:00:00Z'),
  })
  expect(() => Project.parse({ ...project, zooms })).not.toThrow()
}

function click(t: number, x: number, y: number, button: MouseButton = 'left'): MouseEventRecord[] {
  return [
    { t, type: 'down', button, x, y },
    { t: t + 80, type: 'up', button, x, y },
  ]
}

function manual(id: string, startMs: number, endMs: number): Zoom {
  return {
    id,
    startMs,
    endMs,
    scale: 3,
    target: { x: 100, y: 100 },
    follow: false,
    origin: 'manual',
    leadMs: 0,
  }
}

describe('generateZooms on the fixtures', () => {
  for (const name of Object.keys(FIXTURES)) {
    it(`${name}: matches the snapshot and the project invariants`, () => {
      const input = fixture(name)
      const result = generateZooms(input)
      expect(result).toMatchSnapshot()
      assertValidProject(result.zooms, input.durationMs)
    })
  }

  it('no-clicks: no zoom and the notice flag', () => {
    expect(generateZooms(fixture('no-clicks'))).toEqual({ zooms: [], noClicks: true })
  })

  it('spaced-clicks: one zoom per left click, the right click is ignored', () => {
    const { zooms, noClicks } = generateZooms(fixture('spaced-clicks'))
    expect(noClicks).toBe(false)
    expect(zooms).toHaveLength(3)
  })

  it('click-burst: four quick close clicks are one shot, the far click another', () => {
    const { zooms } = generateZooms(fixture('click-burst'))
    expect(zooms).toHaveLength(2)
  })

  it('edge-clicks: every viewport stays inside the video', () => {
    const { zooms } = generateZooms(fixture('edge-clicks'))
    expect(zooms).toHaveLength(3)
    for (const zoom of zooms) {
      const halfW = video.width / zoom.scale / 2
      const halfH = video.height / zoom.scale / 2
      expect(zoom.target.x - halfW).toBeGreaterThanOrEqual(0)
      expect(zoom.target.y - halfH).toBeGreaterThanOrEqual(0)
      expect(zoom.target.x + halfW).toBeLessThanOrEqual(video.width)
      expect(zoom.target.y + halfH).toBeLessThanOrEqual(video.height)
    }
  })

  it('drag: one zoom that lasts until 1s after the release', () => {
    const input = fixture('drag')
    const up = input.events.find((e) => e.type === 'up')!
    const { zooms } = generateZooms(input)
    expect(zooms).toHaveLength(1)
    expect(zooms[0]!.endMs).toBe(Math.round(up.t + 1000))
  })

  it('outside-display: the click after coming back zooms once', () => {
    expect(generateZooms(fixture('outside-display')).zooms).toHaveLength(1)
  })
})

describe('generateZooms rules', () => {
  const durationMs = 20_000

  it('each left click is a zoom with the defaults (scale, follow, auto, leadMs)', () => {
    const { zooms } = generateZooms({ events: click(5000, 960, 540), video, durationMs })
    expect(zooms).toEqual([
      {
        id: 'auto-4700',
        startMs: 5000 - DEFAULT_LEAD_MS,
        endMs: 5080 + 1000,
        scale: DEFAULT_ZOOM_SCALE,
        target: { x: 960, y: 540 },
        follow: true,
        origin: 'auto',
        leadMs: DEFAULT_LEAD_MS,
      },
    ])
  })

  it('right and middle clicks never zoom', () => {
    const events = [...click(1000, 500, 500, 'right'), ...click(4000, 500, 500, 'middle')]
    expect(generateZooms({ events, video, durationMs })).toEqual({ zooms: [], noClicks: true })
  })

  it('ignores clicks outside the video', () => {
    const events = [...click(1000, -10, 500), ...click(4000, 2500, 500), ...click(7000, 50, 1200)]
    expect(generateZooms({ events, video, durationMs })).toEqual({ zooms: [], noClicks: true })
  })

  it('groups clicks < 1.5s apart and close together into one shot centered on them', () => {
    const events = [...click(1000, 900, 500), ...click(2000, 1000, 600)]
    const { zooms } = generateZooms({ events, video, durationMs })
    expect(zooms).toHaveLength(1)
    expect(zooms[0]).toMatchObject({ startMs: 700, endMs: 3080, target: { x: 950, y: 550 } })
  })

  it('does not group clicks 1.5s or more apart', () => {
    const events = [...click(1000, 900, 500), ...click(4000, 900, 500)]
    expect(generateZooms({ events, video, durationMs }).zooms).toHaveLength(2)
  })

  it('does not group clicks farther than 25% of the diagonal (≈551px at 1080p)', () => {
    // Close in time, the two shots of a non-grouped pair collide and merge, so the target
    // tells them apart: grouped → centroid; not grouped → the first (larger on a tie) shot's.
    const near = generateZooms({
      events: [...click(1000, 600, 540), ...click(1500, 1140, 540)],
      video,
      durationMs,
    }).zooms
    expect(near).toHaveLength(1)
    expect(near[0]!.target).toEqual({ x: 870, y: 540 })

    const far = generateZooms({
      events: [...click(1000, 600, 540), ...click(1500, 1200, 540)],
      video,
      durationMs,
    }).zooms
    expect(far).toHaveLength(1)
    expect(far[0]!.target).toEqual({ x: 600, y: 540 })
  })

  it('distance is measured from the first click, so a chain cannot walk across the screen', () => {
    const events = [0, 1, 2, 3, 4, 5].flatMap((i) => click(1000 + i * 600, 100 + i * 300, 540))
    const { zooms } = generateZooms({ events, video, durationMs })
    // groups [100,400] [700,1000] [1300,1600]; they collide and merge into one zoom that
    // keeps the first group's target (a walking chain would center at 850)
    expect(zooms).toHaveLength(1)
    expect(zooms[0]).toMatchObject({
      startMs: 700,
      endMs: 1000 + 5 * 600 + 80 + 1000,
      target: clampTarget({ x: 250, y: 540 }, video, 2),
    })
  })

  it('merging: the larger shot absorbs the smaller and keeps its target', () => {
    // a drag (long shot) then, 1.2s later, a far click (short shot) that overlaps it
    const events: MouseEventRecord[] = [
      { t: 1000, type: 'down', button: 'left', x: 400, y: 400 },
      { t: 3000, type: 'up', button: 'left', x: 600, y: 450 },
      ...click(3500, 1600, 900),
    ]
    const { zooms } = generateZooms({ events, video, durationMs })
    expect(zooms).toHaveLength(1)
    expect(zooms[0]).toMatchObject({
      startMs: 700,
      endMs: 4580,
      target: clampTarget({ x: 400, y: 400 }, video, 2),
    })
  })

  it('clamps to the video and keeps 600ms minimum near the start and the end', () => {
    const atStart = generateZooms({ events: click(0, 960, 540), video, durationMs }).zooms
    expect(atStart[0]).toMatchObject({ startMs: 0, endMs: 1080 })

    const short = 5000
    const atEnd = generateZooms({
      events: [{ t: 4900, type: 'down', button: 'left', x: 960, y: 540 }],
      video,
      durationMs: short,
    }).zooms
    expect(atEnd[0]).toMatchObject({ startMs: 4400, endMs: short })
    expect(atEnd[0]!.endMs - atEnd[0]!.startMs).toBeGreaterThanOrEqual(600)
  })

  it('extends a short shot symmetrically when the options make it shorter than 600ms', () => {
    const { zooms } = generateZooms({
      events: click(5000, 960, 540),
      video,
      durationMs,
      options: { leadMs: 100, tailMs: 100 },
    })
    // 4900..5180 = 280ms → grows 160ms each side
    expect(zooms[0]).toMatchObject({ startMs: 4740, endMs: 5340, leadMs: 100 })
  })

  it('a video shorter than 600ms gets no zoom but still has clicks', () => {
    const result = generateZooms({ events: click(100, 960, 540), video, durationMs: 500 })
    expect(result).toEqual({ zooms: [], noClicks: false })
  })

  it('shifts edge targets so the viewport stays inside the video', () => {
    const events = [...click(1000, 3, 2), ...click(6000, 1919, 1079), ...click(11000, 1919, 540)]
    const targets = generateZooms({ events, video, durationMs }).zooms.map((z) => z.target)
    expect(targets).toEqual([
      { x: 480, y: 270 },
      { x: 1440, y: 810 },
      { x: 1440, y: 540 },
    ])
  })

  it('a click at the right edge with a higher scale shifts less', () => {
    const { zooms } = generateZooms({
      events: click(1000, 1919, 540),
      video,
      durationMs,
      options: { scale: 4 },
    })
    expect(zooms[0]!.target).toEqual({ x: 1920 - 240, y: 540 })
  })

  it('accepts unsorted events', () => {
    const events = [...click(6000, 300, 300), ...click(1000, 1500, 800)]
    const sorted = [...events].sort((a, b) => a.t - b.t)
    expect(generateZooms({ events, video, durationMs })).toEqual(
      generateZooms({ events: sorted, video, durationMs }),
    )
  })

  it('is deterministic with unique ids', () => {
    const events = [1000, 5000, 9000, 13_000].flatMap((t) => click(t, 960, 540))
    const a = generateZooms({ events, video, durationMs })
    const b = generateZooms({ events, video, durationMs })
    expect(a).toEqual(b)
    expect(new Set(a.zooms.map((z) => z.id)).size).toBe(4)
  })
})

describe('regeneration keeps manual zooms (rule 9)', () => {
  const durationMs = 20_000
  const events = [...click(2000, 960, 540), ...click(8000, 400, 400), ...click(14_000, 1500, 800)]

  it('replaces auto zooms and keeps manual ones untouched', () => {
    const staleAuto: Zoom = { ...manual('auto-1', 500, 1500), origin: 'auto' }
    const kept = manual('m1', 17_000, 19_000)
    const { zooms } = generateZooms({ events, video, durationMs, existing: [staleAuto, kept] })
    expect(zooms.find((z) => z.id === 'auto-1')).toBeUndefined()
    expect(zooms.filter((z) => z.origin === 'auto')).toHaveLength(3)
    expect(zooms.find((z) => z.id === 'm1')).toBe(kept)
    assertValidProject(zooms, durationMs)
  })

  it('trims auto zooms around a manual one', () => {
    // auto shot for the click at 8000 is 7700..9080; the manual covers 8500..10000
    const m = manual('m1', 8500, 10_000)
    const { zooms } = generateZooms({ events, video, durationMs, existing: [m] })
    expect(zooms.map((z) => [z.id, z.startMs, z.endMs])).toEqual([
      ['auto-1700', 1700, 3080],
      ['auto-7700', 7700, 8500],
      ['m1', 8500, 10_000],
      ['auto-13700', 13_700, 15_080],
    ])
    assertValidProject(zooms, durationMs)
  })

  it('splits an auto zoom around a manual one in the middle when both sides are long enough', () => {
    const { zooms } = generateZooms({
      events: [
        { t: 1000, type: 'down', button: 'left', x: 500, y: 500 },
        { t: 6000, type: 'up', button: 'left', x: 600, y: 500 },
      ],
      video,
      durationMs,
      existing: [manual('m1', 3000, 4000)],
    })
    expect(zooms.map((z) => [z.id, z.startMs, z.endMs])).toEqual([
      ['auto-700', 700, 3000],
      ['m1', 3000, 4000],
      ['auto-4000', 4000, 7000],
    ])
    assertValidProject(zooms, durationMs)
  })

  it('drops auto zooms that become shorter than 600ms', () => {
    // auto shot 7700..9080; manual 7900..9000 leaves 200ms and 80ms
    const { zooms } = generateZooms({
      events,
      video,
      durationMs,
      existing: [manual('m1', 7900, 9000)],
    })
    expect(zooms.map((z) => z.id)).toEqual(['auto-1700', 'm1', 'auto-13700'])
    assertValidProject(zooms, durationMs)
  })

  it('never reuses a manual id', () => {
    const m = manual('auto-1700', 18_000, 19_000)
    const { zooms } = generateZooms({ events, video, durationMs, existing: [m] })
    expect(new Set(zooms.map((z) => z.id)).size).toBe(zooms.length)
    expect(zooms[0]!.id).toBe('auto-1700-2')
  })

  it('keeps manual zooms even when there are no clicks', () => {
    const m = manual('m1', 1000, 3000)
    expect(generateZooms({ events: [], video, durationMs, existing: [m] })).toEqual({
      zooms: [m],
      noClicks: true,
    })
  })
})

describe('visibleZooms', () => {
  const zooms = generateZooms({
    events: [...click(1000, 960, 540), ...click(8000, 400, 400)],
    video,
    durationMs: 20_000,
    existing: [manual('m1', 4000, 5000)],
  }).zooms

  it('shows everything with auto-zoom on', () => {
    expect(visibleZooms(zooms, { autoZoom: true })).toEqual(zooms)
  })

  it('hides auto zooms without deleting them when auto-zoom is off', () => {
    expect(visibleZooms(zooms, { autoZoom: false }).map((z) => z.id)).toEqual(['m1'])
    expect(zooms).toHaveLength(3)
  })
})

describe('performance', () => {
  it('generates the zooms of a 10-minute recording in under 1s', () => {
    const durationMs = 10 * 60_000
    const events: MouseEventRecord[] = []
    let seed = 42
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    for (let t = 0; t < durationMs; t += 1000 / 60) {
      events.push({ t, type: 'move', x: random() * 1920, y: random() * 1080 })
    }
    for (let i = 0; i < 400; i++) {
      const t = i * 1490 + random() * 50
      events.push(...click(t, random() * 1920, random() * 1080))
    }
    events.sort((a, b) => a.t - b.t)
    expect(events.length).toBeGreaterThan(36_000)

    const started = performance.now()
    const { zooms } = generateZooms({
      events,
      video,
      durationMs,
      existing: [manual('m1', 60_000, 70_000)],
    })
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(1000)
    expect(zooms.length).toBeGreaterThan(1)
    assertValidProject(zooms, durationMs)
  })
})
