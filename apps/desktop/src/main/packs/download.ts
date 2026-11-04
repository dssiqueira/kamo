// One pack file, downloaded with resume (HTTP Range) and checked against its SHA-256 (A-07).
// The network call is injected: Electron's `net.fetch` in the app, Node's fetch in tests.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export type FetchLike = (
  url: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>

export type DownloadErrorCode = 'offline' | 'download_failed' | 'checksum_mismatch'

export class DownloadError extends Error {
  constructor(
    readonly code: DownloadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'DownloadError'
  }
}

export interface DownloadFileOptions {
  url: string
  dest: string
  size: number
  sha256: string
  fetch: FetchLike
  signal?: AbortSignal
  /** Called with each new chunk's length (and once with what was already on disk). */
  onBytes(bytes: number): void
}

/** Bytes of `dest` already on disk (a paused or interrupted download); 0 when missing. */
export async function partialSize(dest: string): Promise<number> {
  try {
    return (await stat(dest)).size
  } catch {
    return 0
  }
}

/**
 * Downloads `url` into `dest`, continuing a partial file when the server supports ranges.
 * The file is verified before it counts: a wrong size or hash deletes it. An abort keeps the
 * partial file (pause); network errors keep it too, so "Try again" resumes.
 */
export async function downloadFile(options: DownloadFileOptions): Promise<void> {
  const { url, dest, size, signal } = options
  await mkdir(dirname(dest), { recursive: true })
  let have = await partialSize(dest)
  if (have > size) {
    await rm(dest, { force: true })
    have = 0
  }
  options.onBytes(have)
  if (have < size) {
    let response = await request(options, have)
    if (response.status === 416) {
      // The server says our range is wrong: start over.
      await response.body?.cancel().catch(() => {})
      await rm(dest, { force: true })
      options.onBytes(-have)
      have = 0
      response = await request(options, 0)
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {})
      throw new DownloadError('download_failed', `HTTP ${response.status} for ${url}`)
    }
    // 200 to a range request: the server sent the whole file again.
    const append = have > 0 && response.status === 206
    if (!append && have > 0) {
      options.onBytes(-have)
      have = 0
    }
    const file = await open(dest, append ? 'a' : 'w')
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        signal?.throwIfAborted()
        have += chunk.byteLength
        if (have > size) throw new DownloadError('download_failed', `${url} is larger than listed`)
        await file.write(chunk)
        options.onBytes(chunk.byteLength)
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (error instanceof DownloadError) {
        await file.close()
        await rm(dest, { force: true })
        throw error
      }
      throw new DownloadError('offline', `connection lost on ${url}`, { cause: error })
    } finally {
      await file.close().catch(() => {})
    }
  }
  if ((await partialSize(dest)) !== size) {
    throw new DownloadError('offline', `${url} ended early`)
  }
  if ((await sha256File(dest)) !== options.sha256) {
    await rm(dest, { force: true })
    throw new DownloadError('checksum_mismatch', `${url} failed its SHA-256 check`)
  }
}

async function request(options: DownloadFileOptions, from: number): Promise<Response> {
  try {
    return await options.fetch(options.url, {
      ...(from > 0 ? { headers: { Range: `bytes=${from}-` } } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason
    throw new DownloadError('offline', `could not reach ${options.url}`, { cause: error })
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
