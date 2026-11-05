import { describe, expect, it } from 'vitest'
import type { CaptionCue } from '../captions/cues.ts'
import {
  DEFAULT_CAPTIONS,
  DEFAULT_WEBCAM,
  type Aspect,
  type CaptionSettings,
  type WebcamSettings,
} from '../project/schema.ts'
import {
  activeCaption,
  buildCaptionTrack,
  CAPTION_FADE_MS,
  CAPTION_SAFE_BOTTOM,
  CAPTION_WIDTH,
  captionDodge,
  captionFontFamily,
  captionFontPx,
  captionMaxUnits,
  captionPlacement,
  type CaptionLayer,
} from './captions.ts'
import { computeLayout, outputSize } from './layout.ts'
import { splitRegions } from './split.ts'
import type { Box } from './types.ts'
import { webcamBubbleAt, type WebcamBubble } from './webcam.ts'

const cue = (startMs: number, endMs: number, text = 'Olá'): CaptionCue => ({
  startMs,
  endMs,
  lines: [text],
  segment: 0,
})

function layer(aspect: Aspect, over: Partial<CaptionSettings> = {}) {
  const settings = { ...DEFAULT_CAPTIONS, ...over }
  return {
    preset: settings.preset,
    position: settings.position,
    size: settings.size,
    aspect,
  } satisfies Pick<CaptionLayer, 'preset' | 'position' | 'size' | 'aspect'>
}

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 1e-6 &&
  inner.y >= outer.y - 1e-6 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-6

describe('activeCaption', () => {
  const cues = [cue(1000, 2000, 'a'), cue(2100, 3000, 'b'), cue(5000, 6000, 'c')]

  it('shows nothing before the first cue or long after the last', () => {
    expect(activeCaption(cues, 500)).toBeNull()
    expect(activeCaption(cues, 6000 + CAPTION_FADE_MS + 1)).toBeNull()
    expect(activeCaption([], 1000)).toBeNull()
  })

  it('fades in with the spring and is fully shown after the fade', () => {
    const early = activeCaption(cues, 1000 + 40)!
    const later = activeCaption(cues, 1000 + 120)!
    expect(early.cue.lines).toEqual(['a'])
    expect(early.opacity).toBeGreaterThan(0)
    expect(early.opacity).toBeLessThan(later.opacity)
    expect(activeCaption(cues, 1000 + CAPTION_FADE_MS)!.opacity).toBeGreaterThan(0.97)
  })

  it('switches at once between cues closer than the fade (no blink)', () => {
    // Between a (ends 2000) and b (starts 2100): a stays fully shown.
    expect(activeCaption(cues, 2050)).toMatchObject({ cue: { lines: ['a'] }, opacity: 1 })
    // b does not fade in after a bridged gap.
    expect(activeCaption(cues, 2101)).toMatchObject({ cue: { lines: ['b'] }, opacity: 1 })
  })

  it('fades out after a cue followed by a pause', () => {
    const out = activeCaption(cues, 3000 + 60)!
    expect(out.cue.lines).toEqual(['b'])
    expect(out.opacity).toBeLessThan(1)
    expect(activeCaption(cues, 4000)).toBeNull()
  })
})

