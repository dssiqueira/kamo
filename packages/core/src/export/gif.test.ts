import { describe, expect, it } from 'vitest'
import {
  captionPaletteColors,
  createGifFrameEncoder,
  estimateGifBytes,
  GIF_DIFF_TOLERANCE,
  GIF_LARGE_BYTES,
  GIF_MAX_RESERVED_COLORS,
  GIF_MAX_WIDTH,
  gifFrameDelayMs,
  gifSize,
  parseRgb,
} from './gif.ts'
import { exportFileName } from './filename.ts'
import { CAPTION_LOOKS, CAPTION_PRESETS } from '../render/captions.ts'

interface DecodedFrame {
  delayMs: number
  transparentIndex: number | null
  dispose: number
  width: number
  height: number
  palette: number[][]
  index: Uint8Array
}

/** A small GIF reader for the tests: walks the blocks and LZW-decodes every image. */
function decodeGif(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a')
  const width = u16(6)
  const height = u16(8)
  const packed = bytes[10] as number
  let pos = 13
  const table = (size: number) => {
    const colors: number[][] = []
    for (let i = 0; i < size; i++) colors.push([...bytes.subarray(pos + i * 3, pos + i * 3 + 3)])
    pos += size * 3
    return colors
  }
  const global = packed & 0x80 ? table(1 << ((packed & 7) + 1)) : []
  const frames: DecodedFrame[] = []
  let gce = { delayMs: 0, transparentIndex: null as number | null, dispose: 0 }
  const subBlocks = () => {
    const parts: number[] = []
    while (bytes[pos] !== 0) {
      const size = bytes[pos] as number
      parts.push(...bytes.subarray(pos + 1, pos + 1 + size))
      pos += size + 1
    }
    pos++
    return parts
  }
  for (;;) {
    const block = bytes[pos++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = bytes[pos++]
      if (label === 0xf9) {
        const flags = bytes[pos + 1] as number
        gce = {
          dispose: (flags >> 2) & 7,
          delayMs: u16(pos + 2) * 10,
          transparentIndex: flags & 1 ? (bytes[pos + 4] as number) : null,
        }
        pos += 6
      } else subBlocks()
      continue
    }
    expect(block).toBe(0x2c)
    const w = u16(pos + 4)
    const h = u16(pos + 6)
    const flags = bytes[pos + 8] as number
    pos += 9
    const palette = flags & 0x80 ? table(1 << ((flags & 7) + 1)) : global
    const minCode = bytes[pos++] as number
    const index = lzwDecode(subBlocks(), minCode, w * h)
    frames.push({ ...gce, width: w, height: h, palette, index })
  }
  return { width, height, frames }
}

function lzwDecode(data: number[], minCode: number, length: number): Uint8Array {
  const out = new Uint8Array(length)
  const clear = 1 << minCode
  let size = minCode + 1
  let dict: number[][] = []
  const reset = () => {
    dict = []
    for (let i = 0; i < clear; i++) dict.push([i])
    dict.push([], [])
    size = minCode + 1
  }
  reset()
  let bit = 0
  let n = 0
  let prev: number[] | null = null
  while (n < length) {
    let code = 0
    for (let i = 0; i < size; i++, bit++) code |= (((data[bit >> 3] ?? 0) >> (bit & 7)) & 1) << i
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === clear + 1) break
    const entry: number[] =
      code < dict.length
        ? (dict[code] as number[])
        : [...(prev as number[]), (prev as number[])[0] as number]
    for (const v of entry) out[n++] = v
    if (prev) dict.push([...prev, entry[0] as number])
    if (dict.length === 1 << size && size < 12) size++
    prev = entry
  }
  return out
}

/** An RGBA frame filled with one color, with an optional colored rectangle. */
function frame(
  width: number,
  height: number,
  fill: number[],
  rect?: { x: number; y: number; w: number; h: number; color: number[] },
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside =
        rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
      const c = inside ? rect.color : fill
      data.set([c[0] as number, c[1] as number, c[2] as number, 255], (y * width + x) * 4)
    }
  }
  return data
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('gifSize', () => {
  it('is the 1080p frame at 2/3, never wider than 1280', () => {
    expect(gifSize('16:9')).toEqual({ width: 1280, height: 720 })
    expect(gifSize('1:1')).toEqual({ width: 720, height: 720 })
    expect(gifSize('9:16')).toEqual({ width: 720, height: 1280 })
    for (const aspect of ['16:9', '1:1', '9:16'] as const) {
      expect(gifSize(aspect).width).toBeLessThanOrEqual(GIF_MAX_WIDTH)
    }
  })

  it('names the file like the MP4, with its own size and rate', () => {
    expect(
      exportFileName({
        projectName: 'Demo',
        aspect: '16:9',
        resolution: '720p',
        fps: 15,
        extension: 'gif',
      }),
    ).toBe('Demo 16x9 720p15.gif')
  })
})

