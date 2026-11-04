import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CURSOR,
  ProjectError,
  audioOffsetMs,
  createProject,
  migrateProject,
  parseProject,
  serializeProject,
  type Project,
  type Zoom,
} from '../index.ts'

const source = {
  kind: 'display',
  displayId: '1',
  width: 2880,
  height: 1800,
  scaleFactor: 2,
  fps: 30,
} as const

function project(overrides: Partial<Project> = {}): Project {
  const base = createProject({
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    name: 'Demo',
    source,
    durationMs: 120_000,
    createdAt: new Date('2026-11-03T22:38:00Z'),
  })
  return { ...base, ...overrides }
}

function zoom(startMs: number, endMs: number, origin: Zoom['origin'] = 'auto'): Zoom {
  return {
    id: `z${startMs}`,
    startMs,
    endMs,
    scale: 2,
    target: { x: 100, y: 100 },
    follow: true,
    origin,
    leadMs: 300,
  }
}

describe('createProject', () => {
  it('fills every default from data-model.md', () => {
    const p = project()
    expect(p.version).toBe(1)
    expect(p.style).toEqual({
      background: { kind: 'preset', value: 'sage' },
      padding: 8,
      radius: 12,
      shadow: true,
    })
    expect(p.cursor).toMatchObject({ stiffness: 170, damping: 26, autoHide: true })
    expect(p.trim).toEqual({ startMs: 0, endMs: 120_000 })
    expect(p.zooms).toEqual([])
    expect(p.pendingUpload).toBeNull()
  })

  it('does not share default objects between projects', () => {
    const a = project()
    a.cursor.size = 3
    expect(project().cursor.size).toBe(DEFAULT_CURSOR.size)
  })

  it('generates an id when none is given', () => {
    const p = createProject({ name: 'x', source, durationMs: 5000 })
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('parseProject / serializeProject', () => {
  it('round-trips', () => {
    const p = project({ zooms: [zoom(1000, 3000), zoom(3000, 5000, 'manual')] })
    expect(parseProject(serializeProject(p))).toEqual(p)
  })

  it('rejects broken JSON with a stable code', () => {
    expect(() => parseProject('{"version":')).toThrow(
      expect.objectContaining({ code: 'invalid_json' }),
    )
  })

  it.each([
    ['overlapping zooms', { zooms: [zoom(1000, 3000), zoom(2500, 4000)] }],
    ['unsorted zooms', { zooms: [zoom(5000, 7000), zoom(1000, 3000)] }],
    ['zoom shorter than 600ms', { zooms: [zoom(1000, 1500)] }],
    ['zoom past the end', { zooms: [zoom(119_000, 121_000)] }],
    ['trim past the end', { trim: { startMs: 0, endMs: 130_000 } }],
    ['trim shorter than 1s', { trim: { startMs: 5000, endMs: 5500 } }],
  ])('rejects %s', (_, overrides) => {
    const json = JSON.stringify(project(overrides as Partial<Project>))
    expect(() => parseProject(json)).toThrow(ProjectError)
  })

  it('keeps audio tracks without offsetMs valid (version 1 files) and reads it as 0', () => {
    const p = project()
    expect(p.audio.mic).toEqual({ enabled: false, volume: 1 })
    expect(audioOffsetMs(parseProject(serializeProject(p)).audio.mic)).toBe(0)
  })

  it('round-trips an audio offset, negative when the audio started first (F-04)', () => {
    const p = project({
      audio: {
        mic: { enabled: true, volume: 0.8, offsetMs: -412 },
        system: { enabled: true, volume: 1, offsetMs: 17 },
      },
    })
    const parsed = parseProject(serializeProject(p))
    expect(audioOffsetMs(parsed.audio.mic)).toBe(-412)
    expect(audioOffsetMs(parsed.audio.system)).toBe(17)
  })

  it('rejects a non-numeric audio offset', () => {
    const json = JSON.stringify({
      ...project(),
      audio: {
        mic: { enabled: true, volume: 1, offsetMs: 'soon' },
        system: project().audio.system,
      },
    })
    expect(() => parseProject(json)).toThrow(ProjectError)
  })

  it('lists what failed so the UI can offer to recover the raw video (F-12)', () => {
    const broken = { ...project(), style: { padding: 50 } }
    try {
      migrateProject(broken)
      expect.unreachable()
    } catch (error) {
      expect((error as ProjectError).code).toBe('invalid_project')
      expect((error as ProjectError).issues.some((i) => i.startsWith('style'))).toBe(true)
    }
  })
})

describe('migrateProject', () => {
  it('refuses projects from a newer Kamo', () => {
    expect(() => migrateProject({ ...project(), version: 2 })).toThrow(
      expect.objectContaining({ code: 'newer_version' }),
    )
  })

  it('refuses files without a version', () => {
    const { version: _, ...noVersion } = project()
    expect(() => migrateProject(noVersion)).toThrow(
      expect.objectContaining({ code: 'invalid_project' }),
    )
  })

  it('runs each migration once, in order, up to the target version', () => {
    const calls: number[] = []
    const step = (from: number) => (p: Record<string, unknown>) => {
      calls.push(from)
      return p
    }
    // The schema only accepts today's version, so validation fails after the steps run.
    expect(() => migrateProject(project(), { 1: step(1), 2: step(2) }, 3)).toThrow(ProjectError)
    expect(calls).toEqual([1, 2])
  })

  it('fails when a migration step is missing', () => {
    expect(() => migrateProject(project(), {}, 2)).toThrow(/no migration from version 1/)
  })
})
