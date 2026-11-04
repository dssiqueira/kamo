import type { ProjectStore } from './store.ts'

/** In-memory ProjectStore for tests and previews. Same contract as the real stores. */
export class MemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Map<string, Blob>>()

  async listProjectIds(): Promise<string[]> {
    return [...this.projects.keys()]
  }

  async readText(projectId: string, path: string): Promise<string | null> {
    const blob = await this.readBlob(projectId, path)
    return blob ? blob.text() : null
  }

  async writeText(projectId: string, path: string, text: string): Promise<void> {
    this.files(projectId).set(path, new Blob([text]))
  }

  async readBlob(projectId: string, path: string): Promise<Blob | null> {
    return this.projects.get(projectId)?.get(path) ?? null
  }

  async openWritable(projectId: string, path: string): Promise<WritableStream<Uint8Array>> {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    return new WritableStream({
      write: (chunk) => {
        chunks.push(new Uint8Array(chunk))
      },
      close: () => {
        this.files(projectId).set(path, new Blob(chunks))
      },
    })
  }

  async listFiles(projectId: string, directory: string): Promise<string[]> {
    const prefix = directory ? `${directory.replace(/\/$/, '')}/` : ''
    return [...(this.projects.get(projectId)?.keys() ?? [])]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map((path) => path.slice(prefix.length))
      .sort()
  }

  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId)
  }

  private files(projectId: string): Map<string, Blob> {
    let files = this.projects.get(projectId)
    if (!files) this.projects.set(projectId, (files = new Map()))
    return files
  }
}