describe('gifFrameDelayMs', () => {
  it('alternates hundredths so the GIF lasts as long as the video', () => {
    const delays = Array.from({ length: 15 }, (_, i) => gifFrameDelayMs(i, 15))
    expect(new Set(delays)).toEqual(new Set([60, 70]))
    expect(delays.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(gifFrameDelayMs(3, 10)).toBe(100)
  })
})

describe('estimateGifBytes', () => {
  it('grows with pixels, rate and length', () => {
    const size = gifSize('16:9')
    const tenSeconds = estimateGifBytes({ size, fps: 15, durationMs: 10_000 })
    expect(estimateGifBytes({ size, fps: 15, durationMs: 20_000 })).toBeGreaterThan(tenSeconds)
    expect(estimateGifBytes({ size, fps: 10, durationMs: 10_000 })).toBeLessThan(tenSeconds)
    expect(estimateGifBytes({ size: gifSize('1:1'), fps: 15, durationMs: 10_000 })).toBeLessThan(
      tenSeconds,
    )
  })

  it('puts a 5s 16:9 GIF at 15fps in the megabytes, and a minute over the warning', () => {
    const size = gifSize('16:9')
    const fiveSeconds = estimateGifBytes({ size, fps: 15, durationMs: 5_000 })
    expect(fiveSeconds).toBeGreaterThan(1_000_000)
    expect(fiveSeconds).toBeLessThan(GIF_LARGE_BYTES)
    expect(estimateGifBytes({ size, fps: 15, durationMs: 60_000 })).toBeGreaterThan(GIF_LARGE_BYTES)
  })
})

describe('caption colors', () => {
  it('parses hex and rgba colors', () => {
    expect(parseRgb('#A8D5A2')).toEqual([168, 213, 162])
    expect(parseRgb('rgba(26, 29, 27, 0.84)')).toEqual([26, 29, 27])
    expect(parseRgb('#fff')).toEqual([255, 255, 255])
    expect(parseRgb('#1A1D1BCC')).toEqual([26, 29, 27])
    expect(parseRgb('transparent')).toBeNull()
    expect(parseRgb('Inter')).toBeNull()
  })

  it('keeps every color a preset paints, text first', () => {
    expect(captionPaletteColors({ preset: 'clean' })).toEqual([
      [255, 255, 255],
      [26, 29, 27],
    ])
    for (const preset of CAPTION_PRESETS) {
      const look = CAPTION_LOOKS[preset]
      const colors = captionPaletteColors({ preset }).map((c) => c.join())
      expect(colors[0]).toBe(parseRgb(look.color)?.join())
      for (const painted of [
        look.box,
        look.stroke?.color,
        look.shadow?.color,
        look.backing?.color,
        look.textShadow?.color,
      ]) {
        const rgb = painted ? parseRgb(painted) : null
        if (rgb) expect(colors).toContain(rgb.join())
      }
      expect(colors.length).toBeLessThanOrEqual(GIF_MAX_RESERVED_COLORS)
    }
  })
})

describe('createGifFrameEncoder', () => {
  const W = 32
  const H = 24

  it('streams a looping GIF whose frames decode back to the picture', () => {
    const encoder = createGifFrameEncoder({ width: W, height: H })
    const gray = [120, 120, 120]
    const parts = [
      encoder.addFrame(frame(W, H, gray), 70),
      // A white box appears: only those pixels are encoded, the rest is transparent.
      encoder.addFrame(frame(W, H, gray, { x: 4, y: 4, w: 8, h: 6, color: [255, 255, 255] }), 60),
      // Nothing changes: a 1×1 transparent frame.
      encoder.addFrame(frame(W, H, gray, { x: 4, y: 4, w: 8, h: 6, color: [255, 255, 255] }), 70),
      encoder.finish(),
    ]
    const gif = decodeGif(concat(parts))
    expect(gif.width).toBe(W)
    expect(gif.height).toBe(H)
    expect(gif.frames.map((f) => f.delayMs)).toEqual([70, 60, 70])

    const [first, second, still] = gif.frames as [DecodedFrame, DecodedFrame, DecodedFrame]
    expect(first.transparentIndex).toBeNull()
    expect(first.palette[first.index[0] as number]).toEqual(gray)

    expect(second.dispose).toBe(1)
    const inBox = (4 * W + 4) as number
    expect(second.palette[second.index[inBox] as number]).toEqual([255, 255, 255])
    expect(second.index[0]).toBe(second.transparentIndex)
    const encoded = [...second.index].filter((i) => i !== second.transparentIndex).length
    expect(encoded).toBe(8 * 6)

    expect([still.width, still.height]).toEqual([1, 1])
    expect(still.index[0]).toBe(still.transparentIndex)
  })

  it('ignores compression noise under the tolerance', () => {
    const encoder = createGifFrameEncoder({ width: W, height: H })
    encoder.addFrame(frame(W, H, [100, 100, 100]), 100)
    const bytes = concat([encoder.addFrame(frame(W, H, [103, 98, 101]), 100), encoder.finish()])
    // Header-less continuation: only the frame and the trailer, and the frame is 1×1.
    expect(bytes.length).toBeLessThan(40)
  })

  it('re-sends pixels the palette showed off, so no ghost of an earlier frame stays', () => {
    // A busy picture has more colors than one palette holds, so the first frame shows some
    // pixels several shades off. The source then stays the same: the encoder must still fix
    // those pixels, or the error (faint text before a zoom, in real recordings) stays forever.
    const W2 = 64
    const H2 = 64
    const data = new Uint8ClampedArray(W2 * H2 * 4)
    for (let p = 0; p < W2 * H2; p++) {
      data.set([(p * 37) % 256, ((p >> 6) * 41) % 256, (p * 83 + (p >> 3) * 7) % 256, 255], p * 4)
    }
    const encoder = createGifFrameEncoder({ width: W2, height: H2 })
    const parts = [encoder.addFrame(data, 100)]
    for (let i = 0; i < 6; i++) parts.push(encoder.addFrame(data, 100))
    parts.push(encoder.finish())
    const gif = decodeGif(concat(parts))

    const shown = new Uint8Array(W2 * H2 * 3)
    /** pixels shown more than the tolerance away from their source, after each frame */
    const offAfter = gif.frames.map((f) => {
      if (f.width === W2 && f.height === H2) {
        f.index.forEach((index, p) => {
          if (index !== f.transparentIndex) shown.set(f.palette[index] as number[], p * 3)
        })
      }
      let off = 0
      for (let p = 0; p < W2 * H2; p++) {
        for (let c = 0; c < 3; c++) {
          if (
            Math.abs((shown[p * 3 + c] as number) - (data[p * 4 + c] as number)) >
            GIF_DIFF_TOLERANCE
          ) {
            off++
            break
          }
        }
      }
      return off
    })
    // The first frame shows many pixels off, the next ones re-send them...
    expect(offAfter[0]).toBeGreaterThan(100)
    expect(gif.frames[1]?.width).toBe(W2)
    // ...and fewer stay off. A noise picture never fits one palette, so it can't reach zero;
    // before the fix the next frames came out empty and every one of them stayed off.
    expect(offAfter.at(-1) as number).toBeLessThan(offAfter[0] as number)
  })

  it('keeps reserved colors exact even when they are a few pixels', () => {
    // A busy gradient with a thin white line: without the reserved slot the white would be
    // merged into the nearest light grey.
    const W2 = 64
    const H2 = 64
    const data = new Uint8ClampedArray(W2 * H2 * 4)
    for (let p = 0; p < W2 * H2; p++) {
      const v = (p * 7) % 250
      data.set([v, (v * 3) % 250, (v * 5) % 250, 255], p * 4)
    }
    for (let x = 0; x < W2; x++) data.set([255, 255, 255, 255], (10 * W2 + x) * 4)
    const encoder = createGifFrameEncoder({
      width: W2,
      height: H2,
      reservedColors: [[255, 255, 255]],
    })
    const gif = decodeGif(concat([encoder.addFrame(data, 100), encoder.finish()]))
    const first = gif.frames[0] as DecodedFrame
    expect(first.palette[first.index[10 * W2 + 5] as number]).toEqual([255, 255, 255])
  })
})
