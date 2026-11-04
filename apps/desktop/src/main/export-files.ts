// Desktop FileSink, main-process half (F-11). The renderer encodes; this side only writes
// bytes: each export goes to `<name>.partial` in the export folder, positioned writes as
// the muxer sends them, then a rename to the final name on commit. Cancel, failure, a
// closed window or a full disk delete the partial file, so no half video is ever left.
import { mkdir, open, rename, rm, stat, type FileHandle } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { numberedFileName, sanitizeFileName } from '@kamo/core'

export type ExportFileErrorCode =
  | 'disk_full'
  | 'write_failed'
  | 'invalid_file_name'
  | 'export_not_found'
  | 'export_folder_unavailable'

export class ExportFileError extends Error {
  constructor(
    readonly code: ExportFileErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options)
    this.name = 'ExportFileError'
  }
}

export const PARTIAL_SUFFIX = '.partial'
/** Formats the export can produce (F-11 now, GIF in v0.4), and captions next to them (A-06). */
const ALLOWED_EXTENSIONS = ['.mp4', '.gif', '.srt']
/** Plenty for " (2)"… while never looping forever on a broken folder. */
const MAX_NAME_ATTEMPTS = 1000
const DISK_FULL_CODES = new Set(['ENOSPC', 'EDQUOT', 'EFBIG'])

interface OpenFile {
  id: string
  owner: number
  handle: FileHandle
  partialPath: string
  finalName: string
  folder: string
}

export interface ExportFilesLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
}

export interface OpenedExport {
  id: string
  /** final file name after collision handling, e.g. `Demo 16x9 1080p30 (2).mp4` */
  name: string
}

/**
 * Files being exported, keyed by an opaque id the renderer holds. `owner` is the
 * webContents id of the page that opened them, so a closed or reloaded page loses its
 * unfinished files (F-11: closing during export cancels it).
 */
export class ExportFiles {
  private readonly files = new Map<string, OpenFile>()
  /** Final names taken by unfinished exports, so two exports never pick the same one. */
  private readonly reserved = new Set<string>()
  /** Files committed in this session: the only paths "Show in folder" reveals. */
  private readonly committed = new Set<string>()
  private nextId = 1

  /** `folder` is read on every open: the user may change it in Settings or on the Formats screen. */
  constructor(
    private readonly folder: () => string | Promise<string>,
    private readonly log: ExportFilesLogger,
  ) {}

  isExporting(owner?: number): boolean {
    for (const file of this.files.values()) {
      if (owner === undefined || file.owner === owner) return true
    }
    return false
  }

  isCommitted(path: string): boolean {
    return this.committed.has(path)
  }

  /** Creates `<final name>.partial`, picking " (2)", " (3)"… when the name is taken. */
  async open(owner: number, fileName: unknown): Promise<OpenedExport> {
    const name = checkFileName(fileName)
    let folder: string
    try {
      folder = await this.folder()
      await mkdir(folder, { recursive: true })
    } catch (error) {
      throw new ExportFileError('export_folder_unavailable', { cause: error })
    }
    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
      const finalName = numberedFileName(name, n)
      const finalPath = join(folder, finalName)
      const key = finalPath.toLowerCase()
      if (this.reserved.has(key) || (await exists(finalPath))) continue
      const partialPath = finalPath + PARTIAL_SUFFIX
      let handle: FileHandle
      try {
        // 'wx': fails if a leftover .partial is there (another Kamo, a crash): next name.
        handle = await open(partialPath, 'wx')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw mapWriteError(error)
      }
      const id = String(this.nextId++)
      this.files.set(id, { id, owner, handle, partialPath, finalName, folder })
      this.reserved.add(key)
      this.log.info('export.file.open')
      return { id, name: finalName }
    }
    throw new ExportFileError('write_failed')
  }

  async write(id: unknown, position: unknown, data: unknown): Promise<void> {
    const file = this.get(id)
    if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) {
      throw new TypeError('position must be a non-negative integer')
    }
    if (!(data instanceof Uint8Array)) throw new TypeError('data must be bytes')
    try {
      let written = 0
      while (written < data.byteLength) {
        const { bytesWritten } = await file.handle.write(
          data,
          written,
          data.byteLength - written,
          position + written,
        )
        if (bytesWritten === 0) throw Object.assign(new Error('no progress'), { code: 'ENOSPC' })
        written += bytesWritten
      }
    } catch (error) {
      const mapped = mapWriteError(error)
      this.log.warn('export.file.write.failed', { code: mapped.code })
      // Disk full or broken: delete now, the renderer's abort finds nothing left to do.
      await this.discard(file)
      throw mapped
    }
  }

  /** Renames the partial file to its final name and returns the final path. */
  async commit(id: unknown): Promise<string> {
    const file = this.get(id)
    try {
      await file.handle.sync()
      await file.handle.close()
      let finalPath = join(file.folder, file.finalName)
      // Something took the name meanwhile (another app): move on to the next free one.
      for (let n = 2; (await exists(finalPath)) && n <= MAX_NAME_ATTEMPTS; n++) {
        finalPath = join(file.folder, numberedFileName(file.finalName, n))
      }
      await rename(file.partialPath, finalPath)
      this.forget(file)
      this.committed.add(finalPath)
      this.log.info('export.file.done')
      return finalPath
    } catch (error) {
      await this.discard(file)
      throw mapWriteError(error)
    }
  }

  /** Cancel or failure: closes and deletes the partial file. Unknown ids are a no-op. */
  async abort(id: unknown): Promise<void> {
    const file = typeof id === 'string' ? this.files.get(id) : undefined
    if (!file) return
    await this.discard(file)
    this.log.info('export.file.aborted')
  }

  /** The page that owned these exports went away (closed, reloaded, crashed). */
  async abortAll(owner?: number): Promise<void> {
    const mine = [...this.files.values()].filter((f) => owner === undefined || f.owner === owner)
    await Promise.all(mine.map((file) => this.discard(file)))
  }

  private get(id: unknown): OpenFile {
    const file = typeof id === 'string' ? this.files.get(id) : undefined
    if (!file) throw new ExportFileError('export_not_found')
    return file
  }

  private forget(file: OpenFile): void {
    this.files.delete(file.id)
    this.reserved.delete(join(file.folder, file.finalName).toLowerCase())
  }

  private async discard(file: OpenFile): Promise<void> {
    this.forget(file)
    await file.handle.close().catch(() => {})
    await rm(file.partialPath, { force: true }).catch((error: unknown) =>
      this.log.warn('export.file.delete.failed', { error }),
    )
  }
}

/** The renderer sends only a file name: no folders, no traversal, only export formats. */
export function checkFileName(fileName: unknown): string {
  if (typeof fileName !== 'string' || fileName.length === 0 || fileName.length > 200) {
    throw new ExportFileError('invalid_file_name')
  }
  const dot = fileName.lastIndexOf('.')
  const extension = dot > 0 ? fileName.slice(dot).toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.includes(extension)) throw new ExportFileError('invalid_file_name')
  const base = fileName.slice(0, dot)
  if (basename(fileName) !== fileName || sanitizeFileName(base) !== base) {
    throw new ExportFileError('invalid_file_name')
  }
  return fileName
}

function mapWriteError(error: unknown): ExportFileError {
  if (error instanceof ExportFileError) return error
  const code = (error as NodeJS.ErrnoException | null)?.code
  return new ExportFileError(code && DISK_FULL_CODES.has(code) ? 'disk_full' : 'write_failed', {
    cause: error,
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
