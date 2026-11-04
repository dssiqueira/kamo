import { describe, expect, it } from 'vitest'
import {
  audioFrameCount,
  createTrackReader,
  mixBlocks,
  toPlanar,
  type PcmChunk,
  type StereoBlock,
} from './audio-mix.ts'

const SCALE = 1e5

/** Chunks of a ramp: sample n has value n / SCALE (right channel: -n / SCALE). */
function ramp(rate: number, total: number, chunkSize: number, channels = 2): PcmChunk[] {
  const chunks: PcmChunk[] = []
  for (let start = 0; start < total; start += chunkSize) {
    const n = Math.min(chunkSize, total - start)
    const make = (sign: number) =>
      Float32Array.from({ length: n }, (_, i) => (sign * (start + i)) / SCALE)
    chunks.push({
      timestamp: start / rate,
      sampleRate: rate,
      channels: channels === 1 ? [make(1)] : [make(1), make(-1)],
    })
  }
  return chunks
}

function feeder(chunks: PcmChunk[]) {
  let i = 0
  const feed = {
    pulls: 0,
    next: async () => {
      feed.pulls++
      return chunks[i++] ?? null
    },
  }
  return feed
}

const values = (a: Float32Array) => Array.from(a, (v) => Math.round(v * SCALE))

describe('createTrackReader', () => {
  it('copies a 48kHz track exactly, across chunk boundaries', async () => {
    const reader = createTrackReader(feeder(ramp(48_000, 10_000, 1024)).next, { startS: 0 })
    const a = await reader.read(0, 3000)
    const b = await reader.read(3000, 3000)
    expect(values(a.left).slice(1020, 1028)).toEqual([
      1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027,
    ])
    expect(values(b.left)[0]).toBe(3000)
    expect(values(b.right)[0]).toBe(-3000)
  })

  it('starts at the trim: export frame 0 is the track at startS', async () => {
    const reader = createTrackReader(feeder(ramp(48_000, 96_000, 4800)).next, { startS: 1 })
    expect(values((await reader.read(0, 4)).left)).toEqual([48_000, 48_001, 48_002, 48_003])
  })

  it('is silent where the track has no audio (before its start, gaps, after its end)', async () => {
    const chunks: PcmChunk[] = [
      { timestamp: 0.5, sampleRate: 48_000, channels: [new Float32Array(10).fill(0.5)] },
      { timestamp: 1, sampleRate: 48_000, channels: [new Float32Array(10).fill(0.25)] },
    ]
    const reader = createTrackReader(feeder(chunks).next, { startS: 0 })
    const { left } = await reader.read(0, 60_000)
    expect(left[0]).toBe(0)
    expect(left[24_000]).toBe(0.5)
    expect(left[24_009]).toBe(0.5)
    expect(left[24_010]).toBe(0)
    expect(left[48_000]).toBe(0.25)
    expect(left[48_010]).toBe(0)
    expect(left[59_999]).toBe(0)
  })

  it('duplicates mono to both sides', async () => {
    const reader = createTrackReader(feeder(ramp(48_000, 100, 100, 1)).next, { startS: 0 })
    const block = await reader.read(10, 2)
    expect(values(block.left)).toEqual([10, 11])
    expect(values(block.right)).toEqual([10, 11])
  })

  it('resamples other rates linearly onto 48kHz', async () => {
    const reader = createTrackReader(feeder(ramp(24_000, 1000, 256)).next, { startS: 0 })
    const { left } = await reader.read(0, 6)
    // 24kHz sample n sits at 48kHz frame 2n; odd frames are halfway between.
    Array.from(left).forEach((v, i) => expect(v * SCALE).toBeCloseTo(i / 2, 3))
  })

  it('keeps sync at other rates: 44.1kHz second 1 lands on export second 1', async () => {
    const reader = createTrackReader(feeder(ramp(44_100, 100_000, 4096)).next, { startS: 0 })
    await reader.read(0, 48_000)
    const block = await reader.read(48_000, 1)
    expect(Math.round((block.left[0] as number) * SCALE)).toBe(44_100)
  })

  it('pulls only as far as it needs (streaming, flat memory)', async () => {
    const feed = feeder(ramp(48_000, 480_000, 4800))
    const reader = createTrackReader(feed.next, { startS: 0 })
    await reader.read(0, 4800)
    expect(feed.pulls).toBeLessThanOrEqual(2)
  })

  it('returns silence for an empty track', async () => {
    const reader = createTrackReader(feeder([]).next, { startS: 0 })
    expect(Array.from((await reader.read(0, 4)).left)).toEqual([0, 0, 0, 0])
  })
})

const block = (l: number[], r: number[]): StereoBlock => ({
  left: Float32Array.from(l),
  right: Float32Array.from(r),
})

describe('mixBlocks', () => {
  it('applies each track volume and sums', () => {
    const mixed = mixBlocks(
      [
        { block: block([0.5, 0.5], [0.2, 0.2]), volume: 0.5 },
        { block: block([0.1, -0.1], [0, 0]), volume: 1 },
      ],
      2,
    )
    expect(mixed.left[0]).toBeCloseTo(0.35, 6)
    expect(mixed.left[1]).toBeCloseTo(0.15, 6)
    expect(mixed.right[0]).toBeCloseTo(0.1, 6)
  })

  it('volume 0 is muted (F-04)', () => {
    expect(Array.from(mixBlocks([{ block: block([0.9], [0.9]), volume: 0 }], 1).left)).toEqual([0])
  })

  it('limits the sum to full scale instead of wrapping', () => {
    const loud = block([0.8, -0.8], [0.8, -0.8])
    const mixed = mixBlocks(
      [
        { block: loud, volume: 1 },
        { block: loud, volume: 1 },
      ],
      2,
    )
    expect(Array.from(mixed.left)).toEqual([1, -1])
  })

  it('is silence with no tracks', () => {
    expect(Array.from(mixBlocks([], 3).left)).toEqual([0, 0, 0])
  })
})

describe('toPlanar and audioFrameCount', () => {
  it('lays out left then right', () => {
    expect(Array.from(toPlanar(block([1, 2], [3, 4])))).toEqual([1, 2, 3, 4])
  })

  it('counts 48kHz frames for the export duration', () => {
    expect(audioFrameCount(1)).toBe(48_000)
    expect(audioFrameCount(571 / 30)).toBe(913_600)
  })
})
