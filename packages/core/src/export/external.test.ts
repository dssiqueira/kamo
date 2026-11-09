import { describe, expect, it } from 'vitest'
import type { ExternalEncodeSession } from '../platform/video-encoder.ts'
import { toInterleavedS16 } from './audio-mix.ts'
import { ExportError, needsCompatibilityEncoder } from './errors.ts'
import { encodeExternal } from './external.ts'

function fakeSession(fail?: { on: 'audio' | 'frame' | 'finish'; after?: number }) {
  const calls: string[] = []
  let frames = 0
  const session: ExternalEncodeSession & { aborted: unknown } = {
    name: 'Demo 16x9 1080p30.mp4',
    aborted: undefined,
    async writeAudio(pcm) {
      if (fail?.on === 'audio') throw new ExportError('compatibility_failed')
      calls.push(`audio:${pcm.length}`)
    },
    async writeFrame(rgba) {
      if (fail?.on === 'frame' && frames >= (fail.after ?? 0)) throw new Error('pipe closed')
      frames++
      calls.push(`frame:${rgba[0]}`)
    },
    async finish() {
      if (fail?.on === 'finish') throw new ExportError('disk_full')
      calls.push('finish')
      return { path: 'C:/Videos/Demo.mp4', codec: 'h264_mf', hardware: true }
    },
    async abort(reason) {
      session.aborted = reason ?? null
      calls.push('abort')
    },
  }
  return { session, calls }
}

const base = {
  readAudio: async (_start: number, count: number) => new Int16Array(count * 2),
  renderFrame: async (index: number) => new Uint8Array([index, 0, 0, 255]),
  checkAbort: () => {},
}

describe('encodeExternal', () => {
  it('sends all the sound first, then every frame in order, then finishes', async () => {
    const { session, calls } = fakeSession()
    const progress: number[] = []
    const result = await encodeExternal({
      ...base,
      session,
      frames: 3,
      // 1.5 s at 48 kHz: one full 1 s block and a half block
      audioFrames: 72_000,
      onProgress: (p) => progress.push(p),
    })
    expect(result).toEqual({ path: 'C:/Videos/Demo.mp4', codec: 'h264_mf', hardware: true })
    expect(calls).toEqual(['audio:96000', 'audio:48000', 'frame:0', 'frame:1', 'frame:2', 'finish'])
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })

  it('without sound only sends frames', async () => {
    const { session, calls } = fakeSession()
    await encodeExternal({ ...base, session, frames: 2, audioFrames: 0 })
    expect(calls).toEqual(['frame:0', 'frame:1', 'finish'])
  })

  it('aborts the session and keeps the platform error code', async () => {
    const { session, calls } = fakeSession({ on: 'finish' })
    await expect(
      encodeExternal({ ...base, session, frames: 1, audioFrames: 0 }),
    ).rejects.toMatchObject({ code: 'disk_full' })
    expect(calls.at(-1)).toBe('abort')
  })

  it('a broken encoder process is a generic failure, and the file is aborted', async () => {
    const { session } = fakeSession({ on: 'frame', after: 1 })
    await expect(
      encodeExternal({ ...base, session, frames: 3, audioFrames: 0 }),
    ).rejects.toMatchObject({ code: 'failed' })
    expect(session.aborted).toBeInstanceOf(Error)
  })

  it('cancel stops between frames and aborts', async () => {
    const { session, calls } = fakeSession()
    let rendered = 0
    await expect(
      encodeExternal({
        ...base,
        session,
        frames: 10,
        audioFrames: 0,
        renderFrame: async (i) => {
          rendered++
          return new Uint8Array([i, 0, 0, 255])
        },
        checkAbort: () => {
          if (rendered >= 2) throw new ExportError('aborted')
        },
      }),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(calls).toEqual(['frame:0', 'frame:1', 'abort'])
  })
})

describe('toInterleavedS16', () => {
  it('interleaves left and right and scales to 16 bits', () => {
    const pcm = toInterleavedS16({
      left: new Float32Array([0, 1, -1, 0.5]),
      right: new Float32Array([0.25, -0.5, 2, -2]),
    })
    expect([...pcm]).toEqual([0, 8192, 32767, -16384, -32768, 32767, 16384, -32768])
  })
})

describe('needsCompatibilityEncoder', () => {
  it('only for a missing or broken encoder', () => {
    expect(needsCompatibilityEncoder('encoder_unavailable')).toBe(true)
    expect(needsCompatibilityEncoder('encoder_failed')).toBe(true)
    expect(needsCompatibilityEncoder('disk_full')).toBe(false)
    expect(needsCompatibilityEncoder('compatibility_failed')).toBe(false)
  })
})
