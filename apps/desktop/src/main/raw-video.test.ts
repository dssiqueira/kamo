import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectActionError } from './projects.ts'
import { rawVideoPath } from './raw-video.ts'
import { FileProjectStore } from './storage/file-store.ts'

const ID = '00000000-0000-4000-8000-000000000042'
let dir: string
let store: FileProjectStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-raw-'))
  store = new FileProjectStore(join(dir, 'projects'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (error: unknown) => (error instanceof ProjectActionError ? error.code : String(error)),
  )
}

describe('rawVideoPath', () => {
  it('finds the screen video of a project with a damaged project.json', async () => {
    const folder = store.projectDir(ID)
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'project.json'), '{ broken')
    await writeFile(join(folder, 'screen.mp4.partial'), new Uint8Array([1]))
    expect(await rawVideoPath(store, ID)).toBe(join(folder, 'screen.mp4.partial'))
    await writeFile(join(folder, 'screen.mp4'), new Uint8Array([1]))
    expect(await rawVideoPath(store, ID)).toBe(join(folder, 'screen.mp4'))
  })

  it('rejects a project without video, an unknown one and a path', async () => {
    await mkdir(store.projectDir(ID), { recursive: true })
    expect(await codeOf(rawVideoPath(store, ID))).toBe('project_not_found')
    expect(await codeOf(rawVideoPath(store, '00000000-0000-4000-8000-000000000043'))).toBe(
      'project_not_found',
    )
    expect(await codeOf(rawVideoPath(store, '../etc'))).not.toBeUndefined()
    expect(await codeOf(rawVideoPath(store, 42))).toBe('project_not_found')
  })
})
