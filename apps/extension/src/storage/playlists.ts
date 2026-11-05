// Local playlists in the extension (D-028): the same `playlists.json` as the desktop, next to the
// project folders in OPFS (`projects/playlists.json`), changed only through the core operations.
// Writes go through createWritable (a swap file, atomic on close). Changes are serialized here so
// two quick edits never read the same old file.
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
  type Playlist,
  type PlaylistsFile,
} from '@kamo/core'
import { PROJECTS_DIRECTORY } from './paths.ts'

/** Reads and writes `playlists.json`; a test passes an in-memory pair. */
export interface PlaylistFileIo {
  read(): Promise<string | null>
  write(text: string): Promise<void>
}

export function opfsPlaylistIo(
  getRoot: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory(),
): PlaylistFileIo {
  const folder = async () =>
    (await getRoot()).getDirectoryHandle(PROJECTS_DIRECTORY, { create: true })
  return {
    async read() {
      try {
        return await (
          await (await folder()).getFileHandle(PLAYLISTS_FILE)
        )
          .getFile()
          .then((f) => f.text())
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return null
        throw error
      }
    },
    async write(text) {
      const handle = await (await folder()).getFileHandle(PLAYLISTS_FILE, { create: true })
      const writable = await handle.createWritable()
      try {
        await writable.write(text)
        await writable.close()
      } catch (error) {
        await writable.abort().catch(() => undefined)
        throw error
      }
    },
  }
}

export class PlaylistStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly io: PlaylistFileIo) {}

  /** Playlists in creation order. An unreadable file reads as none (the next write replaces it). */
  async list(): Promise<Playlist[]> {
    try {
      return (await this.load()).playlists
    } catch {
      return []
    }
  }

  create(name: string, projectIds: readonly string[]): Promise<Playlist> {
    return this.change((file) => {
      const created = createPlaylist(file, { name, projectIds })
      return { file: created.file, result: created.playlist }
    })
  }

  rename(id: string, name: string): Promise<void> {
    return this.change((file) => ({ file: renamePlaylist(file, id, name), result: undefined }))
  }

  delete(id: string): Promise<void> {
    return this.change((file) => ({ file: deletePlaylist(file, id), result: undefined }))
  }

  add(id: string, projectIds: readonly string[]): Promise<void> {
    return this.change((file) => ({ file: addToPlaylist(file, id, projectIds), result: undefined }))
  }

  remove(id: string, projectIds: readonly string[]): Promise<void> {
    return this.change((file) => ({
      file: removeFromPlaylist(file, id, projectIds),
      result: undefined,
    }))
  }

  reorder(id: string, projectIds: readonly string[]): Promise<void> {
    return this.change((file) => ({
      file: reorderPlaylist(file, id, projectIds),
      result: undefined,
    }))
  }

  /** Keeps only the projects that still exist (a deleted project leaves every playlist). */
  keepOnly(existing: ReadonlySet<string>): Promise<void> {
    return this.change((file) => ({
      file: prunePlaylists(file, (id) => existing.has(id)),
      result: undefined,
    }))
  }

  /**
   * The file as it is. A damaged one reads as empty (the next change starts over, like the
   * desktop); one from a newer Kamo is never overwritten: changes fail with `newer_version`.
   */
  private async load(): Promise<PlaylistsFile> {
    const text = await this.io.read()
    if (text === null) return emptyPlaylists()
    try {
      return parsePlaylists(text).file
    } catch (error) {
      if (error instanceof PlaylistError && error.code === 'newer_version') throw error
      return emptyPlaylists()
    }
  }

  private change<T>(edit: (file: PlaylistsFile) => { file: PlaylistsFile; result: T }): Promise<T> {
    const run = this.queue.then(async () => {
      const before = await this.load()
      const { file, result } = edit(before)
      if (file !== before) await this.io.write(serializePlaylists(file))
      return result
    })
    this.queue = run.catch(() => undefined)
    return run
  }
}
