// GIF export (A-02): sizes, timing, the size estimate and the frame encoder. No FFmpeg
// (rule 6): palette quantization and LZW come from `gifenc` (MIT, ~9kB, no dependencies), and
// the export runs the encoder in a worker (gif.worker.ts). Pure, so it is tested in Node.
import { GIFEncoder, applyPalette, quantize, type Palette, type RgbColor } from './gifenc-lib.ts'
import type { Aspect, CaptionSettings } from '../project/schema.ts'
import { CAPTION_LOOKS } from '../render/captions.ts'
import { outputSize } from '../render/layout.ts'
import type { Size } from '../render/types.ts'

/** Frame rates offered for a GIF (A-02: up to 15fps). */
export const GIF_FPS_CHOICES = [10, 15] as const
export type GifFps = (typeof GIF_FPS_CHOICES)[number]
export const GIF_MAX_FPS = 15
/** Widest GIF (A-02). */
export const GIF_MAX_WIDTH = 1280
/** The GIF is the 1080p frame scaled by 2/3: 1280×720, 720×720 or 720×1280. */
export const GIF_RESOLUTION = '720p' as const

/** Output size of a GIF in each format; never wider than GIF_MAX_WIDTH. */
export function gifSize(aspect: Aspect): Size {
  const full = outputSize(aspect, '1080p')
  const scale = Math.min(2 / 3, GIF_MAX_WIDTH / full.width)
  return { width: Math.round(full.width * scale), height: Math.round(full.height * scale) }
}

/**
 * Delay of frame `index` in ms. GIF delays are in hundredths of a second, so 15fps cannot be
 * 6.67 each: the delays alternate 70/60ms so frame n always starts at round(n/fps) and the
 * GIF lasts exactly as long as the video.
 */
export function gifFrameDelayMs(index: number, fps: number): number {
  const at = (n: number) => Math.round((n * 100) / fps)
  return (at(index + 1) - at(index)) * 10
}

/**
 * Average compressed bits per pixel per frame of a Kamo GIF: the first frame is a full
 * image, the next ones only the pixels that changed (the rest is transparent and costs
 * almost nothing). Measured on real 15fps exports of an 18s screen recording with zooms and
 * a webcam bubble (step 28): 0.43 (16:9), 0.65 (9:16 split) and 0.88 (1:1, the most cropped).
 */
export const GIF_BITS_PER_PIXEL_FRAME = 0.6
/** Bytes per frame that do not depend on the picture: local palette and headers. */
const GIF_FRAME_OVERHEAD = 800

/** Above this the export sheet warns (many sites and chat apps refuse bigger GIFs). */
export const GIF_LARGE_BYTES = 10_000_000

/**
 * Estimated file size of a GIF (A-02), shown before exporting. Screen recordings vary a lot
 * (a still screen compresses to almost nothing, constant zooms repaint every pixel), so this
 * is an order of magnitude, not a promise.
 */
export function estimateGifBytes({
  size,
  fps,
  durationMs,
}: {
  size: Size
  fps: number
  durationMs: number
}): number {
  const frames = Math.max(1, Math.ceil((Math.max(0, durationMs) * fps) / 1000 - 1e-6))
  const pixels = size.width * size.height
  // The first frame is a full picture: about 2 bits per pixel for screen content.
  const first = (pixels * 2) / 8
  const rest = ((frames - 1) * pixels * GIF_BITS_PER_PIXEL_FRAME) / 8
  return Math.round(first + rest + frames * GIF_FRAME_OVERHEAD)
}

