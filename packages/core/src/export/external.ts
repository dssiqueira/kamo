// Export through an encoder outside WebCodecs (D-040): the optional "Video compatibility" pack
// (FFmpeg) on the desktop, for machines where WebCodecs has no H.264 encoder or it breaks.
// The picture is still painted by the preview's renderer (frames.ts, rule 11) and the sound
// still mixed by audio-mix.ts; only the encoding and the MP4 muxing happen elsewhere.
import type { Input } from 'mediabunny'
import type { ExternalEncodeSession, ExternalVideoEncoder } from '../platform/video-encoder.ts'
import { outputSize } from '../render/layout.ts'
import {
  audioFrameCount,
  EXPORT_CHANNELS,
  EXPORT_SAMPLE_RATE,
  mixBlocks,
  toInterleavedS16,
} from './audio-mix.ts'
import { exportBitrate } from './encoder-config.ts'
import { ExportError, toExportError, type ExportWarning } from './errors.ts'
import { openFrameRenderer, type FrameRenderer } from './frames.ts'
import { openAudioTracks, type ExportResult, type ExportVideoOptions } from './pipeline.ts'
import { exportFrameCount, exportFrameTimeMs } from './timing.ts'

export interface ExportVideoExternalOptions extends Omit<ExportVideoOptions, 'sink'> {
  encoder: ExternalVideoEncoder
  /** e.g. `Demo 16x9 1080p30.mp4` (exportFileName); the platform resolves collisions */
  fileName: string
}

/** Audio is handed over in 1s blocks (192kB of 16-bit stereo each). */
const AUDIO_BLOCK_FRAMES = EXPORT_SAMPLE_RATE
/** Share of the progress bar the sound takes when there is some (it goes first). */
const AUDIO_PROGRESS_SHARE = 0.05

/**
 * Exports one format through `encoder`. Throws ExportError (`aborted` on cancel); the
 * encoder's file is always finished or aborted before this returns or throws.
 */
export async function exportVideoExternal(
  options: ExportVideoExternalOptions,
): Promise<ExportResult> {
  const started = globalThis.performance?.now() ?? Date.now()
  const { project, aspect, resolution, fps, signal } = options
  const warnings: ExportWarning[] = ['compatibility_encoder']
  const inputs: Input[] = []
  let frameRenderer: FrameRenderer | null = null
  const checkAbort = () => {
    if (signal?.aborted) throw new ExportError('aborted', { cause: signal.reason })
  }

  try {
    checkAbort()
    const size = outputSize(aspect, resolution)
    const frames = exportFrameCount(project.trim, fps)
    const durationS = frames / fps
    const renderer = await openFrameRenderer(
      {
        project,
        events: options.events,
        video: options.video,
        webcam: options.webcam ?? null,
        backgroundImage: options.backgroundImage ?? null,
        captions: options.captions ?? null,
        aspect,
        size,
        // Every frame is read back as pixels for the encoder.
        readback: true,
        ...(options.autoZoom === undefined ? {} : { autoZoom: options.autoZoom }),
      },
      warnings,
    )
    frameRenderer = renderer
    const readers = await openAudioTracks(
      options.audio ?? [],
      project.trim.startMs / 1000,
      inputs,
      warnings,
    )
    checkAbort()
    const session = await options.encoder.open({
      fileName: options.fileName,
      width: size.width,
      height: size.height,
      fps,
      bitrate: exportBitrate(size, fps),
      audio:
        readers.length > 0 ? { sampleRate: EXPORT_SAMPLE_RATE, channels: EXPORT_CHANNELS } : null,
    })
    const encoded = await encodeExternal({
      session,
      frames,
      audioFrames: readers.length > 0 ? audioFrameCount(durationS) : 0,
      readAudio: async (start, count) => {
        const blocks = await Promise.all(readers.map((t) => t.reader.read(start, count)))
        return toInterleavedS16(
          mixBlocks(
            blocks.map((block, k) => ({ block, volume: readers[k]?.volume ?? 0 })),
            count,
          ),
        )
      },
      renderFrame: async (index) => {
        await renderer.render(exportFrameTimeMs(project.trim, index, fps))
        const { data } = renderer.context.getImageData(0, 0, size.width, size.height)
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      },
      checkAbort,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    })
    return {
      path: encoded.path,
      name: session.name,
      warnings,
      durationMs: durationS * 1000,
      frames,
      elapsedMs: (globalThis.performance?.now() ?? Date.now()) - started,
      encoder: { codec: encoded.codec, hardware: encoded.hardware },
    }
  } catch (error) {
    throw toExportError(error)
  } finally {
    frameRenderer?.dispose()
    for (const input of inputs) input.dispose()
  }
}

export interface EncodeExternalOptions {
  session: ExternalEncodeSession
  frames: number
  /** 0: no sound */
  audioFrames: number
  /** interleaved 16-bit stereo for audio frames [start, start + count) */
  readAudio(start: number, count: number): Promise<Int16Array>
  /** RGBA pixels of output frame `index` (ascending calls) */
  renderFrame(index: number): Promise<Uint8Array>
  /** throws ExportError('aborted') when cancelled */
  checkAbort(): void
  onProgress?(fraction: number): void
}

/**
 * Feeds a session: all the sound first (the encoder reads it as a second input), then every
 * frame, then finishes. Any failure or cancel aborts the session (its file is deleted) and
 * rethrows as an ExportError.
 */
export async function encodeExternal(
  options: EncodeExternalOptions,
): Promise<{ path: string; codec: string; hardware: boolean }> {
  const { session, frames, audioFrames, checkAbort } = options
  const audioShare = audioFrames > 0 ? AUDIO_PROGRESS_SHARE : 0
  try {
    for (let done = 0; done < audioFrames;) {
      checkAbort()
      const count = Math.min(AUDIO_BLOCK_FRAMES, audioFrames - done)
      await options.session.writeAudio(await options.readAudio(done, count))
      done += count
      options.onProgress?.((done / audioFrames) * audioShare)
    }
    for (let i = 0; i < frames; i++) {
      checkAbort()
      await session.writeFrame(await options.renderFrame(i))
      options.onProgress?.(audioShare + ((i + 1) / frames) * (1 - audioShare))
    }
    checkAbort()
    return await session.finish()
  } catch (error) {
    await session.abort(error).catch(() => {})
    throw toExportError(error)
  }
}
