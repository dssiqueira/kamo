// Export pipeline (F-11, D-011): decode the raw video with WebCodecs, paint every output
// frame with the same renderer as the preview (rule 11), encode H.264 + AAC and mux an MP4
// that streams straight into the platform's FileSink. Same code on desktop and extension.
//
// Memory stays flat whatever the length: frames are decoded a few at a time, audio is
// mixed in 0.1s blocks interleaved with the video, and the muxer writes 4 MiB chunks.
import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type Input,
  type InputAudioTrack,
  type StreamTargetChunk,
} from 'mediabunny'
import type { MouseEventRecord } from '../events/events.ts'
import type { SinkFile } from '../platform/sink.ts'
import type { Aspect, CaptionSettings, Fps, Project } from '../project/schema.ts'
import { outputSize, type Resolution } from '../render/layout.ts'
import type { Transcript } from '../transcript/transcript.ts'
import {
  audioFrameCount,
  createTrackReader,
  EXPORT_CHANNELS,
  EXPORT_SAMPLE_RATE,
  mixBlocks,
  toPlanar,
  type PcmChunk,
  type TrackReader,
} from './audio-mix.ts'
import { chooseVideoEncoder, exportBitrate } from './encoder-config.ts'
import { ExportError, toExportError, type ExportWarning } from './errors.ts'
import { openFrameRenderer, openInput, type FrameRenderer, type MediaFile } from './frames.ts'
import { exportFrameCount, exportFrameTimeMs, exportFrameTimestamp } from './timing.ts'

export interface ExportAudioTrack {
  file: MediaFile
  /** 0 to 1 (project.audio.<track>.volume); 0 skips the track */
  volume: number
  /** where the track's time 0 sits on the video timeline (default 0: they start together) */
  offsetMs?: number
}

export interface ExportVideoOptions {
  project: Project
  events: readonly MouseEventRecord[]
  /** the raw recording (screen.mp4 / screen.webm) */
  video: MediaFile
  /**
   * the webcam recording (webcam.mp4, A-03), drawn as the bubble when project.webcam is set
   * and visible; unreadable → exported without the bubble and a warning
   */
  webcam?: MediaFile | null
  /**
   * the background image file (A-04) when the style is `kind: 'image'`; decoded once and
   * drawn under every frame. Missing or unreadable → the fallback color and a warning
   */
  backgroundImage?: MediaFile | null
  /** microphone and computer sound; missing or muted tracks are simply left out */
  audio?: readonly ExportAudioTrack[]
  /**
   * captions to burn in (A-06): the transcript and the look (its `enabled` is ignored: asking
   * to burn them is the choice). Missing = no captions in the picture.
   */
  captions?: { transcript: Transcript; settings: CaptionSettings } | null
  aspect: Aspect
  resolution: Resolution
  /**
   * Output frame rate (A-01). At 60fps the camera, the cursor and the captions are computed
   * for every output frame; a 30fps recording shows each of its frames twice (nothing is
   * interpolated).
   */
  fps: Fps
  /** the editor's auto-zoom toggle (F-05); default: `project.autoZoom` (on when absent) */
  autoZoom?: boolean
  /** an opened output file; exportVideo commits it on success and aborts it otherwise */
  sink: SinkFile
  signal?: AbortSignal
  /** 0..1, called after every frame */
  onProgress?(fraction: number): void
}

export interface ExportResult {
  /** where the sink put the file */
  path: string
  name: string
  warnings: ExportWarning[]
  /** duration of the exported video */
  durationMs: number
  frames: number
  /** wall-clock time the export took */
  elapsedMs: number
  encoder: { codec: string; hardware: boolean }
}

const OUTPUT_CHUNK_BYTES = 4 * 2 ** 20
const AUDIO_BITRATE = 160_000
const AUDIO_CODEC = 'mp4a.40.2'
/** Samples per AAC packet, to size the reserved MP4 header. */
const AAC_FRAME = 1024
/** Audio is mixed in 0.1s blocks and kept this far ahead of the video for interleaving. */
const AUDIO_BLOCK_FRAMES = EXPORT_SAMPLE_RATE / 10
const AUDIO_LEAD_S = 0.5
const KEY_FRAME_INTERVAL_S = 2

