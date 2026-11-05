// FileSink of the extension (E-04): the export is written to a scratch file in OPFS with the
// muxer's positioned writes, then handed to chrome.downloads, which puts it in the downloads
// folder (Chrome adds " (1)" on a name clash). The scratch file stays until the download is
// complete, so a download the browser blocked can be tried again without exporting again.
import { ExportError, type FileSink, type SinkChunk, type SinkFile } from '@kamo/core'

const EXPORTS_DIRECTORY = 'exports'
/** Scratch files older than this are leftovers of a closed editor. */
const STALE_MS = 6 * 60 * 60 * 1000

export interface FinishedDownload {
  /** chrome.downloads id */
  id: number
  /** The name the export asked for. */
  name: string
  /** Asks Chrome again for the same file. */
  retry(): Promise<void>
}

export interface DownloadsSinkOptions {
  /** The browser didn't save the file (policy, blocked, disk): the editor offers to retry. */
  onBlocked(download: FinishedDownload): void
}

async function exportsFolder(): Promise<FileSystemDirectoryHandle> {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(EXPORTS_DIRECTORY, {
    create: true,
  })
}

function isQuota(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}

/** Deletes scratch exports a closed editor left behind (never one still in use). */
export async function removeStaleExports(now = Date.now()): Promise<void> {
  const folder = await exportsFolder()
  for await (const [name, handle] of folder.entries()) {
    if (handle.kind !== 'file') continue
    const file = await (handle as FileSystemFileHandle).getFile()
    if (now - file.lastModified > STALE_MS) await folder.removeEntry(name).catch(() => undefined)
  }
}

/** Waits for the download to end; true when the file is on disk. */
function whenDownloaded(id: number): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (ok: boolean) => {
      chrome.downloads.onChanged.removeListener(onChanged)
      resolve(ok)
    }
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id || !delta.state) return
      if (delta.state.current === 'complete') settle(true)
      else if (delta.state.current === 'interrupted') settle(false)
    }
    chrome.downloads.onChanged.addListener(onChanged)
    // It may have ended before the listener was in place.
    void chrome.downloads.search({ id }).then(([item]) => {
      if (item?.state === 'complete') settle(true)
      else if (item?.state === 'interrupted') settle(false)
    })
  })
}

export function downloadsSink(options: DownloadsSinkOptions): FileSink {
  return {
    async open(fileName, mimeType): Promise<SinkFile> {
      const folder = await exportsFolder()
      const scratch = `${crypto.randomUUID()}.partial`
      const handle = await folder.getFileHandle(scratch, { create: true })
      let writable: FileSystemWritableFileStream
      try {
        writable = await handle.createWritable()
      } catch (error) {
        throw new ExportError(isQuota(error) ? 'disk_full' : 'write_failed', { cause: error })
      }
      const remove = () => folder.removeEntry(scratch).catch(() => undefined)
      return {
        name: fileName,
        stream: new WritableStream<SinkChunk>({
          async write(chunk) {
            try {
              await writable.write({
                type: 'write',
                position: chunk.position,
                data: chunk.data as Uint8Array<ArrayBuffer>,
              })
            } catch (error) {
              throw new ExportError(isQuota(error) ? 'disk_full' : 'write_failed', {
                cause: error,
              })
            }
          },
        }),
        async commit() {
          try {
            await writable.close()
          } catch (error) {
            await remove()
            throw new ExportError(isQuota(error) ? 'disk_full' : 'write_failed', { cause: error })
          }
          const file = await handle.getFile()
          const url = URL.createObjectURL(new Blob([file], { type: mimeType }))
          const start = () =>
            chrome.downloads.download({ url, filename: fileName, conflictAction: 'uniquify' })
          let id: number
          try {
            id = await start()
          } catch (error) {
            URL.revokeObjectURL(url)
            await remove()
            throw new ExportError('write_failed', { cause: error })
          }
          const follow = (downloadId: number): void => {
            void whenDownloaded(downloadId).then(async (ok) => {
              if (ok) {
                URL.revokeObjectURL(url)
                await remove()
                return
              }
              options.onBlocked({
                id: downloadId,
                name: fileName,
                retry: async () => follow(await start()),
              })
            })
          }
          follow(id)
          return String(id)
        },
        async abort() {
          await writable.abort().catch(() => undefined)
          await remove()
        },
      }
    },
  }
}