/** `#RGB`, `#RRGGBB`, `#RRGGBBAA` or `rgb(a)(r, g, b[, a])` → [r, g, b]; null for anything else. */
export function parseRgb(color: string): RgbColor | null {
  const text = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text)
  if (short) return [1, 2, 3].map((i) => Number.parseInt(`${short[i]}${short[i]}`, 16)) as RgbColor
  const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text)
  if (hex) {
    const n = Number.parseInt(hex[1] as string, 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(text)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

/** Every color string anywhere in a value (a caption look and its nested parts), in order. */
function collectColors(value: unknown, into: RgbColor[]): RgbColor[] {
  if (typeof value === 'string') {
    const rgb = parseRgb(value)
    if (rgb) into.push(rgb)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectColors(item, into)
  }
  return into
}

/**
 * Colors every frame's palette keeps exactly (A-06 on a GIF): everything the burned-in
 * captions' look paints (text, box or band, outline, backing copy, shadow or glow), read from
 * the look itself so new styles are covered. Quantization picks colors by how many pixels use
 * them, and caption text is a few thin strokes, so without this the white could become a
 * light grey of the screen. Text color first; at most GIF_MAX_RESERVED_COLORS.
 */
export function captionPaletteColors(settings: Pick<CaptionSettings, 'preset'>): RgbColor[] {
  const colors = collectColors(CAPTION_LOOKS[settings.preset], [])
  return colors
    .filter((c, i) => colors.findIndex((o) => o.join() === c.join()) === i)
    .slice(0, GIF_MAX_RESERVED_COLORS)
}

/** Palette slots kept for reserved colors; the other ~240 follow the picture. */
export const GIF_MAX_RESERVED_COLORS = 16

/**
 * Largest per-channel difference under which a pixel counts as unchanged and is left
 * transparent (the previous frame shows through). Absorbs the recording's compression noise
 * on still screens. Compared with the color the viewer is showing (the palette color the pixel
 * was last encoded with), not its source color: otherwise a pixel whose source stays put but
 * was shown a few shades off keeps that error forever, and faint traces of earlier frames
 * (text before a zoom) never go away.
 */
export const GIF_DIFF_TOLERANCE = 6

export interface GifFrameEncoderOptions {
  width: number
  height: number
  /** colors kept in every palette, e.g. captionPaletteColors() */
  reservedColors?: readonly RgbColor[]
  tolerance?: number
}

export interface GifFrameEncoder {
  /** Encodes one RGBA frame; returns its bytes (the first call includes the header). */
  addFrame(rgba: Uint8Array | Uint8ClampedArray, delayMs: number): Uint8Array
  /** The trailer that ends the file. */
  finish(): Uint8Array
}

/**
 * Streams a looping GIF one frame at a time. The first frame is a full image; every next
 * frame keeps only the pixels that changed and makes the rest transparent ("do not dispose"),
 * with its own palette quantized from those pixels only. A frame with no change at all is a
 * 1×1 transparent image, so a still screen costs a few bytes per frame. No dithering: it
 * would add noise to flat screen colors and defeat LZW.
 */
export function createGifFrameEncoder({
  width,
  height,
  reservedColors = [],
  tolerance = GIF_DIFF_TOLERANCE,
}: GifFrameEncoderOptions): GifFrameEncoder {
  const gif = GIFEncoder({ auto: false, initialCapacity: 1 << 20 })
  const pixels = width * height
  const reserved = reservedColors
    .slice(0, GIF_MAX_RESERVED_COLORS)
    .map((c) => [c[0], c[1], c[2]] as RgbColor)
  /** what the viewer shows for each pixel: the palette color it was last encoded with */
  let last: Uint8Array | null = null

  /** Records the palette colors `index` paints at the listed pixels (all pixels when null). */
  const remember = (
    shown: Uint8Array,
    palette: Palette,
    index: Uint8Array,
    at: Uint32Array | null,
  ): void => {
    for (let k = 0; k < index.length; k++) {
      const color = palette[index[k] as number] as RgbColor
      const i = (at ? (at[k] as number) : k) * 4
      shown[i] = color[0]
      shown[i + 1] = color[1]
      shown[i + 2] = color[2]
    }
  }

  const take = (): Uint8Array => {
    const bytes = gif.bytes()
    gif.reset()
    return bytes
  }
  const paletteFor = (rgba: Uint8Array, slots: number): Palette => {
    const colors = rgba.length > 0 ? quantize(rgba, Math.max(2, slots - reserved.length)) : []
    return [...colors, ...reserved]
  }

  return {
    addFrame(input, delayMs) {
      if (input.length !== pixels * 4) throw new Error('gif: frame size mismatch')
      const rgba = new Uint8Array(input.buffer, input.byteOffset, input.length)

      if (!last) {
        // quantize() reads the bytes as 32-bit words: give it its own aligned copy.
        const palette = paletteFor(rgba.slice(), 256)
        const index = applyPalette(rgba.slice(), palette)
        last = new Uint8Array(pixels * 4)
        remember(last, palette, index, null)
        gif.writeHeader()
        gif.writeFrame(index, width, height, {
          palette,
          delay: delayMs,
          first: true,
          repeat: 0,
        })
        return take()
      }

      const changed = new Uint8Array(pixels)
      let count = 0
      for (let p = 0, i = 0; p < pixels; p++, i += 4) {
        if (
          Math.abs((rgba[i] as number) - (last[i] as number)) > tolerance ||
          Math.abs((rgba[i + 1] as number) - (last[i + 1] as number)) > tolerance ||
          Math.abs((rgba[i + 2] as number) - (last[i + 2] as number)) > tolerance
        ) {
          changed[p] = 1
          count++
        }
      }

      if (count === 0) {
        gif.writeFrame(new Uint8Array([0]), 1, 1, {
          palette: [
            [0, 0, 0],
            [0, 0, 0],
          ],
          delay: delayMs,
          transparent: true,
          transparentIndex: 0,
          dispose: 1,
        })
        return take()
      }

      const compact = new Uint8Array(count * 4)
      const at = new Uint32Array(count)
      for (let p = 0, k = 0, n = 0; p < pixels; p++) {
        if (!changed[p]) continue
        const i = p * 4
        compact[k] = rgba[i] as number
        compact[k + 1] = rgba[i + 1] as number
        compact[k + 2] = rgba[i + 2] as number
        compact[k + 3] = 255
        at[n++] = p
        k += 4
      }
      // One slot stays free for the transparent index.
      const palette = paletteFor(compact.slice(), 255)
      const compactIndex = applyPalette(compact, palette)
      remember(last, palette, compactIndex, at)
      const transparentIndex = palette.length
      const index = new Uint8Array(pixels).fill(transparentIndex)
      for (let p = 0, k = 0; p < pixels; p++) {
        if (changed[p]) index[p] = compactIndex[k++] as number
      }
      gif.writeFrame(index, width, height, {
        palette: [...palette, [0, 0, 0]],
        delay: delayMs,
        transparent: true,
        transparentIndex,
        dispose: 1,
      })
      return take()
    },
    finish() {
      gif.finish()
      return take()
    },
  }
}
