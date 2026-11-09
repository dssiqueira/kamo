// One model file, downloaded with resume (HTTP Range) and checked against its pinned SHA-256
// (A-07, D-042). The network call is injected: Electron's `net.fetch` in the app, Node's fetch
// in tests. Redirects are followed (Hugging Face sends the file from its CDN); the request
// carries nothing but the URL and, when resuming, a Range header.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export type FetchLike = (
  url: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>

export type DownloadErrorCode =
  /** No answer: the request failed to connect, or no byte arrived for `stallMs`. */
  | 'unreachable'
  /** An HTTP error, an insecure redirect, or a body that does not fit the pinned file. */
  | 'download_failed'
  | 'checksum_mismatch'
  /** The disk filled up while writing. */
  | 'disk_space'

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

/** No byte for this long (connecting included): the download stops as `unreachable`. */
export const DEFAULT_STALL_MS = 30_000

export interface DownloadFileOptions {
  url: string
  dest: string
  size: number
  sha256: string
  fetch: FetchLike
  signal?: AbortSignal
  stallMs?: number
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

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * Where a download may end up after redirects: https only, or plain http when the request
 * itself was plain http to this machine (the tests' and dev fake server).
 */
export function allowedFinalUrl(requested: string, final: string): boolean {
  try {
    const to = new URL(final)
    if (to.protocol === 'https:') return true
    const from = new URL(requested)
    return (
      to.protocol === 'http:' &&
      from.protocol === 'http:' &&
      LOOPBACK.has(from.hostname) &&
      LOOPBACK.has(to.hostname)
    )
  } catch {
    return false
  }
}

/** `bytes 100-199/200` → 100; null when absent or unreadable. */
function rangeStart(header: string | null): number | null {
  const match = header ? /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(header.trim()) : null
  return match ? Number(match[1]) : null
}

function isDiskFull(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOSPC' || error.code === 'EDQUOT')
  )
}

/**
 * Downloads `url` into `dest`, continuing a partial file when the server supports ranges.
 * The file is verified before it counts: a wrong size or hash deletes it. An abort keeps the
 * partial file (pause); network errors keep it too, so "Try again" resumes.
 */
export async function downloadFile(options: DownloadFileOptions): Promise<void> {
  const { url, dest, size } = options
  await mkdir(dirname(dest), { recursive: true })
  let have = await partialSize(dest)
  if (have > size) {
    await rm(dest, { force: true })
    have = 0
  }
  options.onBytes(have)
  if (have < size) {
    const stall = new Stall(options.stallMs ?? DEFAULT_STALL_MS, options.signal)
    try {
      let response = await request(options, have, stall)
      if (response.status === 416) {
        // The server says our range is wrong: start over.
        await response.body?.cancel().catch(() => {})
        await rm(dest, { force: true })
        options.onBytes(-have)
        have = 0
        response = await request(options, 0, stall)
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {})
        throw new DownloadError('download_failed', `HTTP ${response.status} for ${url}`)
      }
      if (response.url && !allowedFinalUrl(url, response.url)) {
        await response.body.cancel().catch(() => {})
        throw new DownloadError('download_failed', `${url} redirected to a non-https address`)
      }
      // 206 continues where we are; anything else (200, a 206 elsewhere) is the whole file.
      const append =
        have > 0 &&
        response.status === 206 &&
        rangeStart(response.headers.get('content-range')) === have
      if (!append && response.status === 206 && rangeStart(response.headers.get('content-range'))) {
        await response.body.cancel().catch(() => {})
        throw new DownloadError('download_failed', `${url} sent an unexpected range`)
      }
      if (!append && have > 0) {
        options.onBytes(-have)
        have = 0
      }
      const file = await open(dest, append ? 'a' : 'w')
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          stall.touch()
          have += chunk.byteLength
          if (have > size) {
            throw new DownloadError('download_failed', `${url} is larger than listed`)
          }
          await file.write(chunk)
          options.onBytes(chunk.byteLength)
        }
      } catch (error) {
        stall.rethrowAbort()
        if (error instanceof DownloadError) {
          await file.close().catch(() => {})
          await rm(dest, { force: true })
          throw error
        }
        if (isDiskFull(error)) {
          throw new DownloadError('disk_space', `disk full writing ${dest}`, { cause: error })
        }
        throw new DownloadError('unreachable', `connection lost on ${url}`, { cause: error })
      } finally {
        await file.close().catch(() => {})
      }
    } finally {
      stall.stop()
    }
  }
  if ((await partialSize(dest)) !== size) {
    throw new DownloadError('unreachable', `${url} ended early`)
  }
  if ((await sha256File(dest)) !== options.sha256) {
    await rm(dest, { force: true })
    throw new DownloadError('checksum_mismatch', `${url} failed its SHA-256 check`)
  }
}

/**
 * The request's abort signal: the caller's (pause, cancel) plus a timer that fires when no
 * byte arrived for `ms`. `rethrowAbort` turns an abort into the right error.
 */
class Stall {
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | null = null
  private stalled = false
  readonly signal: AbortSignal

  constructor(
    private readonly ms: number,
    private readonly user: AbortSignal | undefined,
  ) {
    this.signal = user ? AbortSignal.any([user, this.controller.signal]) : this.controller.signal
    this.touch()
  }

  touch(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.stalled = true
      this.controller.abort(new Error('stalled'))
    }, this.ms)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Throws the pause/cancel reason, or `unreachable` after a stall; nothing otherwise. */
  rethrowAbort(): void {
    if (this.user?.aborted) throw this.user.reason
    if (this.stalled) throw new DownloadError('unreachable', 'no data for too long')
  }
}

async function request(
  options: DownloadFileOptions,
  from: number,
  stall: Stall,
): Promise<Response> {
  try {
    const response = await options.fetch(options.url, {
      ...(from > 0 ? { headers: { Range: `bytes=${from}-` } } : {}),
      signal: stall.signal,
    })
    stall.touch()
    return response
  } catch (error) {
    stall.rethrowAbort()
    throw new DownloadError('unreachable', `could not reach ${options.url}`, { cause: error })
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
