// Exports through the "Video compatibility" pack (A-07, D-040), main-process half. The
// renderer paints the frames with core and mixes the sound; this side checks the pack, picks
// an LGPL encoder FFmpeg takes on this machine, runs FFmpeg into the export's `.partial` file
// (ExportFiles: same names, collisions, busy check and cleanup as every export) and commits it.
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstalledProgram } from '../packs/manager.ts'
import type { SpawnLike } from '../transcription/whisper.ts'
import {
  FfmpegError,
  FfmpegSession,
  ffmpegEncoders,
  isOsEncoder,
  pickEncoder,
  type PackCommand,
} from './ffmpeg.ts'

export type CompatibilityErrorCode = 'encoder_unavailable' | 'compatibility_failed' | 'disk_full'

export class CompatibilityError extends Error {
  constructor(
    readonly code: CompatibilityErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options)
    this.name = 'CompatibilityError'
  }
}

/** What the service needs from ExportFiles. */
export interface CompatibilityFiles {
  open(owner: number, fileName: unknown): Promise<{ id: string; name: string }>
  partialPath(id: string): string
  commit(id: unknown): Promise<string>
  abort(id: unknown): Promise<void>
}

export interface CompatibilityLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
}

export interface CompatibilityExportsOptions {
  files: CompatibilityFiles
  /** The installed pack's FFmpeg, checked (SHA-256) before every export; null when missing. */
  program(): Promise<InstalledProgram | null>
  /** Remove waits while an export uses the pack. Returns the release. */
  retain(): () => void
  command(entry: string): PackCommand
  /** `process.platform`: which OS encoder to try first. */
  platform: string
  /** Scratch folder for the sound files (wiped when the app starts). */
  workDir: string
  log: CompatibilityLogger
  spawn?: SpawnLike
}

export interface CompatibilityOpenResult {
  id: string
  name: string
  codec: string
  hardware: boolean
}

interface Session {
  owner: number
  fileId: string
  ffmpeg: FfmpegSession
  codec: string
  audioPath: string | null
  release(): void
}

/** Output sizes the export makes (core's outputSize): up to 4K either way. */
const MAX_SIDE = 4096
const SAMPLE_RATES = new Set([44_100, 48_000])

export class CompatibilityExports {
  private readonly sessions = new Map<string, Session>()
  /** The encoder FFmpeg took per pack version, size and rate (probing costs a process). */
  private readonly encoders = new Map<string, string | null>()

  constructor(private readonly options: CompatibilityExportsOptions) {}

  /** Clears sound files a closed app left behind. */
  async clean(): Promise<void> {
    await rm(this.options.workDir, { recursive: true, force: true }).catch(() => {})
  }

  isExporting(owner?: number): boolean {
    for (const session of this.sessions.values()) {
      if (owner === undefined || session.owner === owner) return true
    }
    return false
  }

  async open(owner: number, raw: unknown): Promise<CompatibilityOpenResult> {
    const request = checkOpen(raw)
    const program = await this.options.program()
    if (!program) throw new CompatibilityError('encoder_unavailable')
    const command = this.options.command(program.entry)
    await mkdir(this.options.workDir, { recursive: true })
    const video = {
      width: request.width,
      height: request.height,
      fps: request.fps,
      bitrate: request.bitrate,
    }
    const key = `${program.version} ${video.width}x${video.height}@${video.fps}`
    let codec = this.encoders.get(key)
    if (codec === undefined) {
      codec = await pickEncoder({
        command,
        cwd: this.options.workDir,
        encoders: ffmpegEncoders(this.options.platform),
        video,
        ...(this.options.spawn ? { spawn: this.options.spawn } : {}),
      })
      this.encoders.set(key, codec)
      this.options.log.info('export.compat.encoder', { codec, ...video })
    }
    if (!codec) throw new CompatibilityError('encoder_unavailable')

    const release = this.options.retain()
    try {
      const file = await this.options.files.open(owner, request.fileName)
      const audioPath = request.audio
        ? join(this.options.workDir, `sound-${randomUUID()}.s16le`)
        : null
      const ffmpeg = new FfmpegSession({
        command,
        cwd: this.options.workDir,
        video: { ...video, encoder: codec },
        audio: request.audio && audioPath ? { path: audioPath, ...request.audio } : null,
        output: this.options.files.partialPath(file.id),
        ...(this.options.spawn ? { spawn: this.options.spawn } : {}),
      })
      this.sessions.set(file.id, {
        owner,
        fileId: file.id,
        ffmpeg,
        codec,
        audioPath,
        release,
      })
      return { id: file.id, name: file.name, codec, hardware: isOsEncoder(codec) }
    } catch (error) {
      release()
      throw error
    }
  }

