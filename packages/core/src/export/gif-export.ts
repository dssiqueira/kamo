// GIF export (A-02): the same picture as the MP4 (frames.ts: the preview's scene and renderer,
// with captions burned in when asked), painted at 10 or 15fps and at most 1280px wide, then
// quantized and LZW-encoded in a worker and streamed into the platform's FileSink. No sound.
import type { MouseEventRecord } from '../events/events.ts'
import type { SinkFile } from '../platform/sink.ts'
import type { Aspect, CaptionSettings, Project } from '../project/schema.ts'
import type { Transcript } from '../transcript/transcript.ts'
import { ExportError, toExportError, type ExportWarning } from './errors.ts'
import { openFrameRenderer, type FrameRenderer, type MediaFile } from './frames.ts'
import {
  captionPaletteColors,
  createGifFrameEncoder,
  gifFrameDelayMs,
  gifSize,
  type GifFps,
  type GifFrameEncoderOptions,
} from './gif.ts'
import type { GifWorkerReply, GifWorkerRequest } from './gif-worker-protocol.ts'
import type { ExportResult } from './pipeline.ts'
import { exportFrameCount, exportFrameTimeMs } from './timing.ts'

export interface ExportGifOptions {
  project: Project
  events: readonly MouseEventRecord[]
  video: MediaFile
  webcam?: MediaFile | null
  backgroundImage?: MediaFile | null
  /** captions to burn in (A-06); a GIF cannot carry an .srt */
  captions?: { transcript: Transcript; settings: CaptionSettings } | null
  aspect: Aspect
  fps: GifFps
  autoZoom?: boolean
  sink: SinkFile
  signal?: AbortSignal
  onProgress?(fraction: number): void
}

/** Frames handed to the encoder before waiting for the oldest: paint and encode overlap. */
const MAX_IN_FLIGHT = 3
/** A worker that does not answer its first message by then is replaced by inline encoding. */
const WORKER_START_TIMEOUT_MS = 10_000

/**
 * Exports one format as a looping GIF. Throws ExportError (code `aborted` on cancel); the
 * sink file is always committed or aborted before this returns or throws.
 */
export async function exportGif(options: ExportGifOptions): Promise<ExportResult> {
  const started = globalThis.performance?.now() ?? Date.now()
  const { project, aspect, fps, sink, signal } = options
  const warnings: ExportWarning[] = []
  let frameRenderer: FrameRenderer | null = null
  let encoder: AsyncGifEncoder | null = null
  let sinkError: unknown = null

  const checkAbort = () => {
    if (signal?.aborted) throw new ExportError('aborted', { cause: signal.reason })
  }

  try {
    checkAbort()
    const size = gifSize(aspect)
    const frames = exportFrameCount(project.trim, fps)
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
        readback: true,
        ...(options.autoZoom === undefined ? {} : { autoZoom: options.autoZoom }),
      },
      warnings,
    )
    encoder = await startEncoder({
      width: size.width,
      height: size.height,
      // Burned-in captions keep their exact colors in every frame's palette.
      reservedColors: options.captions ? captionPaletteColors(options.captions.settings) : [],
    })
    checkAbort()

    const writer = sink.stream.getWriter()
    let position = 0
    const write = async (bytes: Uint8Array) => {
      if (bytes.length === 0) return
      try {
        await writer.write({ type: 'write', data: bytes, position })
      } catch (error) {
        sinkError = error
        throw error
      }
      position += bytes.length
    }

    const pending: Promise<Uint8Array>[] = []
    for (let i = 0; i < frames; i++) {
      checkAbort()
      await frameRenderer.render(exportFrameTimeMs(project.trim, i, fps))
      const image = frameRenderer.context.getImageData(0, 0, size.width, size.height)
      pending.push(encoder.addFrame(image.data, gifFrameDelayMs(i, fps)))
      while (pending.length >= MAX_IN_FLIGHT)
        await write(await (pending.shift() as Promise<Uint8Array>))
      options.onProgress?.((i + 1) / frames)
    }
    frameRenderer.dispose()
    for (const bytes of pending.splice(0)) await write(await bytes)
    await write(await encoder.finish())
    checkAbort()

    writer.releaseLock()
    const path = await sink.commit()
    return {
      path,
      name: sink.name,
      warnings,
      durationMs: (frames / fps) * 1000,
      frames,
      elapsedMs: (globalThis.performance?.now() ?? Date.now()) - started,
      encoder: { codec: 'gif', hardware: false },
    }
  } catch (error) {
    await sink.abort(error).catch(() => {})
    throw toExportError(sinkError ?? error)
  } finally {
    frameRenderer?.dispose()
    encoder?.close()
  }
}

interface AsyncGifEncoder {
  addFrame(rgba: Uint8ClampedArray, delayMs: number): Promise<Uint8Array>
  finish(): Promise<Uint8Array>
  close(): void
}

/** The worker encoder, or the same encoder on this thread when no worker can start. */
async function startEncoder(options: GifFrameEncoderOptions): Promise<AsyncGifEncoder> {
  const worker = await startWorker(options).catch(() => null)
  if (worker) return worker
  const inline = createGifFrameEncoder(options)
  return {
    addFrame: async (rgba, delayMs) => inline.addFrame(rgba, delayMs),
    finish: async () => inline.finish(),
    close: () => {},
  }
}

async function startWorker(options: GifFrameEncoderOptions): Promise<AsyncGifEncoder | null> {
  if (typeof Worker === 'undefined') return null
  // Bundlers (Vite) emit the worker from this pattern. A build where the file cannot load
  // (e.g. the published package) fails the first message and falls back to inline encoding.
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' })
  const queue: { resolve(bytes: Uint8Array): void; reject(error: Error): void }[] = []
  let failure: Error | null = null
  const fail = (error: Error) => {
    failure ??= error
    for (const waiting of queue.splice(0)) waiting.reject(failure)
  }
  worker.onmessage = ({ data }: MessageEvent<GifWorkerReply>) => {
    const waiting = queue.shift()
    if (!waiting) return
    if (data.type === 'bytes') waiting.resolve(data.bytes)
    else waiting.reject(new Error(data.message))
  }
  worker.onerror = (event) => {
    event.preventDefault()
    fail(new Error(`gif worker: ${event.message || 'failed to start'}`))
  }
  const send = (message: GifWorkerRequest, transfer: Transferable[] = []) =>
    new Promise<Uint8Array>((resolve, reject) => {
      if (failure) {
        reject(failure)
        return
      }
      queue.push({ resolve, reject })
      worker.postMessage(message, transfer)
    })

  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      send({ type: 'init', options }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('gif worker: no answer')),
          WORKER_START_TIMEOUT_MS,
        )
      }),
    ]).finally(() => clearTimeout(timer))
  } catch (error) {
    worker.terminate()
    throw error
  }

  return {
    addFrame: (rgba, delayMs) =>
      send({ type: 'frame', rgba: rgba.buffer as ArrayBuffer, delayMs }, [
        rgba.buffer as ArrayBuffer,
      ]),
    finish: () => send({ type: 'finish' }),
    close: () => {
      worker.terminate()
      fail(new Error('gif worker: closed'))
    },
  }
}
