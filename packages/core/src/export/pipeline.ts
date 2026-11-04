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
  BlobSource,
  CanvasSource,
  CustomSource,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  StreamTarget,
  VideoSampleSink,
  WEBM,
  type InputAudioTrack,
  type InputVideoTrack,
  type Source,
  type StreamTargetChunk,
} from 'mediabunny'
import type { MouseEventRecord } from '../events/events.ts'
import type { SinkFile } from '../platform/sink.ts'
import type { Aspect, Fps, Project } from '../project/schema.ts'
import { outputSize, type Resolution } from '../render/layout.ts'
import { createRenderer, type Renderer } from '../render/renderer.ts'
import { buildScene, sceneFrame } from '../render/scene.ts'
import { webcamTimeMs } from '../render/webcam.ts'
import type { Context2D, Size } from '../render/types.ts'
import { visibleZooms } from '../zoom/visible.ts'
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
import { ExportError, exportErrorCode, type ExportWarning } from './errors.ts'
import {
  createFramePicker,
  exportFrameCount,
  exportFrameTimeMs,
  exportFrameTimestamp,
} from './timing.ts'

/** A file the platform can read at any offset (desktop: IPC to the main process). */
export interface RandomAccessFile {
  size(): Promise<number>
  /** bytes [start, end) */
  read(start: number, end: number): Promise<Uint8Array>
}

/** A raw media file: a Blob/File (extension: OPFS) or a random-access reader (desktop). */
export type MediaFile = Blob | RandomAccessFile

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
  /** microphone and computer sound; missing or muted tracks are simply left out */
  audio?: readonly ExportAudioTrack[]
  aspect: Aspect
  resolution: Resolution
  fps: Fps
  /** the editor's auto-zoom toggle (F-05); default on */
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

/** Container formats Kamo records to (desktop MP4/M4A, extension WebM). */
const INPUT_FORMATS = [MP4, QTFF, WEBM, MATROSKA]
const OUTPUT_CHUNK_BYTES = 4 * 2 ** 20
/** H.264 bits per pixel per frame: generous, because screen text blurs fast. */
const VIDEO_BITS_PER_PIXEL = 0.16
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
  let picker: ReturnType<typeof createFramePicker<FrameSample>> | null = null
  let webcamPicker: ReturnType<typeof createFramePicker<FrameSample>> | null = null
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

    // Source video.
    const videoInput = openInput(options.video)
    inputs.push(videoInput)
    const videoTrack = await videoInput.getPrimaryVideoTrack().catch(() => null)
    if (!videoTrack || !(await videoTrack.canDecode())) throw new ExportError('source_unreadable')

    // Encoders.
    const bitrate = Math.round(size.width * size.height * fps * VIDEO_BITS_PER_PIXEL)
    const encoder = await chooseVideoEncoder(size, fps, bitrate)
    if (!encoder) throw new ExportError('encoder_unavailable')
    if (!encoder.hardware) warnings.push('software_encoder')

    // Webcam (A-03): decoded alongside the screen, frame by frame at the matching time.
    const webcam = project.webcam
    let webcamTrack: InputVideoTrack | null = null
    if (webcam?.visible && options.webcam) {
      const input = openInput(options.webcam)
      inputs.push(input)
      webcamTrack = await input.getPrimaryVideoTrack().catch(() => null)
      if (webcamTrack && !(await webcamTrack.canDecode().catch(() => false))) webcamTrack = null
      if (!webcamTrack) warnings.push('webcam_unreadable')
    }

    const audioReaders = await openAudioTracks(options.audio ?? [], trimStartS, inputs, warnings)
    let withAudio = audioReaders.length > 0
    if (withAudio && !(await canEncodeAac())) {
      warnings.push('audio_encoder_unavailable')
      withAudio = false
    }
    checkAbort()

    // Renderer: the preview's, on an offscreen canvas of the output size (rule 11).
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new ExportError('failed')
    const renderer: Renderer = createRenderer(ctx as unknown as Context2D)
    const zooms = visibleZooms(project.zooms, { autoZoom: options.autoZoom ?? true })
    const scene = buildScene({ project, events: options.events, zooms })

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
    const videoSource = new CanvasSource(canvas, {
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
    const samples = new VideoSampleSink(videoTrack).samples(trimStartS)
    picker = createFramePicker<FrameSample>(samples[Symbol.asyncIterator]())
    if (webcam && webcamTrack) {
      const fromS = webcamTimeMs(webcam, project.trim.startMs) / 1000
      const webcamSamples = new VideoSampleSink(webcamTrack).samples(fromS)
      webcamPicker = createFramePicker<FrameSample>(webcamSamples[Symbol.asyncIterator]())
    }
    for (let i = 0; i < frames; i++) {
      checkAbort()
      const timeMs = exportFrameTimeMs(project.trim, i, fps)
      const frame = await picker.at(timeMs / 1000)
      if (!frame) throw new ExportError('source_unreadable')
      // Before its first frame the webcam shows that frame; past its end, the last one.
      const camera =
        webcam && webcamPicker ? await webcamPicker.at(webcamTimeMs(webcam, timeMs) / 1000) : null
      renderer.render(
        sceneFrame(
          scene,
          frame.toCanvasImageSource(),
          aspect,
          size,
          timeMs,
          camera
            ? {
                source: camera.toCanvasImageSource(),
                size: { width: camera.displayWidth, height: camera.displayHeight },
              }
            : null,
        ),
      )
      await videoSource.add(exportFrameTimestamp(i, fps), 1 / fps)
      await pumpAudio((i + 1) / fps + AUDIO_LEAD_S)
      options.onProgress?.((i + 1) / frames)
    }
    picker.release()
    picker = null
    webcamPicker?.release()
    webcamPicker = null
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
    picker?.release()
    webcamPicker?.release()
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => {})
    }
    await sink.abort(error).catch(() => {})
    throw toExportError(sinkError ?? error)
  } finally {
    for (const input of inputs) input.dispose()
  }
}

