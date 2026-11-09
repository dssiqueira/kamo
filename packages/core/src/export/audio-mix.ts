// Audio of the export (F-04, F-11): the microphone and computer tracks, each with its own
// volume (0 = muted), trimmed like the video and mixed to stereo at 48kHz. Pure math over
// PCM chunks, so it is tested in Node; the pipeline feeds it decoded samples.

export const EXPORT_SAMPLE_RATE = 48_000
export const EXPORT_CHANNELS = 2

/** Decoded audio, planar float32 (one array per channel, all the same length). */
export interface PcmChunk {
  /** seconds, in the track's own timeline */
  timestamp: number
  sampleRate: number
  channels: readonly Float32Array[]
}

export interface StereoBlock {
  left: Float32Array
  right: Float32Array
}

/** Reads one track as stereo at the export rate, aligned to the export timeline. */
export interface TrackReader {
  /** Export frames [startFrame, startFrame + count); silence where the track has no audio. */
  read(startFrame: number, count: number): Promise<StereoBlock>
}

export interface TrackReaderOptions {
  /** track time (s) that lines up with export frame 0 (the trim start, minus any offset) */
  startS: number
  /** export sample rate; defaults to 48kHz */
  targetRate?: number
}

interface Buffered {
  /** index of the first sample, in source samples from track time 0 */
  start: number
  left: Float32Array
  right: Float32Array
}

/** Positions this close to a whole sample are that sample (keeps same-rate copies exact). */
const WHOLE_SAMPLE_EPSILON = 1e-6

/**
 * Streams one track: pulls decoded chunks only as far as needed, places each by its own
 * timestamp (so gaps stay silent and the audio stays in sync with the video), resamples
 * linearly when the track is not 48kHz, duplicates mono to both sides and keeps only the
 * first two channels of anything wider. Consumed chunks are dropped, so memory stays flat.
 */
export function createTrackReader(
  next: () => Promise<PcmChunk | null>,
  { startS, targetRate = EXPORT_SAMPLE_RATE }: TrackReaderOptions,
): TrackReader {
  const chunks: Buffered[] = []
  let sourceRate: number | null = null
  let done = false
  let bufferedEnd = -Infinity

  async function pull(): Promise<boolean> {
    if (done) return false
    const chunk = await next()
    if (!chunk) {
      done = true
      return false
    }
    const length = chunk.channels[0]?.length ?? 0
    if (length === 0) return true
    sourceRate ??= chunk.sampleRate
    const left = chunk.channels[0] as Float32Array
    const right = chunk.channels[1] ?? left
    const start = Math.round(chunk.timestamp * sourceRate)
    chunks.push({ start, left, right })
    bufferedEnd = Math.max(bufferedEnd, start + length)
    return true
  }

  function sampleAt(index: number, channel: 'left' | 'right'): number {
    for (const chunk of chunks) {
      const offset = index - chunk.start
      if (offset >= 0 && offset < chunk.left.length) return chunk[channel][offset] ?? 0
    }
    return 0
  }

  return {
    async read(startFrame, count) {
      const left = new Float32Array(count)
      const right = new Float32Array(count)
      while (sourceRate === null && (await pull()));
      if (sourceRate === null) return { left, right }
      const rate = sourceRate
      const ratio = rate / targetRate
      const origin = startS * rate
      let lastIndex = -Infinity

      for (let j = 0; j < count; j++) {
        let pos = origin + (startFrame + j) * ratio
        const whole = Math.round(pos)
        if (Math.abs(pos - whole) < WHOLE_SAMPLE_EPSILON) pos = whole
        const i0 = Math.floor(pos)
        const frac = pos - i0
        const needed = frac > 0 ? i0 + 2 : i0 + 1
        while (bufferedEnd < needed && (await pull()));
        lastIndex = i0
        let l = sampleAt(i0, 'left')
        let r = sampleAt(i0, 'right')
        if (frac > 0) {
          l += (sampleAt(i0 + 1, 'left') - l) * frac
          r += (sampleAt(i0 + 1, 'right') - r) * frac
        }
        left[j] = l
        right[j] = r
      }

      // Drop chunks entirely before what the next read can touch.
      while (chunks.length > 0) {
        const first = chunks[0] as Buffered
        if (first.start + first.left.length > lastIndex) break
        chunks.shift()
      }
      return { left, right }
    },
  }
}

export interface MixInput {
  block: StereoBlock
  /** 0 to 1; 0 = muted */
  volume: number
}

/**
 * Sums the tracks with their volumes and hard-limits to [-1, 1] (two loud tracks can add
 * past full scale; clipping is better than wrapping around in the encoder).
 */
export function mixBlocks(inputs: readonly MixInput[], count: number): StereoBlock {
  const left = new Float32Array(count)
  const right = new Float32Array(count)
  for (const { block, volume } of inputs) {
    const gain = Math.min(1, Math.max(0, volume))
    if (gain === 0) continue
    for (let i = 0; i < count; i++) {
      left[i] = (left[i] as number) + (block.left[i] ?? 0) * gain
      right[i] = (right[i] as number) + (block.right[i] ?? 0) * gain
    }
  }
  for (let i = 0; i < count; i++) {
    left[i] = clampUnit(left[i] as number)
    right[i] = clampUnit(right[i] as number)
  }
  return { left, right }
}

/** Planar layout (`f32-planar`): all of the left channel, then all of the right. */
export function toPlanar({ left, right }: StereoBlock): Float32Array {
  const out = new Float32Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}

/** Audio frames of an export that lasts `durationS`. */
export function audioFrameCount(durationS: number, rate = EXPORT_SAMPLE_RATE): number {
  return Math.max(0, Math.round(durationS * rate))
}

function clampUnit(value: number): number {
  return value > 1 ? 1 : value < -1 ? -1 : value
}
