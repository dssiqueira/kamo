// The compatibility pack's exports (D-040) against a fake FFmpeg: a Node script that reads the
// frames and the sound like ffmpeg and writes a JSON summary instead of an MP4. No real FFmpeg
// is needed (or downloaded); what only the real pack can show is in docs/decisions.md D-040.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExportFiles } from '../export-files.ts'
import { FAKE_FFMPEG_SCRIPT } from '../packs/testing.ts'
import { classifyFfmpegError, ffmpegEncoders, ffmpegExportArgs, ffmpegProbeArgs } from './ffmpeg.ts'
import { CompatibilityExports, type CompatibilityExportsOptions } from './service.ts'

const log = { info() {}, warn() {} }
let dir: string
let entry: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-compat-'))
  entry = join(dir, 'pack', 'bin', 'ffmpeg.mjs')
  await mkdir(join(dir, 'pack', 'bin'), { recursive: true })
  await writeFile(entry, FAKE_FFMPEG_SCRIPT)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function setup(
  env: Record<string, string> = {},
  overrides: Partial<CompatibilityExportsOptions> = {},
) {
  const files = new ExportFiles(() => join(dir, 'out'), log)
  const retained = { count: 0 }
  const compat = new CompatibilityExports({
    files,
    program: async () => ({
      id: 'video-compatibility',
      version: '1.0.0',
      dir: join(dir, 'pack'),
      entry,
    }),
    retain: () => {
      retained.count++
      return () => {
        retained.count--
      }
    },
    command: (program) => ({
      command: process.execPath,
      prefix: [program],
      env: { ...process.env, ...env },
    }),
    platform: 'win32',
    workDir: join(dir, 'work'),
    log,
    ...overrides,
  })
  return { compat, files, retained }
}

const request = (audio = true) => ({
  fileName: 'Demo 16x9 1080p30.mp4',
  width: 32,
  height: 18,
  fps: 30,
  bitrate: 1_000_000,
  audio: audio ? { sampleRate: 48_000, channels: 2 } : null,
})
const frame = () => new Uint8Array(32 * 18 * 4).fill(200)

async function exported(): Promise<string[]> {
  return readdir(join(dir, 'out')).catch(() => [])
}

describe('CompatibilityExports', () => {
  it('runs FFmpeg with the OS encoder, the sound first and every frame, then names the file', async () => {
    const { compat, retained } = setup()
    const opened = await compat.open(1, request())
    expect(opened).toMatchObject({
      name: 'Demo 16x9 1080p30.mp4',
      codec: 'h264_mf',
      hardware: true,
    })
    expect(retained.count).toBe(1)
    expect(compat.isExporting(1)).toBe(true)
    await compat.writeAudio(opened.id, new Uint8Array(48_000 * 4))
    for (let i = 0; i < 3; i++) await compat.writeFrame(opened.id, frame())
    const done = await compat.finish(opened.id)
    expect(done.path).toBe(join(dir, 'out', 'Demo 16x9 1080p30.mp4'))
    const summary = JSON.parse(await readFile(done.path, 'utf8'))
    expect(summary).toMatchObject({ encoder: 'h264_mf', frames: 3, audioBytes: 192_000 })
    expect(summary.args).not.toContain('libx264')
    expect(await exported()).toEqual(['Demo 16x9 1080p30.mp4'])
    // The sound file is gone and the pack is free to remove again.
    expect(await readdir(join(dir, 'work'))).toEqual([])
    expect(retained.count).toBe(0)
    expect(compat.isExporting()).toBe(false)
  })

  it('falls back to MPEG-4 when the OS encoder refuses, and remembers the choice', async () => {
    const { compat } = setup({ FAKE_FFMPEG_REFUSE: 'h264_mf' })
    const opened = await compat.open(1, request(false))
    expect(opened).toMatchObject({ codec: 'mpeg4', hardware: false })
    await compat.writeFrame(opened.id, frame())
    const done = await compat.finish(opened.id)
    expect(JSON.parse(await readFile(done.path, 'utf8'))).toMatchObject({
      encoder: 'mpeg4',
      frames: 1,
      audioBytes: 0,
    })
    const again = await compat.open(1, request(false))
    expect(again.name).toBe('Demo 16x9 1080p30 (2).mp4')
    await compat.abort(again.id)
  })

  it('says encoder_unavailable without the pack or without any encoder, and opens no file', async () => {
    const none = setup({}, { program: async () => null })
    await expect(none.compat.open(1, request())).rejects.toMatchObject({
      code: 'encoder_unavailable',
    })
    const refused = setup({ FAKE_FFMPEG_REFUSE: 'h264_mf,mpeg4' })
    await expect(refused.compat.open(1, request())).rejects.toMatchObject({
      code: 'encoder_unavailable',
    })
    expect(refused.retained.count).toBe(0)
    expect(await exported()).toEqual([])
  })

  it('reports a full disk and deletes the incomplete file', async () => {
    const { compat, retained } = setup({ FAKE_FFMPEG_DISK_FULL: '1' })
    const opened = await compat.open(1, request(false))
    await compat.writeFrame(opened.id, frame())
    await expect(compat.finish(opened.id)).rejects.toMatchObject({ code: 'disk_full' })
    expect(await exported()).toEqual([])
    expect(retained.count).toBe(0)
  })

  it('an FFmpeg failure is compatibility_failed, with nothing left behind', async () => {
    const { compat } = setup({ FAKE_FFMPEG_FAIL: '1' })
    const opened = await compat.open(1, request())
    await compat.writeAudio(opened.id, new Uint8Array(400))
    await compat.writeFrame(opened.id, frame())
    await expect(compat.finish(opened.id)).rejects.toMatchObject({
      code: 'compatibility_failed',
    })
    expect(await exported()).toEqual([])
    expect(await readdir(join(dir, 'work'))).toEqual([])
  })

  it('cancel and a closed window stop FFmpeg and delete the file', async () => {
    const { compat, retained } = setup()
    const a = await compat.open(1, request(false))
    await compat.writeFrame(a.id, frame())
    await compat.abort(a.id)
    const b = await compat.open(2, request(false))
    await compat.writeFrame(b.id, frame())
    await compat.abortAll(2)
    expect(await exported()).toEqual([])
    expect(retained.count).toBe(0)
    await expect(compat.writeFrame(b.id, frame())).rejects.toMatchObject({
      code: 'compatibility_failed',
    })
  })

  it('refuses what the export never sends', async () => {
    const { compat } = setup()
    await expect(compat.open(1, { ...request(), width: 33 })).rejects.toThrow(TypeError)
    await expect(compat.open(1, { ...request(), width: 8192 })).rejects.toThrow(TypeError)
    await expect(compat.open(1, { ...request(), fileName: 'x.gif' })).rejects.toThrow(TypeError)
    await expect(
      compat.open(1, { ...request(), audio: { sampleRate: 11_025, channels: 2 } }),
    ).rejects.toThrow(TypeError)
    const opened = await compat.open(1, request())
    await expect(compat.writeFrame(opened.id, new Uint8Array(10))).rejects.toThrow(TypeError)
    await compat.writeFrame(opened.id, frame())
    // Sound after the first frame would be lost: refused.
    await expect(compat.writeAudio(opened.id, new Uint8Array(4))).rejects.toThrow(TypeError)
    await compat.abort(opened.id)
  })
})

