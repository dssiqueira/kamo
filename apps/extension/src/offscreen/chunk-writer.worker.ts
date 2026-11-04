// Appends recording chunks to OPFS files (E-01: "saved in chunks, not accumulated").
//
// A dedicated worker because only workers get `createSyncAccessHandle`, which writes in place
// and flushes to disk: if the browser closes mid-recording, every flushed chunk is still in the
// file. `createWritable` would keep everything in a swap file that a crash throws away.
import { PROJECTS_DIRECTORY, assertProjectId, splitProjectPath } from '../storage/paths.ts'
import type { WriterReply, WriterRequest } from './chunk-writer.ts'

/** Not in the DOM lib typings yet (dedicated workers only). */
interface SyncAccessHandle {
  write(buffer: BufferSource, options?: { at?: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

interface OpenFile {
  handle: SyncAccessHandle
  offset: number
}

const files = new Map<string, OpenFile>()

async function open(projectId: string, path: string): Promise<SyncAccessHandle> {
  assertProjectId(projectId)
  const { directories, name } = splitProjectPath(path)
  const root = await navigator.storage.getDirectory()
  let folder = await root.getDirectoryHandle(PROJECTS_DIRECTORY, { create: true })
  folder = await folder.getDirectoryHandle(projectId, { create: true })
  for (const directory of directories) {
    folder = await folder.getDirectoryHandle(directory, { create: true })
  }
  const file = await folder.getFileHandle(name, { create: true })
  const handle = await (
    file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
  ).createSyncAccessHandle()
  handle.truncate(0)
  return handle
}

async function handle(request: WriterRequest): Promise<void> {
  const key = `${request.projectId}/${request.path}`
  switch (request.op) {
    case 'open': {
      if (files.has(key)) throw new Error(`already open: ${key}`)
      files.set(key, { handle: await open(request.projectId, request.path), offset: 0 })
      return
    }
    case 'write': {
      const file = files.get(key)
      if (!file) throw new Error(`not open: ${key}`)
      file.offset += file.handle.write(new Uint8Array(request.data), { at: file.offset })
      file.handle.flush()
      return
    }
    case 'close': {
      const file = files.get(key)
      if (!file) return
      files.delete(key)
      file.handle.flush()
      file.handle.close()
      return
    }
  }
}

// Requests are handled one at a time, in order: chunks must land in the order they arrive.
let queue = Promise.resolve()

self.onmessage = (event: MessageEvent<WriterRequest>) => {
  const request = event.data
  queue = queue.then(async () => {
    let reply: WriterReply
    try {
      await handle(request)
      reply = { id: request.id, ok: true }
    } catch (error) {
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      reply = { id: request.id, ok: false, error: quota ? 'quota' : 'failed' }
    }
    self.postMessage(reply)
  })
}
