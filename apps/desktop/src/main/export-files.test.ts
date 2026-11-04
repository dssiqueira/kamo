import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkFileName, ExportFileError, ExportFiles } from './export-files.ts'
import { mediaSize, readMedia } from './export-media.ts'

const log = { info: () => {}, warn: () => {} }
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-export-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const bytes = (...values: number[]) => Uint8Array.from(values)

describe('ExportFiles', () => {
  it('writes to .partial at positions and renames on commit', async () => {
    const files = new ExportFiles(() => dir, log)
    const { id, name } = await files.open(1, 'Demo 16x9 1080p30.mp4')
    expect(name).toBe('Demo 16x9 1080p30.mp4')
    expect(await readdir(dir)).toEqual(['Demo 16x9 1080p30.mp4.partial'])
    expect(files.isExporting()).toBe(true)

    await files.write(id, 4, bytes(5, 6))
    await files.write(id, 0, bytes(1, 2, 3, 4))
    const path = await files.commit(id)
    expect(path).toBe(join(dir, 'Demo 16x9 1080p30.mp4'))
    expect([...(await readFile(path))]).toEqual([1, 2, 3, 4, 5, 6])
    expect(await readdir(dir)).toEqual(['Demo 16x9 1080p30.mp4'])
    expect(files.isExporting()).toBe(false)
    expect(files.isCommitted(path)).toBe(true)
  })

  it('appends " (2)", " (3)" when the name exists or is being exported (F-11)', async () => {
    await writeFile(join(dir, 'Demo 16x9 1080p30.mp4'), 'old')
    const files = new ExportFiles(() => dir, log)
    const a = await files.open(1, 'Demo 16x9 1080p30.mp4')
    const b = await files.open(1, 'Demo 16x9 1080p30.mp4')
    expect(a.name).toBe('Demo 16x9 1080p30 (2).mp4')
    expect(b.name).toBe('Demo 16x9 1080p30 (3).mp4')
    // The existing file is never touched.
    expect(await readFile(join(dir, 'Demo 16x9 1080p30.mp4'), 'utf8')).toBe('old')
  })

  it('treats names case-insensitively for the in-flight reservation', async () => {
    const files = new ExportFiles(() => dir, log)
    await files.open(1, 'demo.mp4')
    const b = await files.open(1, 'Demo.mp4')
    expect(b.name).toBe('Demo (2).mp4')
  })

  it('deletes the incomplete file on abort (F-11)', async () => {
    const files = new ExportFiles(() => dir, log)
    const { id } = await files.open(1, 'Demo.mp4')
    await files.write(id, 0, bytes(1, 2, 3))
    await files.abort(id)
    expect(await readdir(dir)).toEqual([])
    await files.abort(id) // second abort is a no-op
    await expect(files.write(id, 0, bytes(1))).rejects.toMatchObject({ code: 'export_not_found' })
  })

  it('aborts every unfinished file of a page that went away', async () => {
    const files = new ExportFiles(() => dir, log)
    await files.open(1, 'A.mp4')
    const other = await files.open(2, 'B.mp4')
    await files.abortAll(1)
    expect(await readdir(dir)).toEqual(['B.mp4.partial'])
    expect(files.isExporting(1)).toBe(false)
    expect(files.isExporting(2)).toBe(true)
    await files.abort(other.id)
  })

  it('creates the export folder when missing', async () => {
    const files = new ExportFiles(() => join(dir, 'Videos', 'Kamo'), log)
    const { id } = await files.open(1, 'A.mp4')
    expect(await files.commit(id)).toBe(join(dir, 'Videos', 'Kamo', 'A.mp4'))
  })

  it('rejects bad arguments from the renderer', async () => {
    const files = new ExportFiles(() => dir, log)
    const { id } = await files.open(1, 'A.mp4')
    await expect(files.write(id, -1, bytes(1))).rejects.toThrow(TypeError)
    await expect(files.write(id, 0, 'nope')).rejects.toThrow(TypeError)
    await files.abort(id)
  })
})

describe('checkFileName', () => {
  it('accepts sanitized export names', () => {
    expect(checkFileName('Gravação 16x9 1080p30.mp4')).toBe('Gravação 16x9 1080p30.mp4')
  })

  it.each([
    '../evil.mp4',
    'a/b.mp4',
    'a\\b.mp4',
    'C:evil.mp4',
    'name.exe',
    'noext',
    '.mp4',
    'CON.mp4',
    '',
    42,
  ])('rejects %j', (name) => {
    expect(() => checkFileName(name)).toThrow(ExportFileError)
  })
})

describe('export media reads', () => {
  it('reads byte ranges of the recording files only', async () => {
    const project = 'p1'
    await rm(join(dir, project), { recursive: true, force: true })
    await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, project)))
    await writeFile(join(dir, project, 'screen.mp4'), Buffer.from([0, 1, 2, 3, 4, 5]))
    expect(await mediaSize(dir, project, 'screen.mp4')).toBe(6)
    expect(await mediaSize(dir, project, 'audio.m4a')).toBeNull()
    expect([...(await readMedia(dir, project, 'screen.mp4', 2, 5))]).toEqual([2, 3, 4])
    await expect(mediaSize(dir, project, 'project.json')).rejects.toThrow(TypeError)
    await expect(readMedia(dir, project, 'screen.mp4', 5, 2)).rejects.toThrow(TypeError)
    await expect(readMedia(dir, '..', 'screen.mp4', 0, 1)).rejects.toThrow()
  })
})
