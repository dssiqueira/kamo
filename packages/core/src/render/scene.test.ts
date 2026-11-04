import { describe, expect, it } from 'vitest'
import type { MouseEventRecord } from '../events/events.ts'
import { createProject } from '../project/project.ts'
import { DEFAULT_WEBCAM, type Project, type WebcamSettings } from '../project/schema.ts'
import { outputSize, paddedArea } from './layout.ts'
import { buildScene, sceneFrame } from './scene.ts'
import { splitRegions } from './split.ts'

const OUT = outputSize('9:16', '1080p')
const SOURCE = {}
const CAMERA = { source: {}, size: { width: 1280, height: 720 } }

const events: MouseEventRecord[] = [
  { t: 0, type: 'move', x: 300, y: 500 },
  { t: 3000, type: 'move', x: 1600, y: 500 },
]

function scene(webcam: Partial<WebcamSettings> | null) {
  const base = createProject({
    name: 'Test',
    source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
    durationMs: 10_000,
    id: '00000000-0000-4000-8000-000000000000',
    createdAt: new Date('2026-11-04T00:00:00Z'),
  })
  const project: Project = { ...base, webcam: webcam ? { ...DEFAULT_WEBCAM, ...webcam } : null }
  return buildScene({ project, events, zooms: [] })
}

describe('sceneFrame', () => {
  it('passes the decoded background image to every frame, in every format (A-04)', () => {
    const image = { source: {}, size: { width: 800, height: 600 } }
    const withImage = { ...scene(null), backgroundImage: image }
    for (const aspect of ['16:9', '1:1', '9:16'] as const) {
      const frame = sceneFrame(withImage, SOURCE, aspect, outputSize(aspect, '1080p'), 1000)
      expect(frame.backgroundImage).toBe(image)
    }
    expect(sceneFrame(scene(null), SOURCE, '16:9', OUT, 0).backgroundImage).toBeNull()
  })

  it('draws the split cards in 9:16 with a camera frame', () => {
    const frame = sceneFrame(scene({ layout: 'split' }), SOURCE, '9:16', OUT, 1000, CAMERA)
    const regions = splitRegions(OUT, 8, undefined)
    expect(frame.region).toEqual(regions.screen)
    expect(frame.webcam?.card).toMatchObject({ ...regions.camera, opacity: 1 })
    expect(frame.webcam?.bubble).toBeUndefined()
    expect(frame.keep).toMatchObject({ x: 300, y: 500 })
  })

  it('falls back to a plain 9:16 crop without a camera frame, and to the bubble elsewhere', () => {
    const s = scene({ layout: 'split' })
    const plain = sceneFrame(s, SOURCE, '9:16', OUT, 1000, null)
    expect(plain.region).toBeUndefined()
    expect(plain.webcam).toBeNull()
    expect(plain.focus).not.toBeNull()
    const wide = sceneFrame(s, SOURCE, '16:9', outputSize('16:9', '1080p'), 1000, CAMERA)
    expect(wide.webcam?.bubble).toBeDefined()
    expect(wide.focus).toBeNull()
    expect(wide.keep).toBeNull()
  })

  it('gives the screen the whole frame inside a hidden stretch', () => {
    const s = scene({ layout: 'split', hidden: [{ startMs: 4000, endMs: 6000 }] })
    const frame = sceneFrame(s, SOURCE, '9:16', OUT, 5000, CAMERA)
    expect(frame.region).toEqual(paddedArea(OUT, 8))
    expect(frame.webcam).toBeNull()
  })

  it('follows the cursor in a crop format', () => {
    const s = scene(null)
    const before = sceneFrame(s, SOURCE, '9:16', OUT, 1000)
    const after = sceneFrame(s, SOURCE, '9:16', OUT, 9000)
    expect(before.focus?.x).toBeLessThan(960)
    expect(after.focus?.x).toBeGreaterThan(960)
  })
})
