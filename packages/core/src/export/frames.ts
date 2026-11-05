// The picture half of an export, shared by the MP4 (pipeline.ts) and the GIF (gif-export.ts):
// open the raw recording, the webcam and the background image, build the preview's scene
// (zooms, captions) and paint any output time on an offscreen canvas with the preview's
// renderer (rule 11). The two exports only differ in the size, the frame rate and the encoder.
import {
  BlobSource,
  CustomSource,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  VideoSampleSink,
  WEBM,
  type InputVideoTrack,
  type Source,
} from 'mediabunny'
import type { MouseEventRecord } from '../events/events.ts'
import { MAX_BACKGROUND_IMAGE_BYTES } from '../project/background-image.ts'
import {
  projectAutoZoom,
  type Aspect,
  type CaptionSettings,
  type Project,
} from '../project/schema.ts'
import {
  buildCaptionTrack,
  CAPTION_LOOKS,
  captionFontPx,
  type CaptionTrack,
} from '../render/captions.ts'
import { createRenderer, type Renderer } from '../render/renderer.ts'
import { buildScene, sceneFrame } from '../render/scene.ts'
import type { Context2D, Size } from '../render/types.ts'
import type { BackgroundImage } from '../render/wallpapers.ts'
import { webcamTimeMs } from '../render/webcam.ts'
import type { Transcript } from '../transcript/transcript.ts'
import { visibleZooms } from '../zoom/visible.ts'
import { ExportError, type ExportWarning } from './errors.ts'
import { createFramePicker } from './timing.ts'

/** A file the platform can read at any offset (desktop: IPC to the main process). */
export interface RandomAccessFile {
  size(): Promise<number>
  /** bytes [start, end) */
  read(start: number, end: number): Promise<Uint8Array>
}

/** A raw media file: a Blob/File (extension: OPFS) or a random-access reader (desktop). */
export type MediaFile = Blob | RandomAccessFile

/** Container formats Kamo records to (desktop MP4/M4A, extension WebM). */
const INPUT_FORMATS = [MP4, QTFF, WEBM, MATROSKA]

