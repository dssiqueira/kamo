import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensurePrivateDir } from './atomic.ts'
import { FileProjectStore } from './file-store.ts'

// M5: on Mac and Linux, other accounts cannot read recordings. Windows ignores the modes.
const posix = process.platform !== 'win32'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-private-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const mode = async (path: string) => (await stat(path)).mode & 0o777

describe.skipIf(!posix)('private folders and files', () => {
  it('creates the projects folder, project folders and files for this user only', async () => {
    const store = new FileProjectStore(join(dir, 'Kamo', 'projects'))
    await store.writeText('p1', 'project.json', '{}')
    const writable = await store.openWritable('p1', 'audio/mic.webm')
    const writer = writable.getWriter()
    await writer.write(new Uint8Array([1, 2, 3]))
    await writer.close()
    expect(await mode(join(dir, 'Kamo'))).toBe(0o700)
    expect(await mode(join(dir, 'Kamo', 'projects'))).toBe(0o700)
    expect(await mode(join(dir, 'Kamo', 'projects', 'p1'))).toBe(0o700)
    expect(await mode(join(dir, 'Kamo', 'projects', 'p1', 'audio'))).toBe(0o700)
    expect(await mode(join(dir, 'Kamo', 'projects', 'p1', 'project.json'))).toBe(0o600)
    expect(await mode(join(dir, 'Kamo', 'projects', 'p1', 'audio', 'mic.webm'))).toBe(0o600)
  })

  it('tightens an existing folder of this user', async () => {
    const existing = join(dir, 'open')
    await ensurePrivateDir(existing)
    await chmod(existing, 0o755)
    await ensurePrivateDir(existing)
    expect(await mode(existing)).toBe(0o700)
  })
})

describe('ensurePrivateDir', () => {
  it('creates missing folders on every platform', async () => {
    await ensurePrivateDir(join(dir, 'a', 'b'))
    expect((await stat(join(dir, 'a', 'b'))).isDirectory()).toBe(true)
  })
})
