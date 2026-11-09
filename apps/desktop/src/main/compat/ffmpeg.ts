// The "Video compatibility" pack's FFmpeg (A-07, D-040): an LGPL build that turns the raw
// frames the renderer painted with core (rule 11) and the sound it mixed into an MP4. Only
// LGPL encoders: the OS's own H.264 encoder (Media Foundation on Windows, VideoToolbox on Mac)
// and FFmpeg's built-in MPEG-4 Part 2 as the last resort; never libx264 (GPL).
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import type { SpawnLike, WhisperCommand } from '../transcription/whisper.ts'

export type PackCommand = WhisperCommand

/** LGPL-safe encoders, best first, for one platform (`process.platform`). */
export function ffmpegEncoders(platform: string): string[] {
  if (platform === 'win32') return ['h264_mf', 'mpeg4']
  if (platform === 'darwin') return ['h264_videotoolbox', 'mpeg4']
  return ['mpeg4']
}

/** The OS encoders may be hardware (or the OS's own software one); mpeg4 is FFmpeg's CPU one. */
export function isOsEncoder(encoder: string): boolean {
  return encoder !== 'mpeg4'
}

export interface FfmpegVideo {
  encoder: string
  width: number
  height: number
  fps: number
  /** H.264 bitrate (core's exportBitrate) */
  bitrate: number
}

export interface FfmpegAudio {
  /** a raw interleaved s16le file */
  path: string
  sampleRate: number
  channels: number
}

/** AAC through FFmpeg's own (LGPL) encoder, at the WebCodecs export's bitrate. */
const AUDIO_BITRATE = '160k'
const KEY_FRAME_INTERVAL_S = 2

