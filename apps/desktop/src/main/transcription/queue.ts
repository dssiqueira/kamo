// The transcriptions still to do, in app-data/transcription-queue.json, so a job the app was
// closed in the middle of starts again on the next launch (A-05 edge case).
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { writeFileAtomic } from '../storage/atomic.ts'

const QueueFile = z.object({
  version: z.literal(1),
  projectIds: z.array(z.string().min(1).max(128)),
})

export class PersistentQueue {
  private ids: string[] | null = null
  private writes: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  async list(): Promise<string[]> {
    return [...(await this.load())]
  }

  async add(projectId: string): Promise<void> {
    const ids = await this.load()
    if (ids.includes(projectId)) return
    ids.push(projectId)
    await this.save()
  }

  async remove(projectId: string): Promise<void> {
    const ids = await this.load()
    const index = ids.indexOf(projectId)
    if (index === -1) return
    ids.splice(index, 1)
    await this.save()
  }

  private async load(): Promise<string[]> {
    if (this.ids) return this.ids
    let ids: string[] = []
    try {
      const parsed = QueueFile.safeParse(JSON.parse(await readFile(this.file, 'utf8')))
      if (parsed.success) ids = [...new Set(parsed.data.projectIds)]
    } catch {
      // missing or unreadable: nothing to resume
    }
    this.ids ??= ids
    return this.ids
  }

  private save(): Promise<void> {
    const text = `${JSON.stringify({ version: 1, projectIds: this.ids ?? [] }, null, 2)}\n`
    const write = this.writes.then(() => writeFileAtomic(this.file, text))
    this.writes = write.catch(() => {})
    return write
  }
}