/**
 * Exports one format. Throws ExportError (code `aborted` on cancel); the sink file is
 * always committed or aborted before this returns or throws.
 */
export async function exportVideo(options: ExportVideoOptions): Promise<ExportResult> {
  const started = now()
  const { project, aspect, resolution, fps, sink, signal } = options
  const warnings: ExportWarning[] = []
  const inputs: Input[] = []
  let output: Output | null = null
  let frameRenderer: FrameRenderer | null = null
  let sinkError: unknown = null

  const checkAbort = () => {
    if (signal?.aborted) throw new ExportError('aborted', { cause: signal.reason })
  }

  try {
    checkAbort()
    const size = outputSize(aspect, resolution)
    const frames = exportFrameCount(project.trim, fps)
    const durationS = frames / fps
    const trimStartS = project.trim.startMs / 1000

    // Encoders.
    const bitrate = exportBitrate(size, fps)
    const encoder = await chooseVideoEncoder(size, fps, bitrate)
    if (!encoder) throw new ExportError('encoder_unavailable')
    if (!encoder.hardware) warnings.push('software_encoder')

    // Picture: the recording, webcam, background and captions, painted by the preview's
    // renderer (frames.ts).
    frameRenderer = await openFrameRenderer(
      {
        project,
        events: options.events,
        video: options.video,
        webcam: options.webcam ?? null,
        backgroundImage: options.backgroundImage ?? null,
        captions: options.captions ?? null,
        aspect,
        size,
        ...(options.autoZoom === undefined ? {} : { autoZoom: options.autoZoom }),
      },
      warnings,
    )

    const audioReaders = await openAudioTracks(options.audio ?? [], trimStartS, inputs, warnings)
    let withAudio = audioReaders.length > 0
    if (withAudio && !(await canEncodeAac())) {
      warnings.push('audio_encoder_unavailable')
      withAudio = false
    }
    checkAbort()

    // Muxer → sink. The wrapper keeps the sink's own error (e.g. disk full), which the
    // muxer would otherwise rethrow as a generic failure.
    const writer = sink.stream.getWriter()
    const target = new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        try {
          await writer.write({ type: 'write', data: chunk.data, position: chunk.position })
        } catch (error) {
          sinkError = error
          throw error
        }
      },
    })
    output = new Output({
      // 'reserve' puts the header first (plays while downloading) without holding the
      // video in memory; it needs the packet counts up front, which an export knows.
      format: new Mp4OutputFormat({ fastStart: 'reserve' }),
      target: new StreamTarget(target, { chunked: true, chunkSize: OUTPUT_CHUNK_BYTES }),
    })
    const videoSource = new CanvasSource(frameRenderer.canvas, {
      codec: 'avc',
      fullCodecString: encoder.codec,
      bitrate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      keyFrameInterval: KEY_FRAME_INTERVAL_S,
      hardwareAcceleration: encoder.hardware ? 'prefer-hardware' : 'prefer-software',
    })
    output.addVideoTrack(videoSource, { frameRate: fps, maximumPacketCount: frames + 8 })

    const audioFrames = audioFrameCount(durationS)
    let audioSource: AudioSampleSource | null = null
    if (withAudio) {
      audioSource = new AudioSampleSource({ codec: 'aac', bitrate: AUDIO_BITRATE })
      output.addAudioTrack(audioSource, {
        maximumPacketCount: Math.ceil(audioFrames / AAC_FRAME) + 64,
      })
    }
    await output.start()

    let audioDone = 0
    const pumpAudio = async (untilS: number) => {
      if (!audioSource) return
      const until = Math.min(audioFrames, Math.round(untilS * EXPORT_SAMPLE_RATE))
      while (audioDone < until) {
        const count = Math.min(AUDIO_BLOCK_FRAMES, audioFrames - audioDone)
        const blocks = await Promise.all(audioReaders.map((t) => t.reader.read(audioDone, count)))
        const mixed = mixBlocks(
          blocks.map((block, k) => ({ block, volume: audioReaders[k]?.volume ?? 0 })),
          count,
        )
        const sample = new AudioSample({
          data: toPlanar(mixed),
          format: 'f32-planar',
          numberOfChannels: EXPORT_CHANNELS,
          sampleRate: EXPORT_SAMPLE_RATE,
          timestamp: audioDone / EXPORT_SAMPLE_RATE,
        })
        try {
          await audioSource.add(sample)
        } finally {
          sample.close()
        }
        audioDone += count
      }
    }

    // Frames: output frame i shows the raw video at trim.start + i/fps.
    for (let i = 0; i < frames; i++) {
      checkAbort()
      await frameRenderer.render(exportFrameTimeMs(project.trim, i, fps))
      await videoSource.add(exportFrameTimestamp(i, fps), 1 / fps)
      await pumpAudio((i + 1) / fps + AUDIO_LEAD_S)
      options.onProgress?.((i + 1) / frames)
    }
    frameRenderer.dispose()
    await pumpAudio(Infinity)
    checkAbort()

    await output.finalize()
    writer.releaseLock()
    const path = await sink.commit()
    return {
      path,
      name: sink.name,
      warnings,
      durationMs: durationS * 1000,
      frames,
      elapsedMs: now() - started,
      encoder: { codec: encoder.codec, hardware: encoder.hardware },
    }
  } catch (error) {
    frameRenderer?.dispose()
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => {})
    }
    await sink.abort(error).catch(() => {})
    throw toExportError(sinkError ?? error)
  } finally {
    frameRenderer?.dispose()
    for (const input of inputs) input.dispose()
  }
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now()
}