/** Arguments shared by the probe and the export: raw RGBA frames on stdin, BT.709 out. */
function videoInput(video: FfmpegVideo): string[] {
  return [
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${video.width}x${video.height}`,
    '-framerate',
    String(video.fps),
    '-i',
    'pipe:0',
  ]
}

function videoEncoding(video: FfmpegVideo): string[] {
  // Media Foundation and VideoToolbox take NV12; mpeg4 takes planar 4:2:0.
  const pixelFormat = video.encoder === 'mpeg4' ? 'yuv420p' : 'nv12'
  const codec: string[] = ['-c:v', video.encoder]
  if (video.encoder === 'mpeg4') {
    // MPEG-4 Part 2 needs far more bits than H.264 for sharp screen text: a fixed quality.
    codec.push('-q:v', '2', '-tag:v', 'mp4v')
  } else {
    codec.push('-b:v', String(video.bitrate))
    if (video.encoder === 'h264_videotoolbox') codec.push('-allow_sw', '1', '-profile:v', 'high')
  }
  return [
    // RGB → limited-range BT.709, what the WebCodecs export and every player expect.
    '-vf',
    `scale=out_color_matrix=bt709:out_range=tv,format=${pixelFormat}`,
    ...codec,
    '-g',
    String(Math.max(1, Math.round(video.fps * KEY_FRAME_INTERVAL_S))),
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
  ]
}

/** `ffmpeg … -i pipe:0 [-i sound] … out.mp4`: the export of one format. */
export function ffmpegExportArgs(
  video: FfmpegVideo,
  audio: FfmpegAudio | null,
  output: string,
): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...videoInput(video)]
  if (audio) {
    args.push(
      '-f',
      's16le',
      '-ar',
      String(audio.sampleRate),
      '-ac',
      String(audio.channels),
      '-i',
      audio.path,
    )
  }
  args.push('-map', '0:v:0')
  if (audio) args.push('-map', '1:a:0')
  args.push(...videoEncoding(video))
  if (audio) args.push('-c:a', 'aac', '-b:a', AUDIO_BITRATE)
  // The header first, like the WebCodecs export ('reserve'): it plays while it downloads.
  args.push('-movflags', '+faststart', '-f', 'mp4', output)
  return args
}

/** One frame through the encoder into nothing: does it take this size and rate here? */
export function ffmpegProbeArgs(video: FfmpegVideo): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...videoInput(video),
    '-frames:v',
    '1',
    ...videoEncoding(video),
    '-f',
    'null',
    '-',
  ]
}

export type FfmpegFailure = 'disk_full' | 'compatibility_failed'

/** What FFmpeg's last words mean for the user. */
export function classifyFfmpegError(stderr: string): FfmpegFailure {
  return /no space left on device|disk quota|file too large/i.test(stderr)
    ? 'disk_full'
    : 'compatibility_failed'
}

export class FfmpegError extends Error {
  constructor(
    readonly code: FfmpegFailure,
    readonly detail: string,
  ) {
    super(`ffmpeg: ${code}`)
    this.name = 'FfmpegError'
  }
}

const STDERR_TAIL = 4000
const PROBE_TIMEOUT_MS = 30_000

function start(
  spawn: SpawnLike,
  command: PackCommand,
  args: string[],
  cwd: string,
): { child: ChildProcess; tail(): string; exited: Promise<number | null> } {
  const child = spawn(command.command, [...command.prefix, ...args], {
    cwd,
    env: command.env,
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  })
  let tail = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    tail = (tail + chunk.toString('utf8')).slice(-STDERR_TAIL)
  })
  // A pipe that breaks (ffmpeg exited) surfaces as an exit code, not as an unhandled error.
  child.stdin?.on('error', () => {})
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', (error) => {
      tail = `${tail}\n${error.message}`.slice(-STDERR_TAIL)
      resolve(null)
    })
    child.once('close', (code) => resolve(code))
  })
  return { child, tail: () => tail, exited }
}

/** True when this FFmpeg encodes one blank frame at this size and rate with `video.encoder`. */
export async function probeEncoder(options: {
  command: PackCommand
  cwd: string
  video: FfmpegVideo
  spawn?: SpawnLike
}): Promise<boolean> {
  const { child, exited } = start(
    options.spawn ?? nodeSpawn,
    options.command,
    ffmpegProbeArgs(options.video),
    options.cwd,
  )
  const timer = setTimeout(() => child.kill(), PROBE_TIMEOUT_MS)
  try {
    const frame = Buffer.alloc(options.video.width * options.video.height * 4)
    child.stdin?.end(frame)
    return (await exited) === 0
  } finally {
    clearTimeout(timer)
  }
}

/** The first encoder in `encoders` this FFmpeg takes for the size and rate, or null. */
export async function pickEncoder(options: {
  command: PackCommand
  cwd: string
  encoders: readonly string[]
  video: Omit<FfmpegVideo, 'encoder'>
  spawn?: SpawnLike
}): Promise<string | null> {
  for (const encoder of options.encoders) {
    const ok = await probeEncoder({
      command: options.command,
      cwd: options.cwd,
      video: { ...options.video, encoder },
      ...(options.spawn ? { spawn: options.spawn } : {}),
    }).catch(() => false)
    if (ok) return encoder
  }
  return null
}

export interface FfmpegSessionOptions {
  command: PackCommand
  cwd: string
  video: FfmpegVideo
  /** where the sound goes before FFmpeg starts; null: no sound */
  audio: FfmpegAudio | null
  /** the export's `.partial` file (ExportFiles) */
  output: string
  spawn?: SpawnLike
}

/**
 * One export through FFmpeg: the sound is written to a raw file first (FFmpeg reads it as a
 * second input), then FFmpeg starts on the first frame and gets every frame on stdin, with
 * backpressure, so memory stays flat whatever the length.
 */
export class FfmpegSession {
  private audioFile: FileHandle | null = null
  private audioOpen: Promise<FileHandle> | null = null
  private audioBytes = 0
  private running: ReturnType<typeof start> | null = null
  private exitCode: number | null | undefined = undefined
  private aborted = false
  readonly frameBytes: number

  constructor(private readonly options: FfmpegSessionOptions) {
    this.frameBytes = options.video.width * options.video.height * 4
  }

  async writeAudio(bytes: Uint8Array): Promise<void> {
    if (!this.options.audio) throw new TypeError('this export has no sound')
    if (this.running) throw new TypeError('sound must come before the first frame')
    if (bytes.byteLength % 2 !== 0) throw new TypeError('16-bit samples expected')
    this.audioOpen ??= open(this.options.audio.path, 'w')
    this.audioFile = await this.audioOpen
    await this.audioFile.write(bytes)
    this.audioBytes += bytes.byteLength
  }

  async writeFrame(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== this.frameBytes) throw new TypeError('frame size mismatch')
    const run = await this.ensureStarted()
    const stdin = run.child.stdin
    if (!stdin || stdin.destroyed || this.exitCode !== undefined) throw this.failure()
    if (stdin.write(bytes)) return
    // Backpressure: wait for FFmpeg to take it, or for it to stop.
    const ended = run.exited.then(() => 'exited' as const)
    const drained = once(stdin, 'drain').then(() => 'drained' as const)
    if ((await Promise.race([drained, ended])) === 'exited') throw this.failure()
  }

  /** Closes stdin and waits: resolves when FFmpeg wrote the whole MP4. */
  async finish(): Promise<void> {
    const run = await this.ensureStarted()
    run.child.stdin?.end()
    const code = await run.exited
    if (code !== 0) throw this.failure()
  }

  /** Kills FFmpeg (if it runs) and closes the sound file; the caller deletes the files. */
  async abort(): Promise<void> {
    this.aborted = true
    await this.closeAudio()
    if (this.running && this.exitCode === undefined) {
      this.running.child.kill()
      await this.running.exited
    }
  }

  private async ensureStarted(): Promise<ReturnType<typeof start>> {
    if (this.aborted) throw new FfmpegError('compatibility_failed', 'aborted')
    if (this.running) return this.running
    await this.closeAudio()
    const { options } = this
    const run = start(
      options.spawn ?? nodeSpawn,
      options.command,
      // Sound announced but none came (every track empty): exported silent, not failed.
      ffmpegExportArgs(options.video, this.audioBytes > 0 ? options.audio : null, options.output),
      options.cwd,
    )
    void run.exited.then((code) => {
      this.exitCode = code
    })
    this.running = run
    return run
  }

  private async closeAudio(): Promise<void> {
    const file = this.audioOpen ? await this.audioOpen.catch(() => null) : null
    this.audioOpen = null
    this.audioFile = null
    await file?.close().catch(() => {})
  }

  private failure(): FfmpegError {
    const detail = this.running?.tail() ?? ''
    return new FfmpegError(classifyFfmpegError(detail), detail)
  }
}