describe('captionPlacement', () => {
  const widths = [900, 700]

  it.each(['16:9', '1:1', '9:16'] as const)(
    'keeps the box inside the frame and centered (%s)',
    (aspect) => {
      const output = outputSize(aspect, '1080p')
      const { frame } = computeLayout({
        output,
        sourceSize: { width: 2560, height: 1440 },
        style: { padding: 8, radius: 12 },
        aspect,
      })
      for (const position of ['bottom', 'middle'] as const) {
        const place = captionPlacement(frame, output, layer(aspect, { position }), widths)
        expect(inside(place.box, frame)).toBe(true)
        expect(place.box.x + place.box.width / 2).toBeCloseTo(frame.x + frame.width / 2)
        expect(place.box.width).toBeLessThanOrEqual(frame.width * CAPTION_WIDTH + 1e-6)
        expect(place.lines).toHaveLength(2)
        if (position === 'middle') {
          expect(place.box.y + place.box.height / 2).toBeCloseTo(frame.y + frame.height / 2)
        } else {
          // Lower half, above the format's safe area.
          expect(place.box.y).toBeGreaterThan(frame.y + frame.height / 2)
          expect(place.box.y + place.box.height).toBeLessThanOrEqual(
            output.height * (1 - CAPTION_SAFE_BOTTOM[aspect]) + 1e-6,
          )
        }
      }
    },
  )

  it('keeps 9:16 captions out of the bottom 13%', () => {
    const output = outputSize('9:16', '1080p')
    const frame = { x: 0, y: 0, width: output.width, height: output.height }
    const place = captionPlacement(frame, output, layer('9:16'), widths)
    expect(place.box.y + place.box.height).toBeLessThanOrEqual(output.height * 0.87 + 1e-6)
  })

  it('in the split layout stays on the screen card, above the camera card', () => {
    const output = outputSize('9:16', '1080p')
    const { screen, camera } = splitRegions(output, 8, { ratio: 0.5 })
    const place = captionPlacement(screen, output, layer('9:16'), widths)
    expect(inside(place.box, screen)).toBe(true)
    expect(place.box.y + place.box.height).toBeLessThan(camera.y)
    // Camera on top: the screen card is at the bottom, so the safe area applies.
    const flipped = splitRegions(output, 8, { ratio: 0.5, cameraFirst: true })
    const low = captionPlacement(flipped.screen, output, layer('9:16'), widths)
    expect(low.box.y).toBeGreaterThan(flipped.camera.y + flipped.camera.height)
    expect(low.box.y + low.box.height).toBeLessThanOrEqual(output.height * 0.87 + 1e-6)
  })

  it('shrinks the font when a line is wider than the frame', () => {
    const output = outputSize('9:16', '1080p')
    const frame = { x: 100, y: 100, width: 600, height: 1500 }
    const place = captionPlacement(frame, output, layer('9:16'), [2000])
    expect(place.fontPx).toBeLessThan(captionFontPx(output, DEFAULT_CAPTIONS))
    expect(place.box.width).toBeLessThanOrEqual(600 * CAPTION_WIDTH + 1e-6)
  })

  it('scales with the output (4K = 2× 1080p)', () => {
    const hd = outputSize('16:9', '1080p')
    const uhd = outputSize('16:9', '4k')
    expect(captionFontPx(uhd, DEFAULT_CAPTIONS)).toBeCloseTo(
      2 * captionFontPx(hd, DEFAULT_CAPTIONS),
    )
  })
})

