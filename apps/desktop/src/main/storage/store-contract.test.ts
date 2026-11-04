// The same behavior tests run against MemoryProjectStore (the reference) and
// FileProjectStore, so the desktop store cannot drift from the shared contract.
import {
  MemoryProjectStore,
  PROJECT_FILES,
  createProject,
  listProjects,
  loadProject,
  saveProject,
  type ProjectStore,
} from '@kamo/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileProjectStore } from './file-store.ts'

const source = { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 } as const

const make = (name: string, createdAt: string) =>
  createProject({ name, source, durationMs: 10_000, createdAt: new Date(createdAt) })

const bytes = async (blob: Blob | null) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null)

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const stores: [string, () => Promise<ProjectStore>][] = [
  ['MemoryProjectStore', async () => new MemoryProjectStore()],
  [
    'FileProjectStore',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'kamo-store-'))
      tempDirs.push(dir)
      return new FileProjectStore(join(dir, 'projects'))
    },
  ],
]

describe.each(stores)('ProjectStore contract: %s', (_name, createStore) => {
  it('starts empty and returns null for missing files', async () => {
    const store = await createStore()
    expect(await store.listProjectIds()).toEqual([])
    expect(await store.readText('p', 'project.json')).toBeNull()
    expect(await store.readBlob('p', 'screen.mp4')).toBeNull()
    expect(await store.listFiles('p', '')).toEqual([])
  })

  it('writes and replaces text', async () => {
    const store = await createStore()
    await store.writeText('p', 'project.json', 'first')
    await store.writeText('p', 'project.json', 'second, longer than the first')
    expect(await store.readText('p', 'project.json')).toBe('second, longer than the first')
    expect(await store.listFiles('p', '')).toEqual(['project.json'])
  })

  it('round-trips UTF-8 text and exposes it as a blob too', async () => {
    const store = await createStore()
    await store.writeText('p', 'notes.txt', 'Gravação 録画 ✓')
    expect(await store.readText('p', 'notes.txt')).toBe('Gravação 録画 ✓')
    expect(await (await store.readBlob('p', 'notes.txt'))!.text()).toBe('Gravação 録画 ✓')
  })

  it('only exposes a streamed file after close', async () => {
    const store = await createStore()
    const writer = (await store.openWritable('p', 'screen.mp4')).getWriter()
    await writer.write(new Uint8Array([1, 2]))
    expect(await store.readBlob('p', 'screen.mp4')).toBeNull()
    expect(await store.listFiles('p', '')).toEqual([])
    await writer.write(new Uint8Array([3]))
    await writer.close()
    expect(await bytes(await store.readBlob('p', 'screen.mp4'))).toEqual(new Uint8Array([1, 2, 3]))
    expect(await store.listFiles('p', '')).toEqual(['screen.mp4'])
  })

  it('discards a streamed file on abort', async () => {
    const store = await createStore()
    const writer = (await store.openWritable('p', 'screen.mp4')).getWriter()
    await writer.write(new Uint8Array([1, 2, 3]))
    await writer.abort(new Error('recording failed'))
    expect(await store.readBlob('p', 'screen.mp4')).toBeNull()
    expect(await store.listFiles('p', '')).toEqual([])
  })

  it('lists direct children of one directory, sorted, files only', async () => {
    const store = await createStore()
    await store.writeText('p', 'frames/0005.webp', 'b')
    await store.writeText('p', 'frames/0000.webp', 'a')
    await store.writeText('p', 'frames/deep/x.webp', 'c')
    await store.writeText('p', 'project.json', '{}')
    expect(await store.listFiles('p', 'frames')).toEqual(['0000.webp', '0005.webp'])
    expect(await store.listFiles('p', 'frames/')).toEqual(['0000.webp', '0005.webp'])
    expect(await store.listFiles('p', '')).toEqual(['project.json'])
    expect(await store.listFiles('p', 'missing')).toEqual([])
  })

  it('lists projects and deletes one', async () => {
    const store = await createStore()
    await store.writeText('a', 'project.json', '{}')
    await store.writeText('b', 'project.json', '{}')
    expect((await store.listProjectIds()).sort()).toEqual(['a', 'b'])
    await store.deleteProject('a')
    expect(await store.listProjectIds()).toEqual(['b'])
    expect(await store.readText('a', 'project.json')).toBeNull()
    await expect(store.deleteProject('a')).resolves.toBeUndefined()
  })

  it('supports loadProject, saveProject and listProjects from core', async () => {
    const store = await createStore()
    const older = make('Older', '2026-11-01T10:00:00Z')
    const newer = make('Newer', '2026-11-03T10:00:00Z')
    await saveProject(store, older)
    await saveProject(store, newer)
    await store.writeText('broken-id', PROJECT_FILES.project, '{ nope')
    await store.writeText('no-project-json', PROJECT_FILES.events, '')

    expect(await loadProject(store, newer.id)).toEqual(newer)
    const { projects, broken } = await listProjects(store)
    expect(projects.map((p) => p.name)).toEqual(['Newer', 'Older'])
    expect(broken.map((b) => [b.projectId, b.error.code])).toEqual([['broken-id', 'invalid_json']])

    // rename (F-12) is an edit of project.json, saved in place
    await saveProject(store, { ...older, name: 'Renamed' })
    expect((await loadProject(store, older.id)).name).toBe('Renamed')
  })
})
