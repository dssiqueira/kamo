import { describe, expect, it } from 'vitest'
import { PlaylistStore, type PlaylistFileIo } from './playlists.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function memory(initial: string | null = null): PlaylistFileIo & { text: string | null } {
  const io = {
    text: initial,
    read: async () => io.text,
    write: async (text: string) => {
      io.text = text
    },
  }
  return io
}

describe('PlaylistStore (OPFS playlists.json)', () => {
  it('creates, fills, reorders and renames like the desktop', async () => {
    const io = memory()
    const store = new PlaylistStore(io)
    const created = await store.create('  Demos  ', [A])
    expect(created.name).toBe('Demos')
    await store.add(created.id, [B])
    await store.reorder(created.id, [B, A])
    await store.rename(created.id, 'Product demos')
    const [playlist] = await store.list()
    expect(playlist).toMatchObject({ name: 'Product demos', projectIds: [B, A] })
    expect(JSON.parse(io.text ?? '')).toMatchObject({ version: 1 })
  })

  it('serializes quick changes so none is lost', async () => {
    const store = new PlaylistStore(memory())
    const { id } = await store.create('Mix', [])
    await Promise.all([store.add(id, [A]), store.add(id, [B])])
    expect((await store.list())[0]?.projectIds).toEqual([A, B])
  })

  it('drops deleted projects from every playlist', async () => {
    const store = new PlaylistStore(memory())
    const { id } = await store.create('Mix', [A, B])
    await store.keepOnly(new Set([B]))
    expect((await store.list())[0]?.projectIds).toEqual([B])
    await store.delete(id)
    expect(await store.list()).toEqual([])
  })

  it('never overwrites a file from a newer Kamo', async () => {
    const newer = JSON.stringify({ version: 99, playlists: [] })
    const io = memory(newer)
    const store = new PlaylistStore(io)
    expect(await store.list()).toEqual([])
    await expect(store.create('Mix', [])).rejects.toMatchObject({ code: 'newer_version' })
    expect(io.text).toBe(newer)
  })

  it('starts over from a damaged file', async () => {
    const store = new PlaylistStore(memory('{nope'))
    expect(await store.list()).toEqual([])
    await store.create('Fresh', [])
    expect((await store.list()).map((p) => p.name)).toEqual(['Fresh'])
  })
})