export function openInput(file: MediaFile): Input {
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

export interface FrameRendererOptions {
  project: Project
  events: readonly MouseEventRecord[]
  /** the raw recording (screen.mp4 / screen.webm) */
  video: MediaFile
  /** webcam.mp4 (A-03); unreadable → no bubble and a warning */
  webcam?: MediaFile | null
  /** the background image file (A-04); unreadable → the fallback color and a warning */
  backgroundImage?: MediaFile | null
  /** captions to burn in (A-06); `enabled` is ignored */
  captions?: { transcript: Transcript; settings: CaptionSettings } | null
  aspect: Aspect
  /** the output picture size */
  size: Size
  /** the editor's auto-zoom toggle (F-05); default: `project.autoZoom` */
  autoZoom?: boolean
  /** the canvas is read back every frame (the GIF): keep it in CPU memory */
  readback?: boolean
}

export interface FrameRenderer {
  readonly canvas: OffscreenCanvas
  readonly context: OffscreenCanvasRenderingContext2D
  /**
   * Paints the output at raw-video time `timeMs` (ascending calls only: the decoders read
   * forward). Throws `source_unreadable` when the recording has no frame for it.
   */
  render(timeMs: number): Promise<void>
  /** Closes the decoders, the inputs and the background image. Idempotent. */
  dispose(): void
}

interface FrameSample {
  readonly timestamp: number
  readonly displayWidth: number
  readonly displayHeight: number
  /** what the decoder tagged the frame with */
  readonly colorSpace: ColorSpaceFields
  close(): void
  toCanvasImageSource(): CanvasImageSource
  toVideoFrame(): VideoFrame
}

interface ColorSpaceFields {
  primaries?: VideoColorPrimaries | null | undefined
  transfer?: VideoTransferCharacteristics | null | undefined
  matrix?: VideoMatrixCoefficients | null | undefined
  fullRange?: boolean | null | undefined
}

const COLOR_FIELDS = ['primaries', 'transfer', 'matrix', 'fullRange'] as const

/**
 * The color space a decoded frame should carry when the decoder tagged it differently from
 * the container (null when they agree). Chromium's VP8/VP9 decoder ignores the WebM Colour
 * element and tags MediaRecorder's full-range frames as limited range, so drawing them
 * expands the range a second time (beige 244,241,232 → white): the extension's screen.webm
 * came out brighter than the preview, whose <video> honors the container (rule 11).
 */
export function colorSpaceCorrection(
  frame: ColorSpaceFields,
  track: ColorSpaceFields,
): VideoColorSpaceInit | null {
  let differs = false
  const merged: Record<string, unknown> = {}
  for (const key of COLOR_FIELDS) {
    const wanted = track[key]
    const current = frame[key] ?? undefined
    if (wanted !== undefined && wanted !== null && wanted !== current) {
      differs = true
      merged[key] = wanted
    } else if (current !== undefined) {
      merged[key] = current
    }
  }
  return differs ? (merged as VideoColorSpaceInit) : null
}

/**
 * Draws samples with the track's color space (colorSpaceCorrection): a sample whose tag is
 * wrong is copied into a new VideoFrame with the right one, once per sample (a 30fps
 * recording exported at 60 shows each sample twice). Samples already right go straight
 * through, so H.264 recordings cost nothing extra.
 */
function createColorSource(track: ColorSpaceFields) {
  let lastSample: FrameSample | null = null
  let lastFrame: VideoFrame | null = null
  const drop = () => {
    lastFrame?.close()
    lastFrame = null
    lastSample = null
  }
  return {
    async source(sample: FrameSample): Promise<CanvasImageSource> {
      if (sample === lastSample && lastFrame) return lastFrame
      drop()
      const colorSpace = colorSpaceCorrection(sample.colorSpace, track)
      if (!colorSpace || typeof VideoFrame === 'undefined') return sample.toCanvasImageSource()
      const frame = sample.toVideoFrame()
      try {
        const format = frame.format
        if (!format) return sample.toCanvasImageSource()
        // copyTo copies the visible rect: the copy's coded size is that rect.
        const data = new Uint8Array(frame.allocationSize())
        const layout = await frame.copyTo(data)
        const rect = frame.visibleRect
        lastFrame = new VideoFrame(data, {
          format,
          codedWidth: rect?.width ?? frame.codedWidth,
          codedHeight: rect?.height ?? frame.codedHeight,
          timestamp: frame.timestamp,
          layout,
          displayWidth: frame.displayWidth,
          displayHeight: frame.displayHeight,
          colorSpace,
        })
        lastSample = sample
        return lastFrame
      } finally {
        frame.close()
      }
    },
    release: drop,
  }
}

/**
 * Opens everything the picture needs and returns a renderer for output times. Warnings
 * (webcam or background unreadable) are pushed to `warnings`. On failure everything opened
 * so far is closed before it throws.
 */
export async function openFrameRenderer(
  options: FrameRendererOptions,
  warnings: ExportWarning[],
): Promise<FrameRenderer> {
  const { project, aspect, size } = options
  const inputs: Input[] = []
  let background: (BackgroundImage & { source: ImageBitmap }) | null = null
  let picker: ReturnType<typeof createFramePicker<FrameSample>> | null = null
  let webcamPicker: ReturnType<typeof createFramePicker<FrameSample>> | null = null
  let screenColors: ReturnType<typeof createColorSource> | null = null
  let webcamColors: ReturnType<typeof createColorSource> | null = null
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    screenColors?.release()
    webcamColors?.release()
    picker?.release()
    webcamPicker?.release()
    for (const input of inputs) input.dispose()
    background?.source.close()
  }

  try {
    const videoInput = openInput(options.video)
    inputs.push(videoInput)
    const videoTrack = await videoInput.getPrimaryVideoTrack().catch(() => null)
    if (!videoTrack || !(await videoTrack.canDecode())) throw new ExportError('source_unreadable')

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

    // Renderer: the preview's, on an offscreen canvas of the output size (rule 11).
    const canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: options.readback === true,
    })
    if (!context) throw new ExportError('failed')
    const renderer: Renderer = createRenderer(context as unknown as Context2D)
    const zooms = visibleZooms(project.zooms, {
      autoZoom: options.autoZoom ?? projectAutoZoom(project),
    })
    const captions = options.captions
      ? buildCaptionTrack(options.captions.transcript, {
          ...options.captions.settings,
          enabled: true,
        })
      : null
    if (captions) await loadCaptionFont(captions, size)
    const scene = buildScene({ project, events: options.events, zooms, captions })
    if (project.style.background.kind === 'image') {
      background = options.backgroundImage ? await decodeImage(options.backgroundImage) : null
      if (background) scene.backgroundImage = background
      else warnings.push('background_unreadable')
    }

    // Output frame i shows the raw video at trim.start + i/fps.
    const trimStartS = project.trim.startMs / 1000
    const samples = new VideoSampleSink(videoTrack).samples(trimStartS)
    picker = createFramePicker<FrameSample>(samples[Symbol.asyncIterator]())
    screenColors = createColorSource(await videoTrack.getColorSpace().catch(() => ({})))
    if (webcam && webcamTrack) {
      webcamColors = createColorSource(await webcamTrack.getColorSpace().catch(() => ({})))
      const fromS = webcamTimeMs(webcam, project.trim.startMs) / 1000
      const webcamSamples = new VideoSampleSink(webcamTrack).samples(fromS)
      webcamPicker = createFramePicker<FrameSample>(webcamSamples[Symbol.asyncIterator]())
    }

    return {
      canvas,
      context,
      async render(timeMs) {
        const frame = await picker?.at(timeMs / 1000)
        if (!frame) throw new ExportError('source_unreadable')
        // Before its first frame the webcam shows that frame; past its end, the last one.
        const camera =
          webcam && webcamPicker ? await webcamPicker.at(webcamTimeMs(webcam, timeMs) / 1000) : null
        const screen = (await screenColors?.source(frame)) ?? frame.toCanvasImageSource()
        const cameraSource = camera
          ? ((await webcamColors?.source(camera)) ?? camera.toCanvasImageSource())
          : null
        renderer.render(
          sceneFrame(
            scene,
            screen,
            aspect,
            size,
            timeMs,
            camera && cameraSource
              ? {
                  source: cameraSource,
                  size: { width: camera.displayWidth, height: camera.displayHeight },
                }
              : null,
          ),
        )
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}

/** Decodes the whole image file once (A-04); null when it cannot be read or decoded. */
async function decodeImage(
  file: MediaFile,
): Promise<(BackgroundImage & { source: ImageBitmap }) | null> {
  try {
    const blob =
      typeof Blob !== 'undefined' && file instanceof Blob
        ? file
        : await (async () => {
            const reader = file as RandomAccessFile
            const size = await reader.size()
            if (size > MAX_BACKGROUND_IMAGE_BYTES) return null
            return new Blob([(await reader.read(0, size)) as Uint8Array<ArrayBuffer>])
          })()
    if (!blob || blob.size > MAX_BACKGROUND_IMAGE_BYTES) return null
    const bitmap = await createImageBitmap(blob)
    if (!(bitmap.width > 0 && bitmap.height > 0)) {
      bitmap.close()
      return null
    }
    return { source: bitmap, size: { width: bitmap.width, height: bitmap.height } }
  } catch {
    return null
  }
}

/**
 * The canvas only draws with a font the page has loaded; Inter is loaded by the app's CSS,
 * but maybe not yet at this weight. Without a FontFaceSet (a worker) the fallback is used.
 */
async function loadCaptionFont(track: CaptionTrack, output: Size): Promise<void> {
  const fonts = (globalThis as { document?: { fonts?: { load(font: string): Promise<unknown> } } })
    .document?.fonts
  if (!fonts) return
  const look = CAPTION_LOOKS[track.settings.preset]
  const px = Math.round(captionFontPx(output, track.settings))
  await fonts.load(`${look.weight} ${px}px ${track.fontFamily}`).catch(() => {})
}
