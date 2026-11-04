// On-disk ProjectStore for the desktop (docs/data-model.md): one folder per project under
// ~/Kamo/projects/<id>/. Same contract as MemoryProjectStore in @kamo/core.
import type { ProjectStore } from '@kamo/core'
import { openAsBlob } from 'node:fs'
import { mkdir, open, readFile, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { errorCode, renameWithRetry, syncDirectory, writeFileAtomic } from './atomic.ts'
import { assertProjectId, isValidProjectId, resolveInProject } from './paths.ts'

/** Suffix of a file being streamed by openWritable; renamed away on close. */
export const PARTIAL_SUFFIX = '.partial'

// Temp files of atomic writes: `.<name>.<uuid>.tmp`, next to the target.
const TEMP_FILE = /^\..+\.[0-9a-f-]{36}\.tmp$/

/** Files that are still being written and are not part of the project yet. */
export function isInProgressFile(name: string): boolean {
  return name.endsWith(PARTIAL_SUFFIX) || TEMP_FILE.test(name)
}

/** `~/Kamo/projects`; the user can change it in Settings later (F-15). */
export function defaultProjectsDir(): string {
  return join(homedir(), 'Kamo', 'projects')
}

export type TrashFn = (path: string) => Promise<void>

export interface FileProjectStoreOptions {
  /** Moves a folder to the system trash. Main passes Electron's `shell.trashItem`. */
  trash?: TrashFn
}

/** Tests and headless use: no trash available, so the folder is deleted. */
const deleteForever: TrashFn = (path) => rm(path, { recursive: true, force: true })

function isMissing(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export class FileProjectStore implements ProjectStore {
  readonly root: string
  private readonly trash: TrashFn

  constructor(root: string, options: FileProjectStoreOptions = {}) {
    this.root = resolve(root)
    this.trash = options.trash ?? deleteForever
  }

  /** Absolute folder of a project, e.g. for "Show in folder" (F-12). */
  projectDir(projectId: string): string {
    return resolveInProject(this.root, projectId, '', true)
  }

  async listProjectIds(): Promise<string[]> {
    let entries
    try {
      entries = await readdir(this.root, { withFileTypes: true })
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    return entries
      .filter((entry) => entry.isDirectory() && isValidProjectId(entry.name))
      .map((entry) => entry.name)
      .sort()
  }

  async readText(projectId: string, path: string): Promise<string | null> {
    const file = resolveInProject(this.root, projectId, path)
    try {
      return await readFile(file, 'utf8')
    } catch (error) {
      if (isMissing(error) || errorCode(error) === 'EISDIR') return null
      throw error
    }
  }

  /**
   * Atomic replace: write a temp file in the same folder, fsync it, then rename it over the
   * target. Rename within a folder is atomic on NTFS, APFS and ext4, so readers see either
   * the old file or the new one, never half of it.
   */
  async writeText(projectId: string, path: string, text: string): Promise<void> {
    await writeFileAtomic(resolveInProject(this.root, projectId, path), text)
  }

  async readBlob(projectId: string, path: string): Promise<Blob | null> {
    const file = resolveInProject(this.root, projectId, path)
    try {
      if (!(await stat(file)).isFile()) return null
      // Lazy, file-backed Blob: a 30-minute recording is not read into memory.
      return await openAsBlob(file)
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  /**
   * Streams to `<path>.partial` with backpressure (each chunk is written before the next is
   * accepted), so long recordings never pile up in memory. `close()` fsyncs and renames to
   * the final name; `abort()` deletes the partial. A crash leaves the `.partial` behind,
   * which is how an interrupted recording is found on the next launch (F-02).
   */
  async openWritable(projectId: string, path: string): Promise<WritableStream<Uint8Array>> {
    const file = resolveInProject(this.root, projectId, path)
    const partial = file + PARTIAL_SUFFIX
    await mkdir(dirname(file), { recursive: true })
    const handle = await open(partial, 'w')
    let closed = false
    const closeHandle = async () => {
      if (closed) return
      closed = true
      await handle.close()
    }
    return new WritableStream<Uint8Array>({
      async write(chunk) {
        let offset = 0
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset)
          offset += bytesWritten
        }
      },
      async close() {
        await handle.sync()
        await closeHandle()
        await renameWithRetry(partial, file)
        await syncDirectory(dirname(file))
      },
      async abort() {
        await closeHandle().catch(() => {})
        await rm(partial, { force: true })
      },
    })
  }

  async listFiles(projectId: string, directory: string): Promise<string[]> {
    const dir = resolveInProject(this.root, projectId, directory, true)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    return entries
      .filter((entry) => entry.isFile() && !isInProgressFile(entry.name))
      .map((entry) => entry.name)
      .sort()
  }

  /** Every `.partial` left in the project (relative paths), for crash recovery. */
  async listPartialFiles(projectId: string): Promise<string[]> {
    const found: string[] = []
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch (error) {
        if (isMissing(error)) return
        throw error
      }
      for (const entry of entries) {
        if (entry.isDirectory()) await walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        else if (entry.isFile() && entry.name.endsWith(PARTIAL_SUFFIX)) {
          found.push(prefix + entry.name)
        }
      }
    }
    await walk(this.projectDir(projectId), '')
    return found.sort()
  }

  /** Removes one file (e.g. the recording marker). Missing files are fine. */
  async removeFile(projectId: string, path: string): Promise<void> {
    await rm(resolveInProject(this.root, projectId, path), { force: true })
  }

  /** Moves the folder to the system trash (F-12). A folder already gone is not an error. */
  async deleteProject(projectId: string): Promise<void> {
    assertProjectId(projectId)
    const dir = this.projectDir(projectId)
    try {
      await stat(dir)
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
    await this.trash(dir)
  }
}