interface FrameSample {
  readonly timestamp: number
  readonly displayWidth: number
  readonly displayHeight: number
  close(): void
  toCanvasImageSource(): CanvasImageSource
}

function toExportError(error: unknown): ExportError {
  if (error instanceof ExportError) return error
  const code = exportErrorCode(error)
  return new ExportError(code, { cause: error })
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now()
}

function openInput(file: MediaFile): Input {
  return new Input({ source: toSource(file), formats: INPUT_FORMATS })
}

function toSource(file: MediaFile): Source {
  if (typeof Blob !== 'undefined' && file instanceof Blob) return new BlobSource(file)
  const reader = file as RandomAccessFile
  return new CustomSource({
    getSize: () => reader.size(),
    read: (start, end) => reader.read(start, end),
    // IPC has latency: read ahead in big steps when the access is sequential.
    prefetchProfile: 'network',
  })
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

export interface VideoEncoderChoice {
  codec: string
  hardware: boolean
}

/**
 * H.264 encoder for this size: hardware first (fast, D-011), else software with a warning.
 * High profile first, Main and Baseline as fallbacks for encoders that refuse High.
 */
export async function chooseVideoEncoder(
  size: Size,
  fps: number,
  bitrate: number,
): Promise<VideoEncoderChoice | null> {
  const Encoder = globalThis.VideoEncoder
  if (!Encoder) return null
  const level = size.width * size.height > 2_228_224 ? '33' : '28'
  const codecs = [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.42e0${level}`]
  for (const hardware of [true, false]) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = {
        codec,
        width: size.width,
        height: size.height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: hardware ? 'prefer-hardware' : 'prefer-software',
        avc: { format: 'avc' },
      }
      const support = await Encoder.isConfigSupported(config).catch(() => null)
      if (support?.supported) return { codec, hardware }
    }
  }
  return null
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
