import { PLAYLISTS_FILE, PlaylistError } from '@kamo/core'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlaylistStore } from './playlists.ts'
import { ProjectActionError } from './projects.ts'
import { FileProjectStore } from './storage/index.ts'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'aaaaaaaa-0000-4000-8000-000000000002'
const C = 'aaaaaaaa-0000-4000-8000-000000000003'

let dir: string
let root: string
let warnings: string[]
let playlists: PlaylistStore

async function project(id: string) {
  await mkdir(join(root, id), { recursive: true })
  await writeFile(join(root, id, 'project.json'), '{}')
}

async function onDisk() {
  return JSON.parse(await readFile(join(root, PLAYLISTS_FILE), 'utf8'))
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-playlists-'))
  root = join(dir, 'projects')
  warnings = []
  const store = new FileProjectStore(root)
  playlists = new PlaylistStore(() => store, { warn: (event) => warnings.push(event) })
  await Promise.all([project(A), project(B), project(C)])
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('PlaylistStore', () => {
  it('starts empty without creating the file', async () => {
    expect(await playlists.list()).toEqual([])
    expect(existsSync(join(root, PLAYLISTS_FILE))).toBe(false)
  })

  it('creates, adds, reorders, removes, renames and deletes, writing playlists.json', async () => {
    const created = await playlists.create('  Demos ', [A])
    expect(created).toMatchObject({ name: 'Demos', projectIds: [A] })
    await playlists.add(created.id, [B, C, A])
    await playlists.reorder(created.id, [C, A, B])
    await playlists.remove(created.id, [A])
    await playlists.rename(created.id, 'Release notes')
    const [listed] = await playlists.list()
    expect(listed).toMatchObject({ id: created.id, name: 'Release notes', projectIds: [C, B] })
    const file = await onDisk()
    expect(file.version).toBe(1)
    expect(file.playlists[0].projectIds).toEqual([C, B])
    await playlists.delete(created.id)
    expect(await playlists.list()).toEqual([])
    // only the file itself: no temp files left behind
    expect((await readdir(root)).filter((name) => !name.startsWith('aaaa'))).toEqual([
      PLAYLISTS_FILE,
    ])
  })

  it('serializes concurrent changes so none is lost', async () => {
    const { id } = await playlists.create('All')
    await Promise.all([playlists.add(id, [A]), playlists.add(id, [B]), playlists.add(id, [C])])
    expect((await playlists.list())[0]?.projectIds).toHaveLength(3)
  })

  it('refuses unknown or unsafe project ids and unknown playlists', async () => {
    const { id } = await playlists.create('X')
    await expect(playlists.add(id, ['bbbbbbbb-0000-4000-8000-000000000009'])).rejects.toThrow(
      ProjectActionError,
    )
    await expect(playlists.add(id, ['../escape'])).rejects.toThrow(ProjectActionError)
    await expect(playlists.add(id, 'nope')).rejects.toThrow(PlaylistError)
    await expect(playlists.rename('missing', 'Y')).rejects.toMatchObject({
      code: 'playlist_not_found',
    })
    await expect(playlists.create('   ')).rejects.toMatchObject({ code: 'invalid_name' })
  })

  it('hides a missing folder as a gap and cleans it on the next write', async () => {
    const { id } = await playlists.create('Gaps', [A, B])
    await rm(join(root, A), { recursive: true })
    expect((await playlists.list())[0]?.projectIds).toEqual([B])
    expect((await onDisk()).playlists[0].projectIds).toEqual([A, B]) // not written by a read
    await playlists.add(id, [C])
    expect((await onDisk()).playlists[0].projectIds).toEqual([B, C])
  })

  it('forgets a deleted project in every playlist', async () => {
    const one = await playlists.create('One', [A, B])
    const two = await playlists.create('Two', [A])
    expect(await playlists.forgetProject(A)).toBe(true)
    const listed = await playlists.list()
    expect(listed.find((p) => p.id === one.id)?.projectIds).toEqual([B])
    expect(listed.find((p) => p.id === two.id)?.projectIds).toEqual([])
    expect(await playlists.forgetProject(A)).toBe(false)
  })

  it('sets an unreadable file aside and starts over', async () => {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, PLAYLISTS_FILE), '{ not json')
    expect(await playlists.list()).toEqual([])
    expect(warnings).toContain('playlists.unreadable')
    const names = await readdir(root)
    expect(names.some((name) => /^playlists\.broken-.+\.json$/.test(name))).toBe(true)
    expect(names).not.toContain(PLAYLISTS_FILE)
  })

  it('leaves a newer file alone and refuses changes', async () => {
    const newer = '{"version":2,"playlists":[]}'
    await writeFile(join(root, PLAYLISTS_FILE), newer)
    expect(await playlists.list()).toEqual([])
    await expect(playlists.create('X')).rejects.toMatchObject({ code: 'newer_version' })
    expect(await readFile(join(root, PLAYLISTS_FILE), 'utf8')).toBe(newer)
  })
})
