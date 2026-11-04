import { createPlaylist, emptyPlaylists, serializePlaylists } from '@kamo/core'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IDS, buildSampleFolder, call, connect, data, text, type Connected } from './helpers.ts'

const DEMOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GONE = '99999999-9999-4999-8999-999999999999'

let dir: string
let mcp: Connected

beforeAll(async () => {
  dir = await buildSampleFolder()
  mcp = await connect(dir)
})

afterAll(async () => {
  await mcp.close()
  await rm(dir, { recursive: true, force: true })
})

async function writePlaylists(json: string) {
  await writeFile(join(dir, 'playlists.json'), json)
}

describe('playlists', () => {
  it('says there are none when the app never made one', async () => {
    const result = data(await call(mcp.client, 'list_playlists'))
    expect(result.total).toBe(0)
    expect(result.message).toMatch(/No playlists yet/)
    const missing = await call(mcp.client, 'get_playlist', { playlist: 'Demos' })
    expect(missing.isError).toBe(true)
  })

  it('lists playlists and returns recordings in playlist order, counting gaps', async () => {
    let file = createPlaylist(emptyPlaylists(), {
      name: 'Release notes',
      id: DEMOS,
      projectIds: [IDS.onboarding, GONE, IDS.billing],
      now: new Date('2026-11-02T10:00:00Z'),
    }).file
    file = createPlaylist(file, { name: 'Empty one' }).file
    await writePlaylists(serializePlaylists(file))

    const listed = data(await call(mcp.client, 'list_playlists'))
    expect(listed.total).toBe(2)
    expect(listed.playlists[0]).toMatchObject({
      id: DEMOS,
      name: 'Release notes',
      recordingCount: 2,
      recordingIds: [IDS.onboarding, IDS.billing],
    })

    const byName = data(await call(mcp.client, 'get_playlist', { playlist: 'release NOTES' }))
    expect(byName.id).toBe(DEMOS)
    expect(byName.missingCount).toBe(1)
    expect(byName.recordings.map((r: { id: string }) => r.id)).toEqual([
      IDS.onboarding,
      IDS.billing,
    ])
    expect(byName.recordings[1]).toMatchObject({ position: 2, name: 'Billing walkthrough' })

    const paged = data(await call(mcp.client, 'get_playlist', { playlist: DEMOS, limit: 1 }))
    expect(paged.recordings).toHaveLength(1)
    expect(paged.nextOffset).toBe(1)
  })

  it('explains an unreadable or newer playlists.json instead of failing', async () => {
    await writePlaylists('{ nope')
    const broken = await call(mcp.client, 'list_playlists')
    expect(broken.isError).toBe(true)
    expect(text(broken)).toMatch(/could not be read/)
    await writePlaylists('{"version": 9, "playlists": []}')
    const newer = await call(mcp.client, 'get_playlist', { playlist: 'x' })
    expect(text(newer)).toMatch(/newer Kamo/)
    // Recordings still work.
    expect(data(await call(mcp.client, 'list_recordings')).total).toBe(3)
  })
})
