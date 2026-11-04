// Local playlists on disk (docs/data-model.md → Playlists): `<projects>/playlists.json`, next
// to the project folders, so a playlist follows the projects folder chosen in Settings (F-15).
// Every change is a read → pure core operation → atomic write, one at a time.
import {
  PLAYLISTS_FILE,
  PlaylistError,
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  emptyPlaylists,
  parsePlaylists,
  prunePlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  serializePlaylists,
  type PlaylistsFile,
} from '@kamo/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlaylistInfo } from '../shared/api.ts'
import { ProjectActionError } from './projects.ts'
import {
  errorCode,
  isValidProjectId,
  renameWithRetry,
  writeFileAtomic,
  type FileProjectStore,
} from './storage/index.ts'

export interface PlaylistLog {
  warn(event: string, data?: Record<string, unknown>): void
}

/** Project ids from the renderer: an array of valid folder names, at most a few thousand. */
function projectIdList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5000) throw new PlaylistError('invalid_order')
  for (const id of value) {
    if (typeof id !== 'string' || !isValidProjectId(id)) {
      throw new ProjectActionError('project_not_found')
    }
  }
  return value as string[]
}

/** What Home sees: playlists with only the projects whose folder is there (gaps hidden). */
export function toInfo(file: PlaylistsFile, existing: ReadonlySet<string>): PlaylistInfo[] {
  return file.playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    projectIds: playlist.projectIds.filter((id) => existing.has(id)),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  }))
}

export class PlaylistStore {
  // Changes run one after another, so two quick clicks never write over each other.
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    /** Read on every call: the projects folder can change in Settings. */
    private readonly store: () => FileProjectStore,
    private readonly log: PlaylistLog = { warn: () => {} },
  ) {}

  private get file(): string {
    return join(this.store().root, PLAYLISTS_FILE)
  }

  /**
   * The file on disk. Missing: no playlists yet. Unreadable: it is set aside as
   * `playlists.broken-<time>.json` (never lost) and the user starts over. A file from a newer
   * Kamo is left alone and every change is refused (`newer_version`).
   */
  private async read(): Promise<PlaylistsFile> {
    const path = this.file
    let json: string
    try {
      json = await readFile(path, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return emptyPlaylists()
      throw error
    }
    try {
      const { file, dropped } = parsePlaylists(json)
      if (dropped > 0) this.log.warn('playlists.entries_dropped', { count: dropped })
      return file
    } catch (error) {
      if (!(error instanceof PlaylistError) || error.code === 'newer_version') throw error
      const aside = join(
        this.store().root,
        `playlists.broken-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      )
      await renameWithRetry(path, aside)
      this.log.warn('playlists.unreadable', { code: error.code })
      return emptyPlaylists()
    }
  }

  private async existingIds(): Promise<Set<string>> {
    return new Set(await this.store().listProjectIds())
  }

  async list(): Promise<PlaylistInfo[]> {
    await this.queue.catch(() => {})
    let file: PlaylistsFile
    try {
      file = await this.read()
    } catch (error) {
      // A newer Kamo's file: Home shows no playlists rather than failing (changes are refused).
      if (error instanceof PlaylistError && error.code === 'newer_version') return []
      throw error
    }
    return toInfo(file, await this.existingIds())
  }

  /**
   * Runs one change. Projects whose folder is gone (deleted or moved from outside) are
   * cleaned out of every playlist on the way, so the file never keeps gaps for long.
   */
  private mutate<T>(
    change: (file: PlaylistsFile, existing: Set<string>) => { file: PlaylistsFile; result: T },
  ): Promise<{ result: T; playlists: PlaylistInfo[] }> {
    const run = async () => {
      const before = await this.read()
      const existing = await this.existingIds()
      const changed = change(before, existing)
      const after = prunePlaylists(changed.file, (id) => existing.has(id))
      if (after !== before) await writeFileAtomic(this.file, serializePlaylists(after))
      return { result: changed.result, playlists: toInfo(after, existing) }
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }

  private static requireExisting(ids: string[], existing: Set<string>): void {
    if (ids.some((id) => !existing.has(id))) throw new ProjectActionError('project_not_found')
  }

  async create(name: unknown, projectIds: unknown = []): Promise<PlaylistInfo> {
    const ids = projectIdList(projectIds)
    const { result, playlists } = await this.mutate((file, existing) => {
      PlaylistStore.requireExisting(ids, existing)
      const created = createPlaylist(file, { name, projectIds: ids })
      return { file: created.file, result: created.playlist.id }
    })
    return playlists.find((p) => p.id === result) as PlaylistInfo
  }

  async rename(playlistId: unknown, name: unknown): Promise<void> {
    await this.mutate((file) => ({ file: renamePlaylist(file, playlistId, name), result: null }))
  }

  async delete(playlistId: unknown): Promise<void> {
    await this.mutate((file) => ({ file: deletePlaylist(file, playlistId), result: null }))
  }

  async add(playlistId: unknown, projectIds: unknown): Promise<void> {
    const ids = projectIdList(projectIds)
    await this.mutate((file, existing) => {
      PlaylistStore.requireExisting(ids, existing)
      return { file: addToPlaylist(file, playlistId, ids), result: null }
    })
  }

  async remove(playlistId: unknown, projectIds: unknown): Promise<void> {
    const ids = projectIdList(projectIds)
    await this.mutate((file) => ({ file: removeFromPlaylist(file, playlistId, ids), result: null }))
  }

  /** `order`: the playlist's projects as Home shows them, in the new order. */
  async reorder(playlistId: unknown, order: unknown): Promise<void> {
    const ids = projectIdList(order)
    await this.mutate((file) => ({ file: reorderPlaylist(file, playlistId, ids), result: null }))
  }

  /**
   * A project was deleted: it leaves every playlist. Never throws (the delete itself already
   * happened); returns whether any playlist changed.
   */
  async forgetProject(projectId: string): Promise<boolean> {
    try {
      const { result } = await this.mutate((file) => {
        const next = prunePlaylists(file, (id) => id !== projectId)
        return { file: next, result: next !== file }
      })
      return result
    } catch (error) {
      this.log.warn('playlists.forget_failed', { error })
      return false
    }
  }
}