describe('captions and the webcam bubble', () => {
  const widths = [900, 700]
  const bubbleBox = (b: WebcamBubble): Box => ({
    x: b.x - b.width / 2,
    y: b.y - b.height / 2,
    width: b.width,
    height: b.height,
  })
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  const frameFor = (aspect: Aspect) => {
    const output = outputSize(aspect, '1080p')
    const { frame } = computeLayout({
      output,
      sourceSize: { width: 2560, height: 1440 },
      style: { padding: 8, radius: 12 },
      aspect,
    })
    return { output, frame }
  }
  // Dragged to the bottom middle, right where the captions sit.
  const bottomMiddle: WebcamSettings = { ...DEFAULT_WEBCAM, anchor: { x: 0.5, y: 1 } }

  it.each(['16:9', '1:1'] as const)('rises above a bubble at the bottom middle (%s)', (aspect) => {
    const { output, frame } = frameFor(aspect)
    const bubble = webcamBubbleAt(bottomMiddle, output, 0, 1)!
    const plain = captionPlacement(frame, output, layer(aspect), widths)
    expect(overlaps(plain.box, bubbleBox(bubble))).toBe(true)
    const place = captionPlacement(frame, output, layer(aspect), widths, bubble)
    expect(overlaps(place.box, bubbleBox(bubble))).toBe(false)
    expect(place.box.y + place.box.height).toBeLessThanOrEqual(bubbleBox(bubble).y + 1e-6)
    expect(inside(place.box, frame)).toBe(true)
    // Same lines, same size: only moved up, and the lines move with the box.
    expect(place.fontPx).toBeCloseTo(plain.fontPx)
    expect(place.lines[0]!.y - plain.lines[0]!.y).toBeCloseTo(place.box.y - plain.box.y)
  })

  it('leaves the captions alone when the bubble is in a corner, hidden or absent', () => {
    const { output, frame } = frameFor('16:9')
    const plain = captionPlacement(frame, output, layer('16:9'), widths)
    const corner = webcamBubbleAt(DEFAULT_WEBCAM, output, 0, 1)!
    expect(captionPlacement(frame, output, layer('16:9'), widths, corner)).toEqual(plain)
    const gone = { ...webcamBubbleAt(bottomMiddle, output, 0, 1)!, opacity: 0 }
    expect(captionPlacement(frame, output, layer('16:9'), widths, gone)).toEqual(plain)
    expect(captionPlacement(frame, output, layer('16:9'), widths, null)).toEqual(plain)
  })

  it('follows the bubble while it shrinks on zoom, with no jumps', () => {
    const { output, frame } = frameFor('16:9')
    let previous: number | null = null
    let lowest = -Infinity
    for (let scale = 1; scale <= 2.0001; scale += 0.02) {
      const bubble = webcamBubbleAt(bottomMiddle, output, 0, scale)!
      const place = captionPlacement(frame, output, layer('16:9'), widths, bubble)
      expect(overlaps(place.box, bubbleBox(bubble))).toBe(false)
      if (previous !== null) expect(Math.abs(place.box.y - previous)).toBeLessThan(12)
      previous = place.box.y
      lowest = Math.max(lowest, place.box.y)
    }
    // A smaller bubble lets the captions sit lower.
    const full = captionPlacement(
      frame,
      output,
      layer('16:9'),
      widths,
      webcamBubbleAt(bottomMiddle, output, 0, 1),
    )
    expect(lowest).toBeGreaterThan(full.box.y)
  })

  it('glides with the bubble fade instead of snapping', () => {
    const box = { x: 500, y: 900, width: 900, height: 120 }
    const bubble = { x: 960, y: 960, width: 300, height: 300, opacity: 1 }
    const limits = { top: 0, bottom: 1080 }
    const full = captionDodge(box, bubble, limits, 20)
    expect(full).toBeCloseTo(810 - 20 - 1020)
    expect(captionDodge(box, { ...bubble, opacity: 0.5 }, limits, 20)).toBeCloseTo(full / 2)
    // Sideways, the move ramps in over the gap as the boxes start to overlap.
    const edge = { ...bubble, x: 500 - 150 - 20 + 10 }
    expect(captionDodge(box, edge, limits, 20)).toBeCloseTo(full / 2)
    expect(captionDodge(box, { ...bubble, x: 200 }, limits, 20)).toBe(0)
  })

  it('goes below the bubble when that is shorter, and stays put when neither way fits', () => {
    const box = { x: 500, y: 500, width: 900, height: 120 }
    const limits = { top: 0, bottom: 1080 }
    // Bubble just over the top of the captions: nudged down below it.
    const above = { x: 960, y: 420, width: 200, height: 200, opacity: 1 }
    expect(captionDodge(box, above, limits, 20)).toBeCloseTo(520 + 20 - 500)
    // A bubble as tall as the room: no way out, no move.
    const tall = { x: 960, y: 540, width: 200, height: 1060, opacity: 1 }
    expect(captionDodge(box, tall, limits, 20)).toBe(0)
  })
})

describe('caption track', () => {
  const transcript = {
    language: 'pt',
    segments: [
      {
        startMs: 0,
        endMs: 4000,
        text: 'Agora vamos abrir as configurações e escolher o formato vertical para o vídeo',
      },
    ],
  }

  it('is null when captions are off or there is no speech', () => {
    expect(buildCaptionTrack(transcript, { ...DEFAULT_CAPTIONS, enabled: false })).toBeNull()
    expect(buildCaptionTrack({ language: 'pt', segments: [] }, DEFAULT_CAPTIONS)).toBeNull()
    expect(buildCaptionTrack(null, DEFAULT_CAPTIONS)).toBeNull()
  })

  it('wraps narrower in 9:16 than in 16:9', () => {
    expect(captionMaxUnits('9:16', DEFAULT_CAPTIONS)).toBeLessThan(
      captionMaxUnits('16:9', DEFAULT_CAPTIONS),
    )
    const track = buildCaptionTrack(transcript, DEFAULT_CAPTIONS)!
    const wide = track.cues('16:9')
    const tall = track.cues('9:16')
    expect(tall.flatMap((c) => c.lines).length).toBeGreaterThan(wide.flatMap((c) => c.lines).length)
    expect(track.cues('16:9')).toBe(wide) // computed once per format
  })

  it('uses Inter, then the system CJK fonts of the language', () => {
    expect(captionFontFamily('pt')).toBe('"Inter", sans-serif')
    expect(captionFontFamily('ja')).toContain('Hiragino Sans')
    expect(captionFontFamily('zh')).toContain('Microsoft YaHei')
    expect(captionFontFamily('ko')).toContain('Malgun Gothic')
    expect(captionFontFamily('ja').startsWith('"Inter"')).toBe(true)
  })
})