describe('ffmpeg arguments', () => {
  const video = { encoder: 'h264_mf', width: 1920, height: 1080, fps: 60, bitrate: 15_000_000 }

  it('only LGPL encoders, the OS one first', () => {
    expect(ffmpegEncoders('win32')).toEqual(['h264_mf', 'mpeg4'])
    expect(ffmpegEncoders('darwin')).toEqual(['h264_videotoolbox', 'mpeg4'])
    expect(ffmpegEncoders('linux')).toEqual(['mpeg4'])
  })

  it('raw RGBA on stdin, the sound as a second input, BT.709, header first', () => {
    const args = ffmpegExportArgs(
      video,
      { path: 'C:/work/sound.s16le', sampleRate: 48_000, channels: 2 },
      'C:/Videos/Demo.mp4.partial',
    )
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(args.join(' ')).toContain(
      '-f rawvideo -pix_fmt rgba -s 1920x1080 -framerate 60 -i pipe:0',
    )
    expect(args.join(' ')).toContain('-f s16le -ar 48000 -ac 2 -i C:/work/sound.s16le')
    expect(args.join(' ')).toContain('-map 0:v:0 -map 1:a:0')
    expect(after('-c:v')).toBe('h264_mf')
    expect(after('-b:v')).toBe('15000000')
    expect(after('-g')).toBe('120')
    expect(after('-c:a')).toBe('aac')
    expect(after('-vf')).toBe('scale=out_color_matrix=bt709:out_range=tv,format=nv12')
    expect(args.slice(-5)).toEqual([
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      'C:/Videos/Demo.mp4.partial',
    ])
  })

  it('MPEG-4 uses a fixed quality and planar 4:2:0; no sound means no audio input', () => {
    const args = ffmpegExportArgs({ ...video, encoder: 'mpeg4' }, null, 'out.mp4')
    expect(args).not.toContain('-b:v')
    expect(args[args.indexOf('-q:v') + 1]).toBe('2')
    expect(args[args.indexOf('-vf') + 1]).toContain('format=yuv420p')
    expect(args).not.toContain('s16le')
    expect(args).not.toContain('1:a:0')
  })

  it('the probe encodes one frame into nothing', () => {
    const args = ffmpegProbeArgs(video)
    expect(args.slice(-3)).toEqual(['-f', 'null', '-'])
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1')
  })

  it('reads a full disk from FFmpeg’s message', () => {
    expect(classifyFfmpegError('av_interleaved_write_frame(): No space left on device')).toBe(
      'disk_full',
    )
    expect(classifyFfmpegError('Error while opening encoder')).toBe('compatibility_failed')
  })
})
