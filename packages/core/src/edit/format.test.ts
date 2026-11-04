import { describe, expect, it } from 'vitest'
import { createProject } from '../project/project.ts'
import { Project, projectAspect } from '../project/schema.ts'
import { setAspect } from './format.ts'

const project = () =>
  createProject({
    name: 'Test',
    source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
    durationMs: 5000,
    id: '00000000-0000-4000-8000-000000000000',
    createdAt: new Date('2026-11-04T00:00:00Z'),
  })

describe('setAspect', () => {
  it('is 16:9 when missing and stores the other formats', () => {
    const p = project()
    expect(projectAspect(p)).toBe('16:9')
    const vertical = setAspect(p, '9:16')
    expect(vertical.aspect).toBe('9:16')
    expect(Project.safeParse(vertical).success).toBe(true)
  })

  it('drops the field for 16:9 and keeps the reference when nothing changes', () => {
    const p = project()
    expect(setAspect(p, '16:9')).toBe(p)
    const vertical = setAspect(p, '9:16')
    expect(setAspect(vertical, '9:16')).toBe(vertical)
    expect('aspect' in setAspect(vertical, '16:9')).toBe(false)
  })
})
