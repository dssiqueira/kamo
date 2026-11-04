// ProjectStore on the extension's Origin Private File System (docs/integrations.md: Projects →
// OPFS). Runs in extension pages (popup, offscreen, later the editor). Type-only import from
// core, so the popup can use it without loading the engine.
import type { ProjectStore } from '@kamo/core'
import { PROJECTS_DIRECTORY, assertProjectId, isProjectId, splitProjectPath } from './paths.ts'

function isNotFound(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')
  )
}

export class OpfsProjectStore implements ProjectStore {
  private rootPromise: Promise<FileSystemDirectoryHandle> | null = null

  constructor(
    private readonly getRoot: () => Promise<FileSystemDirectoryHandle> = () =>
      navigator.storage.getDirectory(),
  ) {}

  async listProjectIds(): Promise<string[]> {
    const ids: string[] = []
    for await (const [name, handle] of (await this.projects()).entries()) {
      if (handle.kind === 'directory' && isProjectId(name)) ids.push(name)
    }
    return ids.sort()
  }

  async readText(projectId: string, path: string): Promise<string | null> {
    const blob = await this.readBlob(projectId, path)
    return blob ? blob.text() : null
  }

  /** createWritable writes to a swap file and swaps it in on close: atomic, as required. */
  async writeText(projectId: string, path: string, text: string): Promise<void> {
    const file = await this.fileHandle(projectId, path, true)
    const writable = await file.createWritable()
    try {
      await writable.write(text)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => undefined)
      throw error
    }
  }

  async readBlob(projectId: string, path: string): Promise<Blob | null> {
    try {
      return await (await this.fileHandle(projectId, path, false)).getFile()
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async openWritable(projectId: string, path: string): Promise<WritableStream<Uint8Array>> {
    const writable = await (await this.fileHandle(projectId, path, true)).createWritable()
    return new WritableStream<Uint8Array>({
      write: (chunk) => writable.write(chunk as Uint8Array<ArrayBuffer>),
      close: () => writable.close(),
      abort: () => writable.abort(),
    })
  }

  async listFiles(projectId: string, directory: string): Promise<string[]> {
    let folder: FileSystemDirectoryHandle
    try {
      folder = await this.directory(projectId, directory ? directory.split('/') : [], false)
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }
    const names: string[] = []
    for await (const [name, handle] of folder.entries()) {
      if (handle.kind === 'file') names.push(name)
    }
    return names.sort()
  }

  /** The extension has no trash: deleting a project removes it for good (E-03). */
  async deleteProject(projectId: string): Promise<void> {
    assertProjectId(projectId)
    try {
      await (await this.projects()).removeEntry(projectId, { recursive: true })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }

  async removeFile(projectId: string, path: string): Promise<void> {
    const { directories, name } = splitProjectPath(path)
    try {
      await (await this.directory(projectId, directories, false)).removeEntry(name)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }

  /** Bytes in the file, or `null` when it does not exist. */
  async fileSize(projectId: string, path: string): Promise<number | null> {
    return (await this.readBlob(projectId, path))?.size ?? null
  }

  private projects(): Promise<FileSystemDirectoryHandle> {
    this.rootPromise ??= this.getRoot().then((root) =>
      root.getDirectoryHandle(PROJECTS_DIRECTORY, { create: true }),
    )
    return this.rootPromise
  }

  private async directory(
    projectId: string,
    directories: string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    assertProjectId(projectId)
    let folder = await (await this.projects()).getDirectoryHandle(projectId, { create })
    for (const name of directories) folder = await folder.getDirectoryHandle(name, { create })
    return folder
  }

  private async fileHandle(
    projectId: string,
    path: string,
    create: boolean,
  ): Promise<FileSystemFileHandle> {
    const { directories, name } = splitProjectPath(path)
    const folder = await this.directory(projectId, directories, create)
    return folder.getFileHandle(name, { create })
  }
}
