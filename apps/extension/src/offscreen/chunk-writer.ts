// Offscreen side of the chunk writer worker (chunk-writer.worker.ts).

export type WriterRequest =
  | { id: number; op: 'open'; projectId: string; path: string }
  | { id: number; op: 'write'; projectId: string; path: string; data: ArrayBuffer }
  | { id: number; op: 'close'; projectId: string; path: string }

export type WriterReply =
  { id: number; ok: true } | { id: number; ok: false; error: 'quota' | 'failed' }

/** Thrown when a write fails; `quota` means the browser storage is full. */
export class WriteError extends Error {
  constructor(readonly code: 'quota' | 'failed') {
    super(code)
    this.name = 'WriteError'
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export class ChunkWriter {
  private readonly worker = new Worker(new URL('./chunk-writer.worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly pending = new Map<number, { resolve(): void; reject(e: Error): void }>()
  private nextId = 1

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WriterReply>) => {
      const reply = event.data
      const waiter = this.pending.get(reply.id)
      this.pending.delete(reply.id)
      if (reply.ok) waiter?.resolve()
      else waiter?.reject(new WriteError(reply.error))
    }
  }

  open(projectId: string, path: string): Promise<void> {
    return this.send({ op: 'open', projectId, path })
  }

  /** The buffer is transferred to the worker: the caller must not reuse it. */
  write(projectId: string, path: string, data: ArrayBuffer): Promise<void> {
    return this.send({ op: 'write', projectId, path, data }, [data])
  }

  close(projectId: string, path: string): Promise<void> {
    return this.send({ op: 'close', projectId, path })
  }

  terminate(): void {
    this.worker.terminate()
    for (const waiter of this.pending.values()) waiter.reject(new WriteError('failed'))
    this.pending.clear()
  }

  private send(
    request: DistributiveOmit<WriterRequest, 'id'>,
    transfer: Transferable[] = [],
  ): Promise<void> {
    const id = this.nextId++
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...request, id } as WriterRequest, transfer)
    })
  }
}