interface AudioTrackReader {
  reader: TrackReader
  volume: number
}

/** Opens the audible tracks; an unreadable one is left out with a warning. */
async function openAudioTracks(
  tracks: readonly ExportAudioTrack[],
  trimStartS: number,
  inputs: Input[],
  warnings: ExportWarning[],
): Promise<AudioTrackReader[]> {
  const readers: AudioTrackReader[] = []
  for (const track of tracks) {
    if (!(track.volume > 0)) continue
    const input = openInput(track.file)
    inputs.push(input)
    let audioTrack: InputAudioTrack | null
    try {
      audioTrack = await input.getPrimaryAudioTrack()
      if (audioTrack && !(await audioTrack.canDecode())) audioTrack = null
    } catch {
      audioTrack = null
    }
    if (!audioTrack) {
      if (!warnings.includes('audio_unreadable')) warnings.push('audio_unreadable')
      continue
    }
    const startS = trimStartS - (track.offsetMs ?? 0) / 1000
    const samples = new AudioSampleSink(audioTrack).samples(Math.max(0, startS))
    const iterator = samples[Symbol.asyncIterator]()
    readers.push({
      volume: track.volume,
      reader: createTrackReader(
        async (): Promise<PcmChunk | null> => {
          const result = await iterator.next()
          if (result.done) return null
          const sample = result.value
          try {
            const channels: Float32Array[] = []
            const count = Math.min(2, sample.numberOfChannels)
            for (let c = 0; c < count; c++) {
              const data = new Float32Array(sample.numberOfFrames)
              sample.copyTo(data, { planeIndex: c, format: 'f32-planar' })
              channels.push(data)
            }
            return { timestamp: sample.timestamp, sampleRate: sample.sampleRate, channels }
          } finally {
            sample.close()
          }
        },
        { startS },
      ),
    })
  }
  return readers
}

async function canEncodeAac(): Promise<boolean> {
  const Encoder = globalThis.AudioEncoder
  if (!Encoder) return false
  const support = await Encoder.isConfigSupported({
    codec: AUDIO_CODEC,
    sampleRate: EXPORT_SAMPLE_RATE,
    numberOfChannels: EXPORT_CHANNELS,
    bitrate: AUDIO_BITRATE,
  }).catch(() => null)
  return support?.supported === true
}
