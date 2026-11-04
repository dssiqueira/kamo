// Local playlists (docs/data-model.md → Playlists): one `playlists.json` at the root of the
// projects folder, next to the project folders. A playlist is an ordered list of project ids,
// so a project can be in several playlists and the order lives in the playlist, not in the
// project. Pure functions only: each app reads and writes the file its own way (rule 1).
import { z } from 'zod'

/** File name at the root of the projects folder (`~/Kamo/projects/playlists.json`). */
export const PLAYLISTS_FILE = 'playlists.json'
export const PLAYLISTS_VERSION = 1
/** Same limit as project names (F-12). */
export const MAX_PLAYLIST_NAME_LENGTH = 120
/** Generous caps, so a hand-edited or hostile file can never grow without bound. */
export const MAX_PLAYLISTS = 500
export const MAX_PLAYLIST_ITEMS = 2000

const isoDate = z.iso.datetime()

/**
 * Loose objects: fields a newer app adds (for example the id of the cloud playlist it syncs
 * with) survive a round trip through an older app instead of being dropped on the next write.
 */
export const Playlist = z.looseObject({
  id: z.uuid(),
  name: z.string().min(1).max(MAX_PLAYLIST_NAME_LENGTH),
  /** Project ids in playlist order. A project appears at most once. */
  projectIds: z.array(z.string().min(1)).max(MAX_PLAYLIST_ITEMS),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Playlist = z.infer<typeof Playlist>

export const PlaylistsFile = z.looseObject({
  version: z.literal(PLAYLISTS_VERSION),
  /** In creation order (the order Home shows them in). */
  playlists: z.array(Playlist).max(MAX_PLAYLISTS),
})
export type PlaylistsFile = z.infer<typeof PlaylistsFile>

export type PlaylistErrorCode =
  | 'invalid_json'
  | 'invalid_playlists'
  | 'newer_version'
  | 'invalid_name'
  | 'playlist_not_found'
  | 'too_many_playlists'
  | 'playlist_full'
  | 'invalid_order'

/** Error with a stable code; the UI translates it through packages/i18n. */
export class PlaylistError extends Error {
  constructor(
    readonly code: PlaylistErrorCode,
    message: string = code,
  ) {
    super(message)
    this.name = 'PlaylistError'
  }
}

export function emptyPlaylists(): PlaylistsFile {
  return { version: PLAYLISTS_VERSION, playlists: [] }
}

export interface ParsedPlaylists {
  file: PlaylistsFile
  /** Entries that were dropped because they were invalid or duplicated (for the log). */
  dropped: number
}

/**
 * Reads `playlists.json`. The file as a whole must be JSON with a known version; inside it,
 * each playlist is checked on its own, so one bad entry (hand edit, partial sync) does not
 * take the others down. Duplicate playlist ids and repeated project ids are dropped.
 */
export function parsePlaylists(json: string): ParsedPlaylists {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new PlaylistError('invalid_json', 'playlists.json is not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PlaylistError('invalid_playlists', 'playlists.json is not an object')
  }
  const record = raw as Record<string, unknown>
  const version = record['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new PlaylistError('invalid_playlists', 'playlists.json has no valid version')
  }
  if (version > PLAYLISTS_VERSION) {
    throw new PlaylistError(
      'newer_version',
      `playlists version ${version} is newer than ${PLAYLISTS_VERSION}`,
    )
  }
  const list = record['playlists']
  if (!Array.isArray(list)) {
    throw new PlaylistError('invalid_playlists', 'playlists.json has no playlists array')
  }
  let dropped = 0
  const seen = new Set<string>()
  const playlists: Playlist[] = []
  for (const entry of list) {
    const parsed = Playlist.safeParse(entry)
    if (!parsed.success || seen.has(parsed.data.id) || playlists.length >= MAX_PLAYLISTS) {
      dropped++
      continue
    }
    seen.add(parsed.data.id)
    const projectIds = unique(parsed.data.projectIds)
    dropped += parsed.data.projectIds.length - projectIds.length
    playlists.push({ ...parsed.data, projectIds })
  }
  return { file: { ...record, version: PLAYLISTS_VERSION, playlists }, dropped }
}

export function serializePlaylists(file: PlaylistsFile): string {
  return `${JSON.stringify(PlaylistsFile.parse(file), null, 2)}\n`
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/** Trimmed, one line, 1–120 characters (same rules as project names). */
export function validatePlaylistName(name: unknown): string {
  if (typeof name !== 'string') throw new PlaylistError('invalid_name')
  // eslint-disable-next-line no-control-regex
  const trimmed = name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  if (trimmed === '' || [...trimmed].length > MAX_PLAYLIST_NAME_LENGTH) {
    throw new PlaylistError('invalid_name')
  }
  return trimmed
}

function findIndex(file: PlaylistsFile, playlistId: unknown): number {
  const index =
    typeof playlistId === 'string' ? file.playlists.findIndex((p) => p.id === playlistId) : -1
  if (index < 0) throw new PlaylistError('playlist_not_found')
  return index
}

function replaceAt(file: PlaylistsFile, index: number, playlist: Playlist): PlaylistsFile {
  const playlists = file.playlists.slice()
  playlists[index] = playlist
  return { ...file, playlists }
}

function stamp(now: Date): string {
  return now.toISOString()
}

export interface NewPlaylist {
  name: unknown
  /** Projects to start with, in order (the "New playlist" entry of a card's menu). */
  projectIds?: readonly string[]
  id?: string
  now?: Date
}

export function createPlaylist(
  file: PlaylistsFile,
  input: NewPlaylist,
): { file: PlaylistsFile; playlist: Playlist } {
  if (file.playlists.length >= MAX_PLAYLISTS) throw new PlaylistError('too_many_playlists')
  const projectIds = unique(input.projectIds ?? [])
  if (projectIds.length > MAX_PLAYLIST_ITEMS) throw new PlaylistError('playlist_full')
  const at = stamp(input.now ?? new Date())
  const playlist = Playlist.parse({
    id: input.id ?? crypto.randomUUID(),
    name: validatePlaylistName(input.name),
    projectIds,
    createdAt: at,
    updatedAt: at,
  })
  return { file: { ...file, playlists: [...file.playlists, playlist] }, playlist }
}

export function renamePlaylist(
  file: PlaylistsFile,
  playlistId: unknown,
  name: unknown,
  now = new Date(),
): PlaylistsFile {
  const index = findIndex(file, playlistId)
  const current = file.playlists[index] as Playlist
  const trimmed = validatePlaylistName(name)
  if (trimmed === current.name) return file
  return replaceAt(file, index, { ...current, name: trimmed, updatedAt: stamp(now) })
}

/** Deletes the playlist only; the recordings in it stay where they are. */
export function deletePlaylist(file: PlaylistsFile, playlistId: unknown): PlaylistsFile {
  const index = findIndex(file, playlistId)
  return { ...file, playlists: file.playlists.filter((_, i) => i !== index) }
}

/** Appends the projects that are not in the playlist yet, keeping the given order. */
export function addToPlaylist(
  file: PlaylistsFile,
  playlistId: unknown,
  projectIds: readonly string[],
  now = new Date(),
): PlaylistsFile {
  const index = findIndex(file, playlistId)
  const current = file.playlists[index] as Playlist
  const present = new Set(current.projectIds)
  const added = unique(projectIds).filter((id) => !present.has(id))
  if (added.length === 0) return file
  if (current.projectIds.length + added.length > MAX_PLAYLIST_ITEMS) {
    throw new PlaylistError('playlist_full')
  }
  return replaceAt(file, index, {
    ...current,
    projectIds: [...current.projectIds, ...added],
    updatedAt: stamp(now),
  })
}

export function removeFromPlaylist(
  file: PlaylistsFile,
  playlistId: unknown,
  projectIds: readonly string[],
  now = new Date(),
): PlaylistsFile {
  const index = findIndex(file, playlistId)
  const current = file.playlists[index] as Playlist
  const removed = new Set(projectIds)
  const kept = current.projectIds.filter((id) => !removed.has(id))
  if (kept.length === current.projectIds.length) return file
  return replaceAt(file, index, { ...current, projectIds: kept, updatedAt: stamp(now) })
}

/**
 * New order for a playlist. `order` lists the projects the caller sees; ids it does not
 * mention (a gap the caller hid, a project added from another window) keep their relative
 * place after the reordered ones. Ids that are not in the playlist are rejected, so a
 * reorder can never add anything.
 */
export function reorderPlaylist(
  file: PlaylistsFile,
  playlistId: unknown,
  order: readonly string[],
  now = new Date(),
): PlaylistsFile {
  const index = findIndex(file, playlistId)
  const current = file.playlists[index] as Playlist
  const present = new Set(current.projectIds)
  const ordered = unique(order)
  if (ordered.length !== order.length || ordered.some((id) => !present.has(id))) {
    throw new PlaylistError('invalid_order')
  }
  const mentioned = new Set(ordered)
  const projectIds = [...ordered, ...current.projectIds.filter((id) => !mentioned.has(id))]
  if (projectIds.every((id, i) => id === current.projectIds[i])) return file
  return replaceAt(file, index, { ...current, projectIds, updatedAt: stamp(now) })
}

/** Moves one item up (-1) or down (+1); the keyboard alternative to dragging. */
export function moveInPlaylist(
  file: PlaylistsFile,
  playlistId: unknown,
  projectId: string,
  delta: number,
  now = new Date(),
): PlaylistsFile {
  const current = file.playlists[findIndex(file, playlistId)] as Playlist
  const from = current.projectIds.indexOf(projectId)
  if (from < 0) throw new PlaylistError('invalid_order')
  const to = Math.max(0, Math.min(current.projectIds.length - 1, from + Math.trunc(delta)))
  if (to === from) return file
  const order = current.projectIds.slice()
  order.splice(from, 1)
  order.splice(to, 0, projectId)
  return reorderPlaylist(file, playlistId, order, now)
}

/**
 * Keeps only the ids `keep` accepts, in every playlist: a deleted project leaves all of them,
 * and a folder that disappeared from outside is cleaned on the next write. Playlists that
 * did not change keep their `updatedAt`.
 */
export function prunePlaylists(
  file: PlaylistsFile,
  keep: (projectId: string) => boolean,
  now = new Date(),
): PlaylistsFile {
  let changed = false
  const playlists = file.playlists.map((playlist) => {
    const projectIds = playlist.projectIds.filter(keep)
    if (projectIds.length === playlist.projectIds.length) return playlist
    changed = true
    return { ...playlist, projectIds, updatedAt: stamp(now) }
  })
  return changed ? { ...file, playlists } : file
}

/** The ids of the playlists that contain this project (the card's checklist). */
export function playlistsOf(file: PlaylistsFile, projectId: string): string[] {
  return file.playlists.filter((p) => p.projectIds.includes(projectId)).map((p) => p.id)
}