  async writeAudio(id: unknown, bytes: unknown): Promise<void> {
    const session = this.get(id)
    if (!(bytes instanceof Uint8Array)) throw new TypeError('sound must be bytes')
    return this.guard(session, () => session.ffmpeg.writeAudio(bytes))
  }

  async writeFrame(id: unknown, bytes: unknown): Promise<void> {
    const session = this.get(id)
    if (!(bytes instanceof Uint8Array)) throw new TypeError('a frame must be bytes')
    return this.guard(session, () => session.ffmpeg.writeFrame(bytes))
  }

  /** FFmpeg finishes the MP4, then the `.partial` file gets its final name. */
  async finish(id: unknown): Promise<{ path: string; codec: string; hardware: boolean }> {
    const session = this.get(id)
    await this.guard(session, () => session.ffmpeg.finish())
    try {
      const path = await this.options.files.commit(session.fileId)
      this.options.log.info('export.compat.done', { codec: session.codec })
      return { path, codec: session.codec, hardware: isOsEncoder(session.codec) }
    } finally {
      await this.forget(session)
    }
  }

  /** Cancel or failure: stops FFmpeg and deletes the incomplete file. Unknown ids: no-op. */
  async abort(id: unknown): Promise<void> {
    const session = typeof id === 'string' ? this.sessions.get(id) : undefined
    if (session) await this.discard(session)
  }

  /** The page that owned these exports went away. */
  async abortAll(owner?: number): Promise<void> {
    const mine = [...this.sessions.values()].filter((s) => owner === undefined || s.owner === owner)
    await Promise.all(mine.map((session) => this.discard(session)))
  }

  private get(id: unknown): Session {
    const session = typeof id === 'string' ? this.sessions.get(id) : undefined
    if (!session) throw new CompatibilityError('compatibility_failed')
    return session
  }

  /** Runs a step; when FFmpeg failed, the export is discarded and the reason passed on. */
  private async guard(session: Session, step: () => Promise<void>): Promise<void> {
    try {
      await step()
    } catch (error) {
      if (error instanceof TypeError) throw error
      await this.discard(session)
      const code = error instanceof FfmpegError ? error.code : 'compatibility_failed'
      this.options.log.warn('export.compat.failed', {
        code,
        codec: session.codec,
        detail: error instanceof FfmpegError ? error.detail.slice(-1000) : String(error),
      })
      throw new CompatibilityError(code, { cause: error })
    }
  }

  private async discard(session: Session): Promise<void> {
    await session.ffmpeg.abort().catch(() => {})
    await this.options.files.abort(session.fileId).catch(() => {})
    await this.forget(session)
  }

  private async forget(session: Session): Promise<void> {
    if (!this.sessions.has(session.fileId)) return
    this.sessions.delete(session.fileId)
    session.release()
    await session.ffmpeg.abort().catch(() => {})
    if (session.audioPath) await rm(session.audioPath, { force: true }).catch(() => {})
  }
}

interface OpenRequest {
  fileName: unknown
  width: number
  height: number
  fps: number
  bitrate: number
  audio: { sampleRate: number; channels: number } | null
}

function int(value: unknown, min: number, max: number, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${what} out of range`)
  }
  return value
}

/** Only what the export makes: even sizes up to 4K, 1–120 fps, 16-bit stereo or mono sound. */
function checkOpen(raw: unknown): OpenRequest {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('options expected')
  const o = raw as Record<string, unknown>
  const width = int(o.width, 16, MAX_SIDE, 'width')
  const height = int(o.height, 16, MAX_SIDE, 'height')
  if (width % 2 !== 0 || height % 2 !== 0) throw new TypeError('size must be even')
  const fps = int(o.fps, 1, 120, 'fps')
  const bitrate = int(o.bitrate, 100_000, 400_000_000, 'bitrate')
  let audio: OpenRequest['audio'] = null
  if (o.audio !== null && o.audio !== undefined) {
    if (typeof o.audio !== 'object') throw new TypeError('audio expected')
    const a = o.audio as Record<string, unknown>
    const sampleRate = int(a.sampleRate, 8_000, 192_000, 'sampleRate')
    if (!SAMPLE_RATES.has(sampleRate)) throw new TypeError('sample rate not supported')
    audio = { sampleRate, channels: int(a.channels, 1, 2, 'channels') }
  }
  if (typeof o.fileName !== 'string' || !o.fileName.toLowerCase().endsWith('.mp4')) {
    throw new TypeError('an .mp4 file name expected')
  }
  return { fileName: o.fileName, width, height, fps, bitrate, audio }
}
