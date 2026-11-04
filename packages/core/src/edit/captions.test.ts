import { describe, expect, it } from 'vitest'
import { createProject } from '../project/project.ts'
import { DEFAULT_CAPTIONS, Project, projectCaptions } from '../project/schema.ts'
import { setCaptions } from './captions.ts'

const project = createProject({
  name: 'Test',
  durationMs: 10_000,
  source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
})

describe('setCaptions (A-06)', () => {
  it('starts from the defaults the first time', () => {
    expect(project.captions).toBeNull()
    expect(projectCaptions(project)).toEqual({ ...DEFAULT_CAPTIONS, enabled: false })
    const on = setCaptions(project, { enabled: true })
    expect(on.captions).toEqual(DEFAULT_CAPTIONS)
    expect(Project.safeParse(on).success).toBe(true)
  })

  it('changes one setting and keeps the rest', () => {
    const on = setCaptions(project, { enabled: true })
    const bold = setCaptions(on, { preset: 'bold', position: 'middle' })
    expect(bold.captions).toEqual({ ...DEFAULT_CAPTIONS, preset: 'bold', position: 'middle' })
  })

  it('returns the same project when nothing changes', () => {
    const on = setCaptions(project, { enabled: true })
    expect(setCaptions(on, { enabled: true })).toBe(on)
    expect(setCaptions(on, {})).toBe(on)
  })

  it('keeps older files valid: captions null still parses', () => {
    expect(Project.safeParse({ ...project, captions: null }).success).toBe(true)
    expect(Project.safeParse({ ...project, captions: { enabled: true } }).success).toBe(false)
  })
})
