import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYLIST_NAME_LENGTH,
  PlaylistError,
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  emptyPlaylists,
  moveInPlaylist,
  parsePlaylists,
  playlistsOf,
  prunePlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  serializePlaylists,
  validatePlaylistName,
  type PlaylistsFile,
} from './playlists.ts'

const T0 = new Date('2026-11-04T10:00:00.000Z')
const T1 = new Date('2026-11-04T11:00:00.000Z')
const PL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PL2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function withOne(projectIds: string[] = []): PlaylistsFile {
  return createPlaylist(emptyPlaylists(), { name: 'Demos', id: PL, projectIds, now: T0 }).file
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof PlaylistError) return error.code
    throw error
  }
  return undefined
}

describe('playlists.json format', () => {
  it('round-trips through serialize and parse', () => {
    const file = withOne(['p1', 'p2'])
    const { file: parsed, dropped } = parsePlaylists(serializePlaylists(file))
    expect(dropped).toBe(0)
    expect(parsed).toEqual(file)
    expect(parsed.playlists[0]).toMatchObject({
      id: PL,
      name: 'Demos',
      projectIds: ['p1', 'p2'],
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    })
  })

  it('rejects broken JSON, a missing version and newer versions with stable codes', () => {
    expect(codeOf(() => parsePlaylists('{'))).toBe('invalid_json')
    expect(codeOf(() => parsePlaylists('[]'))).toBe('invalid_playlists')
    expect(codeOf(() => parsePlaylists('{"playlists":[]}'))).toBe('invalid_playlists')
    expect(codeOf(() => parsePlaylists('{"version":1}'))).toBe('invalid_playlists')
    expect(codeOf(() => parsePlaylists('{"version":2,"playlists":[]}'))).toBe('newer_version')
  })

  it('drops invalid entries, duplicate playlists and repeated projects, keeping the rest', () => {
    const good = withOne(['p1']).playlists[0]
    const json = JSON.stringify({
      version: 1,
      playlists: [
        { ...good, projectIds: ['p1', 'p2', 'p1'] },
        { ...good, name: 'Duplicate id' },
        { id: 'not-a-uuid', name: 'x', projectIds: [], createdAt: T0, updatedAt: T0 },
        { ...good, id: PL2, name: '' },
        42,
      ],
    })
    const { file, dropped } = parsePlaylists(json)
    expect(file.playlists).toHaveLength(1)
    expect(file.playlists[0]?.projectIds).toEqual(['p1', 'p2'])
    expect(dropped).toBe(5)
  })

  it('keeps fields from a newer app (e.g. a cloud id) through a round trip', () => {
    const file = withOne()
    const json = JSON.stringify({
      ...file,
      syncedAt: 'later',
      playlists: [{ ...file.playlists[0], cloud: { playlistId: 'x' } }],
    })
    const renamed = renamePlaylist(parsePlaylists(json).file, PL, 'Release notes', T1)
    const again = JSON.parse(serializePlaylists(renamed))
    expect(again.syncedAt).toBe('later')
    expect(again.playlists[0].cloud).toEqual({ playlistId: 'x' })
    expect(again.playlists[0].name).toBe('Release notes')
  })
})

describe('playlist names', () => {
  it('trims, flattens line breaks and enforces 1–120 characters', () => {
    expect(validatePlaylistName('  Sprint\n42  ')).toBe('Sprint 42')
    expect(codeOf(() => validatePlaylistName('   '))).toBe('invalid_name')
    expect(codeOf(() => validatePlaylistName(7))).toBe('invalid_name')
    expect(codeOf(() => validatePlaylistName('x'.repeat(MAX_PLAYLIST_NAME_LENGTH + 1)))).toBe(
      'invalid_name',
    )
    expect(validatePlaylistName('x'.repeat(MAX_PLAYLIST_NAME_LENGTH))).toHaveLength(120)
  })
})

