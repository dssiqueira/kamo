import { PROJECT_FILES, createProject, listProjects, saveProject } from '@kamo/core'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProjectStore, defaultProjectsDir } from './file-store.ts'
import { UnsafePathError } from './paths.ts'

// Lets a test make rename fail, to check the atomic write and the Windows retry.
const renameHook = vi.hoisted(() => ({ fail: undefined as undefined | (() => Error | undefined) }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      const error = renameHook.fail?.()
      if (error) throw error
      return actual.rename(from, to)
    },
  }
})

const errno = (code: string) => Object.assign(new Error(code), { code })

let dir: string
let root: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-file-store-'))
  root = join(dir, 'projects')
  renameHook.fail = undefined
})

afterEach(async () => {
  renameHook.fail = undefined
  await rm(dir, { recursive: true, force: true })
})

describe('FileProjectStore', () => {
  it('defaults to ~/Kamo/projects', () => {
    expect(defaultProjectsDir()).toBe(join(homedir(), 'Kamo', 'projects'))
  })

  it('creates the root lazily on the first write', async () => {
    const store = new FileProjectStore(root)
    expect(await store.listProjectIds()).toEqual([])
    expect(existsSync(root)).toBe(false)
    await store.writeText('p', 'project.json', '{}')
    expect(existsSync(join(root, 'p', 'project.json'))).toBe(true)
  })

  it('lists only project folders, ignoring stray files and odd names', async () => {
    const store = new FileProjectStore(root)
    await mkdir(join(root, 'b'), { recursive: true })
    await mkdir(join(root, 'a'))
    await mkdir(join(root, '.hidden'))
    await writeFile(join(root, 'notes.txt'), 'x')
    expect(await store.listProjectIds()).toEqual(['a', 'b'])
  })

  it('keeps the old file and leaves no temp file when the write fails', async () => {
    const store = new FileProjectStore(root)
    await store.writeText('p', 'project.json', 'old')
    renameHook.fail = () => errno('ENOSPC')
    await expect(store.writeText('p', 'project.json', 'new')).rejects.toMatchObject({
      code: 'ENOSPC',
    })
    renameHook.fail = undefined
    expect(await store.readText('p', 'project.json')).toBe('old')
    expect(await readdir(join(root, 'p'))).toEqual(['project.json'])
  })

  it('retries a rename blocked by another process (Windows EPERM/EBUSY)', async () => {
    const store = new FileProjectStore(root)
    const failures = [errno('EPERM'), errno('EBUSY')]
    renameHook.fail = () => failures.shift()
    await store.writeText('p', 'project.json', 'saved')
    expect(failures).toEqual([])
    expect(await store.readText('p', 'project.json')).toBe('saved')
  })

  it('streams a large file in chunks and leaves no partial behind', async () => {
    const store = new FileProjectStore(root)
    const writer = (await store.openWritable('p', 'screen.mp4')).getWriter()
    const chunk = new Uint8Array(1024 * 1024).fill(7)
    for (let i = 0; i < 16; i++) await writer.write(chunk)
    expect(existsSync(join(root, 'p', 'screen.mp4.partial'))).toBe(true)
    await writer.close()
    const blob = await store.readBlob('p', 'screen.mp4')
    expect(blob!.size).toBe(16 * 1024 * 1024)
    expect(await readdir(join(root, 'p'))).toEqual(['screen.mp4'])
  })

  it('deletes the partial on abort', async () => {
    const store = new FileProjectStore(root)
    const writer = (await store.openWritable('p', 'screen.mp4')).getWriter()
    await writer.write(new Uint8Array([1]))
    await writer.abort()
    expect(await readdir(join(root, 'p'))).toEqual([])
  })

  it('hides in-progress files from listFiles', async () => {
    const store = new FileProjectStore(root)
    await store.writeText('p', 'events.jsonl', '')
    await writeFile(join(root, 'p', 'screen.mp4.partial'), 'x')
    await writeFile(join(root, 'p', '.project.json.123e4567-e89b-12d3-a456-426614174000.tmp'), 'x')
    expect(await store.listFiles('p', '')).toEqual(['events.jsonl'])
    expect(await store.listPartialFiles('p')).toEqual(['screen.mp4.partial'])
  })

  it('moves a deleted project to the injected trash', async () => {
    const trashed: string[] = []
    const store = new FileProjectStore(root, {
      trash: async (path) => {
        trashed.push(path)
        await rm(path, { recursive: true })
      },
    })
    await store.writeText('p', 'project.json', '{}')
    await store.deleteProject('p')
    expect(trashed).toEqual([join(root, 'p')])
    expect(await store.listProjectIds()).toEqual([])
  })

  it('drops a project folder deleted from outside the app', async () => {
    const store = new FileProjectStore(root)
    const source = { kind: 'display', width: 1280, height: 720, scaleFactor: 1, fps: 30 } as const
    const project = createProject({ name: 'Demo', source, durationMs: 1000 })
    await saveProject(store, project)
    await rm(join(root, project.id), { recursive: true })
    expect(await listProjects(store)).toEqual({ projects: [], broken: [] })
    expect(await store.readText(project.id, PROJECT_FILES.project)).toBeNull()
  })

  describe('rejects paths that escape the project folder', () => {
    const badIds = ['..', '.', '', 'a/b', 'a\\b', 'C:', '../x', 'CON', 'nul', 'x'.repeat(129)]
    const badPaths = [
      '',
      '..',
      '../other/project.json',
      'frames/../../x',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      'C:/x',
      'frames\\0000.webp',
      'frames//x',
      './project.json',
      'trailing.',
      'nul.txt',
      'a\u0000b',
    ]

    it.each(badIds)('project id %j', async (projectId) => {
      const store = new FileProjectStore(root)
      await expect(store.readText(projectId, 'project.json')).rejects.toBeInstanceOf(
        UnsafePathError,
      )
      await expect(store.writeText(projectId, 'project.json', 'x')).rejects.toBeInstanceOf(
        UnsafePathError,
      )
      await expect(store.deleteProject(projectId)).rejects.toBeInstanceOf(UnsafePathError)
    })

    it.each(badPaths)('path %j', async (path) => {
      const store = new FileProjectStore(root)
      await expect(store.readText('p', path)).rejects.toBeInstanceOf(UnsafePathError)
      await expect(store.writeText('p', path, 'x')).rejects.toBeInstanceOf(UnsafePathError)
      await expect(store.readBlob('p', path)).rejects.toBeInstanceOf(UnsafePathError)
      await expect(store.openWritable('p', path)).rejects.toBeInstanceOf(UnsafePathError)
    })

    it('listFiles rejects escapes but accepts the project root', async () => {
      const store = new FileProjectStore(root)
      await expect(store.listFiles('p', '..')).rejects.toBeInstanceOf(UnsafePathError)
      await expect(store.listFiles('p', '/etc')).rejects.toBeInstanceOf(UnsafePathError)
      await expect(store.listFiles('p', '')).resolves.toEqual([])
    })

    it('never writes outside the root', async () => {
      const store = new FileProjectStore(root)
      await store.writeText('p', 'x', 'x').catch(() => {})
      await store.writeText('..', 'escaped.txt', 'x').catch(() => {})
      expect(existsSync(join(dir, 'escaped.txt'))).toBe(false)
    })
  })
})
