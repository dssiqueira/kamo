import { describe, expect, it } from 'vitest'
import {
  MemoryProjectStore,
  PROJECT_FILES,
  createProject,
  listProjects,
  loadProject,
  saveProject,
} from '../index.ts'

const source = { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 } as const

const make = (name: string, createdAt: string) =>
  createProject({ name, source, durationMs: 10_000, createdAt: new Date(createdAt) })

describe('ProjectStore helpers', () => {
  it('saves and loads a project', async () => {
    const store = new MemoryProjectStore()
    const project = make('Demo', '2026-11-03T10:00:00Z')
    await saveProject(store, project)
    expect(await loadProject(store, project.id)).toEqual(project)
  })

  it('lists newest first and reports corrupted projects without failing', async () => {
    const store = new MemoryProjectStore()
    const older = make('Older', '2026-11-01T10:00:00Z')
    const newer = make('Newer', '2026-11-03T10:00:00Z')
    await saveProject(store, older)
    await saveProject(store, newer)
    await store.writeText('broken-id', PROJECT_FILES.project, '{ nope')
    await store.writeText('no-project-json', PROJECT_FILES.events, '')

    const { projects, broken } = await listProjects(store)
    expect(projects.map((p) => p.name)).toEqual(['Newer', 'Older'])
    expect(broken.map((b) => [b.projectId, b.error.code])).toEqual([['broken-id', 'invalid_json']])
  })

  it('fails with a stable code when the project is gone', async () => {
    await expect(loadProject(new MemoryProjectStore(), 'missing')).rejects.toMatchObject({
      code: 'invalid_project',
    })
  })
})

describe('MemoryProjectStore', () => {
  it('only exposes a streamed file after close', async () => {
    const store = new MemoryProjectStore()
    const writable = await store.openWritable('p', 'screen.webm')
    const writer = writable.getWriter()
    await writer.write(new Uint8Array([1, 2]))
    expect(await store.readBlob('p', 'screen.webm')).toBeNull()
    await writer.write(new Uint8Array([3]))
    await writer.close()
    const blob = await store.readBlob('p', 'screen.webm')
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('lists files of one directory only', async () => {
    const store = new MemoryProjectStore()
    await store.writeText('p', 'frames/0000.webp', 'a')
    await store.writeText('p', 'frames/0005.webp', 'b')
    await store.writeText('p', 'project.json', '{}')
    expect(await store.listFiles('p', PROJECT_FILES.frames)).toEqual(['0000.webp', '0005.webp'])
    expect(await store.listFiles('p', '')).toEqual(['project.json'])
  })
})
