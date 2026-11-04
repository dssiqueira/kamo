// `@kamo/core/testing`: helpers to check exports for real in a browser (desktop smoke test,
// extension e2e, visual regression): read back what an export wrote, decode a frame or the
// sound, synthesize audio files and keep an export in memory. Not used by the app itself.
import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferTarget,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  VideoSampleSink,
  WEBM,
  WebMOutputFormat,
  BlobSource,
  CustomSource,
} from 'mediabunny'
import type { MediaFile, RandomAccessFile } from '../export/pipeline.ts'
import type { SinkChunk, SinkFile } from '../platform/sink.ts'

const FORMATS = [MP4, QTFF, WEBM, MATROSKA]

function openInput(file: MediaFile): Input {
  const source =
    file instanceof Blob
      ? new BlobSource(file)
      : new CustomSource({
          getSize: () => (file as RandomAccessFile).size(),
          read: (start, end) => (file as RandomAccessFile).read(start, end),
        })
  return new Input({ source, formats: FORMATS })
}

export interface MediaInfo {
  durationS: number
  video: { codec: string | null; width: number; height: number; frames: number } | null
  audio: { codec: string | null; sampleRate: number; channels: number } | null
}

export async function inspectMedia(file: MediaFile): Promise<MediaInfo> {
  const input = openInput(file)
  try {
    const video = await input.getPrimaryVideoTrack()
    const audio = await input.getPrimaryAudioTrack()
    let frames = 0
    if (video) {
      const stats = await video.computePacketStats()
      frames = stats.packetCount
    }
    return {
      durationS: await input.computeDuration(),
      video: video
        ? {
            codec: await video.getCodecParameterString(),
            width: await video.getDisplayWidth(),
            height: await video.getDisplayHeight(),
            frames,
          }
        : null,
      audio: audio
        ? {
            codec: await audio.getCodecParameterString(),
            sampleRate: await audio.getSampleRate(),
            channels: await audio.getNumberOfChannels(),
          }
        : null,
    }
  } finally {
    input.dispose()
  }
}

/** Decodes the frame on screen at `timeS` and hands it to `draw` (synchronously). */
export async function decodeVideoFrame(
  file: MediaFile,
  timeS: number,
  draw: (source: CanvasImageSource, width: number, height: number) => void,
): Promise<number | null> {
  const input = openInput(file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) return null
    const sample = await new VideoSampleSink(track).getSample(timeS)
    if (!sample) return null
    try {
      draw(sample.toCanvasImageSource(), sample.displayWidth, sample.displayHeight)
      return sample.timestamp
    } finally {
      sample.close()
    }
  } finally {
    input.dispose()
  }
}

export interface DecodedAudio {
  sampleRate: number
  /** planar; index 0 is at `startS` */
  channels: Float32Array[]
  startS: number
}

/** Decodes the sound in [fromS, toS) into planar float arrays. */
export async function decodeAudio(
  file: MediaFile,
  fromS: number,
  toS: number,
): Promise<DecodedAudio | null> {
  const input = openInput(file)
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) return null
    const sampleRate = await track.getSampleRate()
    const count = await track.getNumberOfChannels()
    const total = Math.round((toS - fromS) * sampleRate)
    const channels = Array.from({ length: count }, () => new Float32Array(total))
    for await (const sample of new AudioSampleSink(track).samples(fromS, toS)) {
      const offset = Math.round((sample.timestamp - fromS) * sampleRate)
      for (let c = 0; c < count; c++) {
        const data = new Float32Array(sample.numberOfFrames)
        sample.copyTo(data, { planeIndex: c, format: 'f32-planar' })
        const channel = channels[c] as Float32Array
        for (let i = 0; i < data.length; i++) {
          const at = offset + i
          if (at >= 0 && at < total) channel[at] = data[i] as number
        }
      }
      sample.close()
    }
    return { sampleRate, channels, startS: fromS }
  } finally {
    input.dispose()
  }
}

/** Encodes planar PCM to a file: AAC in MP4 when the machine can, else Opus in WebM. */
export async function encodeAudioFile(sampleRate: number, channels: Float32Array[]): Promise<Blob> {
  const aac = await AudioEncoder.isConfigSupported({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels: channels.length,
    bitrate: 128_000,
  }).then(
    (s) => s.supported === true,
    () => false,
  )
  const target = new BufferTarget()
  const output = new Output({
    format: aac ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  })
  const source = new AudioSampleSource({ codec: aac ? 'aac' : 'opus', bitrate: 128_000 })
  output.addAudioTrack(source)
  await output.start()
  const frames = channels[0]?.length ?? 0
  const block = 4096
  for (let start = 0; start < frames; start += block) {
    const n = Math.min(block, frames - start)
    const data = new Float32Array(n * channels.length)
    channels.forEach((channel, c) => data.set(channel.subarray(start, start + n), c * n))
    const sample = new AudioSample({
      data,
      format: 'f32-planar',
      numberOfChannels: channels.length,
      sampleRate,
      timestamp: start / sampleRate,
    })
    await source.add(sample)
    sample.close()
  }
  await output.finalize()
  return new Blob([target.buffer as ArrayBuffer], { type: aac ? 'audio/mp4' : 'audio/webm' })
}

/** A SinkFile that keeps the export in memory (positioned writes, like a real file). */
export function createMemorySinkFile(name: string): SinkFile & { bytes(): Uint8Array } {
  let buffer = new Uint8Array(2 ** 20)
  let size = 0
  const ensure = (needed: number) => {
    if (needed <= buffer.byteLength) return
    let capacity = buffer.byteLength
    while (capacity < needed) capacity *= 2
    const next = new Uint8Array(capacity)
    next.set(buffer.subarray(0, size))
    buffer = next
  }
  return {
    name,
    stream: new WritableStream<SinkChunk>({
      write(chunk) {
        const end = chunk.position + chunk.data.byteLength
        ensure(end)
        buffer.set(chunk.data, chunk.position)
        size = Math.max(size, end)
      },
    }),
    commit: async () => `memory:${name}`,
    abort: async () => {
      size = 0
    },
    bytes: () => buffer.slice(0, size),
  }
}
