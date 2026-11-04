import { PROJECT_FILES, ProjectError, createProject, saveProject } from '@kamo/core'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_PROJECT_NAME_LENGTH,
  ProjectActionError,
  listProjectSummaries,
  renameProject,
  saveProjectData,
  validateProjectName,
} from './projects.ts'
import { FileProjectStore } from './storage/index.ts'

const source = {
  kind: 'display' as const,
  width: 1920,
  height: 1080,
  scaleFactor: 1,
  fps: 30 as const,
}

describe('validateProjectName', () => {
  it('trims and accepts up to 120 characters', () => {
    expect(validateProjectName('  Demo  ')).toBe('Demo')
    expect(validateProjectName('a'.repeat(MAX_PROJECT_NAME_LENGTH))).toHaveLength(120)
    // Counted in characters, not UTF-16 units.
    expect(validateProjectName('🎬'.repeat(120))).toBe('🎬'.repeat(120))
  })

  it('turns line breaks into spaces', () => {
    expect(validateProjectName('a\nb\tc')).toBe('a b c')
  })

  it('rejects empty, too long and non-string names', () => {
    for (const name of ['', '   ', '\n', 'a'.repeat(121), 42, null, undefined]) {
      expect(() => validateProjectName(name)).toThrow(ProjectActionError)
    }
  })
})

describe('project actions', () => {
  let dir: string
  let store: FileProjectStore
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kamo-projects-'))
    store = new FileProjectStore(dir)
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists summaries newest first, with the thumbnail only when it exists', async () => {
    const old = createProject({ name: 'Old', source, durationMs: 5000, createdAt: new Date(1000) })
    const recent = createProject({
      name: 'New',
      source,
      durationMs: 8000,
      createdAt: new Date(2000),
    })
    await saveProject(store, old)
    await saveProject(store, { ...recent, trim: { startMs: 1000, endMs: 7000 } })
    await mkdir(join(dir, recent.id, 'frames'))
    await writeFile(join(dir, recent.id, 'frames', '0000.jpg'), 'jpg')
    await mkdir(join(dir, 'broken'))
    await writeFile(join(dir, 'broken', PROJECT_FILES.project), '{')
    await writeFile(join(dir, 'broken', 'screen.mp4'), 'mp4')

    const { projects, broken } = await listProjectSummaries(store)
    expect(projects.map((p) => p.name)).toEqual(['New', 'Old'])
    expect(projects[0]).toEqual({
      id: recent.id,
      name: 'New',
      createdAt: recent.createdAt,
      durationMs: 6000,
      thumbnailUrl: `kamo-media://project/${recent.id}/frames/0000.jpg`,
      width: 1920,
      height: 1080,
      transcript: 'none',
    })
    expect(projects[1]?.thumbnailUrl).toBeNull()
    expect(broken).toEqual([{ projectId: 'broken', code: 'invalid_json', hasVideo: true }])
  })

  it('renames with the trimmed name', async () => {
    const project = createProject({ name: 'A', source, durationMs: 5000 })
    await saveProject(store, project)
    const summary = await renameProject(store, project.id, '  B ')
    expect(summary.name).toBe('B')
    expect((await listProjectSummaries(store)).projects[0]?.name).toBe('B')
    await expect(renameProject(store, project.id, ' ')).rejects.toThrow(ProjectActionError)
    await expect(renameProject(store, 'missing', 'C')).rejects.toThrow(ProjectActionError)
  })

  it('saves valid projects and rejects invalid ones with a stable code', async () => {
    const project = createProject({ name: 'A', source, durationMs: 5000 })
    await saveProject(store, project)
    const edited = { ...project, style: { ...project.style, padding: 4 } }
    const { previous } = await saveProjectData(store, edited)
    expect(previous?.style.padding).toBe(project.style.padding)

    const invalid = { ...project, style: { ...project.style, padding: 99 } }
    await expect(saveProjectData(store, invalid)).rejects.toMatchObject({
      code: 'invalid_project',
    })
    await expect(saveProjectData(store, 'x')).rejects.toBeInstanceOf(ProjectError)
  })

  it('does not bring back a deleted project on autosave', async () => {
    const project = createProject({ name: 'A', source, durationMs: 5000 })
    await saveProject(store, project)
    await store.deleteProject(project.id)
    await expect(saveProjectData(store, project)).rejects.toMatchObject({
      code: 'project_not_found',
    })
    expect(await store.listProjectIds()).toEqual([])
  })
})
