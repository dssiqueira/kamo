import { describe, expect, it } from 'vitest'
import type { CaptionCue } from '../captions/cues.ts'
import { DEFAULT_CAPTIONS, type Aspect, type CaptionSettings } from '../project/schema.ts'
import {
  activeCaption,
  buildCaptionTrack,
  CAPTION_FADE_MS,
  CAPTION_SAFE_BOTTOM,
  CAPTION_WIDTH,
  captionFontFamily,
  captionFontPx,
  captionMaxUnits,
  captionPlacement,
  type CaptionLayer,
} from './captions.ts'
import { computeLayout, outputSize } from './layout.ts'
import { splitRegions } from './split.ts'
import type { Box } from './types.ts'

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
