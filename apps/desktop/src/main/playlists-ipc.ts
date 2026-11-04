// Local playlists IPC: Home lists and changes them; every window hears `playlistsChanged`.
import { BrowserWindow } from 'electron'
import { IpcChannel } from '../shared/api.ts'
import { PlaylistStore } from './playlists.ts'
import { getServices } from './services.ts'

type Handle = (channel: string, listener: (...args: unknown[]) => unknown) => void

/** Home refreshes its playlist chips and the filtered list. */
export function notifyPlaylistsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.playlistsChanged)
  }
}

export function registerPlaylists(handle: Handle): PlaylistStore {
  // Services exist only after `ready`, so the store and the log are read on use.
  const playlists = new PlaylistStore(() => getServices().store, {
    warn: (event, data) => getServices().log.warn(event, data),
  })
  const changing =
    <A extends unknown[]>(run: (...args: A) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const result = await run(...(args as A))
      notifyPlaylistsChanged()
      return result
    }

  handle(IpcChannel.listPlaylists, () => playlists.list())
  handle(
    IpcChannel.createPlaylist,
    changing((name: unknown, projectIds: unknown) => playlists.create(name, projectIds)),
  )
  handle(
    IpcChannel.renamePlaylist,
    changing((id: unknown, name: unknown) => playlists.rename(id, name)),
  )
  handle(
    IpcChannel.deletePlaylist,
    changing((id: unknown) => playlists.delete(id)),
  )
  handle(
    IpcChannel.addToPlaylist,
    changing((id: unknown, projectIds: unknown) => playlists.add(id, projectIds)),
  )
  handle(
    IpcChannel.removeFromPlaylist,
    changing((id: unknown, projectIds: unknown) => playlists.remove(id, projectIds)),
  )
  handle(
    IpcChannel.reorderPlaylist,
    changing((id: unknown, order: unknown) => playlists.reorder(id, order)),
  )
  return playlists
}