describe('playlist operations', () => {
  it('creates in creation order with a uuid and both dates', () => {
    const one = withOne()
    const { file, playlist } = createPlaylist(one, { name: ' Onboarding ', now: T1 })
    expect(file.playlists.map((p) => p.name)).toEqual(['Demos', 'Onboarding'])
    expect(playlist.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(playlist.createdAt).toBe(T1.toISOString())
    expect(one.playlists).toHaveLength(1) // inputs are never mutated
  })

  it('renames and touches updatedAt only when the name changes', () => {
    const file = withOne()
    expect(renamePlaylist(file, PL, 'Demos', T1)).toBe(file)
    const renamed = renamePlaylist(file, PL, 'Talks', T1)
    expect(renamed.playlists[0]).toMatchObject({ name: 'Talks', updatedAt: T1.toISOString() })
    expect(codeOf(() => renamePlaylist(file, PL2, 'x'))).toBe('playlist_not_found')
  })

  it('adds without duplicates and removes', () => {
    let file = withOne(['p1'])
    file = addToPlaylist(file, PL, ['p2', 'p1', 'p3', 'p2'], T1)
    expect(file.playlists[0]?.projectIds).toEqual(['p1', 'p2', 'p3'])
    expect(addToPlaylist(file, PL, ['p3'])).toBe(file)
    file = removeFromPlaylist(file, PL, ['p2'], T1)
    expect(file.playlists[0]?.projectIds).toEqual(['p1', 'p3'])
    expect(removeFromPlaylist(file, PL, ['nope'])).toBe(file)
  })

  it('reorders, keeping ids the caller did not mention after the others', () => {
    const file = withOne(['a', 'b', 'c', 'gap'])
    const next = reorderPlaylist(file, PL, ['c', 'a', 'b'], T1)
    expect(next.playlists[0]?.projectIds).toEqual(['c', 'a', 'b', 'gap'])
    expect(reorderPlaylist(file, PL, ['a', 'b'])).toBe(file)
    expect(codeOf(() => reorderPlaylist(file, PL, ['a', 'x']))).toBe('invalid_order')
    expect(codeOf(() => reorderPlaylist(file, PL, ['a', 'a']))).toBe('invalid_order')
  })

  it('moves one item up or down, clamped at the ends', () => {
    const file = withOne(['a', 'b', 'c'])
    expect(moveInPlaylist(file, PL, 'c', -1).playlists[0]?.projectIds).toEqual(['a', 'c', 'b'])
    expect(moveInPlaylist(file, PL, 'a', 1).playlists[0]?.projectIds).toEqual(['b', 'a', 'c'])
    expect(moveInPlaylist(file, PL, 'a', -1)).toBe(file)
    expect(codeOf(() => moveInPlaylist(file, PL, 'x', 1))).toBe('invalid_order')
  })

  it('deletes a playlist without touching the others', () => {
    let file = withOne(['a'])
    file = createPlaylist(file, { name: 'Other', id: PL2, projectIds: ['a'] }).file
    file = deletePlaylist(file, PL)
    expect(file.playlists.map((p) => p.id)).toEqual([PL2])
    expect(codeOf(() => deletePlaylist(file, PL))).toBe('playlist_not_found')
  })

  it('prunes missing projects from every playlist and lists memberships', () => {
    let file = withOne(['a', 'gone', 'b'])
    file = createPlaylist(file, { name: 'Other', id: PL2, projectIds: ['b'] }).file
    expect(playlistsOf(file, 'b')).toEqual([PL, PL2])
    const pruned = prunePlaylists(file, (id) => id !== 'gone', T1)
    expect(pruned.playlists[0]).toMatchObject({
      projectIds: ['a', 'b'],
      updatedAt: T1.toISOString(),
    })
    expect(pruned.playlists[1]).toBe(file.playlists[1])
    expect(prunePlaylists(pruned, () => true)).toBe(pruned)
  })
})
