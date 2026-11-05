import { describe, expect, it } from 'vitest'
import { CaptionPreset, DEFAULT_CAPTIONS, DEFAULT_STYLE } from '../project/schema.ts'
import type { Transcript } from '../transcript/transcript.ts'
import {
  buildCaptionTrack,
  CAPTION_LOOKS,
  CAPTION_PRESETS,
  captionFontFamily,
  captionFontPx,
  captionFontSpec,
  captionLineText,
  captionMaxUnits,
  captionPlacement,
  type CaptionFont,
  type CaptionLayer,
} from './captions.ts'
import { computeLayout, outputSize, paddedArea } from './layout.ts'
import { createRenderer, paintCaption } from './renderer.ts'
import type { Context2D, ImageSourceLike } from './types.ts'

interface Call {
  name: string
  args: unknown[]
}

/** A 2D context that records every call and property set (no canvas in Node). */
function recordingContext(log: Call[], measure?: (text: string) => number) {
  const props: Record<string, unknown> = {}
  return new Proxy(props, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        log.push({ name: key, args })
        if (key === 'measureText' && measure) return { width: measure(String(args[0])) }
        if (key.startsWith('create') && key.endsWith('Gradient')) return { addColorStop() {} }
        return undefined
      }
    },
    set(target, key, value) {
      if (typeof key === 'string') {
        log.push({ name: `${key}=`, args: [value] })
        target[key] = value
      }
      return true
    },
  }) as unknown as Context2D
}

const SOURCE = { video: true } as unknown as ImageSourceLike
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

/** Every context call the renderer makes for the caption (after the last drawImage). */
function captionCalls(layer: CaptionLayer, measure?: (text: string) => number): string[] {
  const log: Call[] = []
  const renderer = createRenderer(recordingContext(log, measure), {
    createSurface: () => ({ canvas: {}, ctx: recordingContext([]) }),
  })
  renderer.render({
    source: SOURCE,
    sourceSize: { width: 2560, height: 1440 },
    style: DEFAULT_STYLE,
    aspect: layer.aspect,
    output: outputSize(layer.aspect, '1080p'),
    viewport: null,
    cursor: null,
    cursorSize: 1.5,
    captions: layer,
  })
  const start = log.map((c) => c.name).lastIndexOf('drawImage') + 1
  return log.slice(start).map((c) => `${c.name}(${c.args.map(round).join(', ')})`)
}

const layer = (over: Partial<CaptionLayer> = {}): CaptionLayer => ({
  lines: ['Olá, pessoal!', 'Hoje vamos ver o Kamo.'],
  opacity: 0.8,
  rising: true,
  preset: 'clean',
  position: 'bottom',
  size: 'medium',
  fontFamily: '"Inter", sans-serif',
  aspect: '16:9',
  ...over,
})

const BUNDLED_WEIGHTS: Record<CaptionFont, number[]> = {
  sans: [400, 500, 600],
  serif: [400],
  mono: [500],
}
const COLOR = /^(#[0-9A-F]{6}|rgba\(\d+, \d+, \d+, (0|1|0\.\d+)\))$/

describe('caption style definitions', () => {
  it('has one look per preset, every preset in the gallery once, the first three first', () => {
    expect([...CAPTION_PRESETS].sort()).toEqual([...CaptionPreset.options].sort())
    expect(new Set(CAPTION_PRESETS).size).toBe(CAPTION_PRESETS.length)
    expect(CAPTION_PRESETS.slice(0, 3)).toEqual(['clean', 'bold', 'kamo'])
    expect(CAPTION_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(CAPTION_PRESETS.length).toBeLessThanOrEqual(12)
    expect(Object.keys(CAPTION_LOOKS).sort()).toEqual([...CaptionPreset.options].sort())
  })

  it.each(CAPTION_PRESETS)('%s is a valid look', (preset) => {
    const look = CAPTION_LOOKS[preset]
    // Only weights the app bundles (light installer: no new font files).
    expect(BUNDLED_WEIGHTS[look.font ?? 'sans']).toContain(look.weight)
    for (const color of [
      look.color,
      look.box,
      look.stroke?.color,
      look.shadow?.color,
      look.backing?.color,
      look.textShadow?.color,
    ]) {
      if (color != null) expect(color).toMatch(COLOR)
    }
    expect(look.scale).toBeGreaterThanOrEqual(0.8)
    expect(look.scale).toBeLessThanOrEqual(1.3)
    expect(Math.min(look.padX, look.padY, look.radius)).toBeGreaterThanOrEqual(0)
    if (look.textShadow) expect(look.textShadow.passes).toBeGreaterThanOrEqual(1)
    if (look.boxFit || look.backing) expect(look.box).not.toBeNull()
    // Something always separates the letters from any video: a box, an outline or a shadow.
    expect(look.box !== null || look.stroke !== null || look.textShadow != null).toBe(true)
    // DESIGN.md: the zoom blocks' pink is theirs alone.
    expect(JSON.stringify(look)).not.toMatch(/F6B8CC|F2B5C8/i)
  })

  it.each(CAPTION_PRESETS)('%s keeps long lines inside the frame in every format', (preset) => {
    for (const aspect of ['16:9', '9:16', '1:1'] as const) {
      for (const position of ['bottom', 'middle'] as const) {
        const output = outputSize(aspect, '1080p')
        const frame = computeLayout({
          output,
          sourceSize: { width: 1920, height: 1080 },
          style: DEFAULT_STYLE,
          aspect,
          viewport: null,
        }).frame
        const place = captionPlacement(
          frame,
          output,
          { preset, position, size: 'large', aspect },
          [3000, 2400],
        )
        const box = place.box
        expect(box.x).toBeGreaterThanOrEqual(frame.x - 1e-6)
        expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1e-6)
        expect(box.y).toBeGreaterThanOrEqual(frame.y - 1e-6)
        for (const line of place.lineBoxes) {
          expect(line.x).toBeGreaterThanOrEqual(box.x - 1e-6)
          expect(line.y).toBeGreaterThanOrEqual(box.y - 1e-6)
          expect(line.y + line.height).toBeLessThanOrEqual(box.y + box.height + 1e-6)
        }
      }
    }
  })

  it.each(CAPTION_PRESETS)('%s draws every line once, last, in its color', (preset) => {
    const calls = captionCalls(layer({ preset, language: 'pt' }))
    const fills = calls.filter((c) => c.startsWith('fillText('))
    // Glow passes draw the line first; the last fill of each line is the line itself.
    const passes = CAPTION_LOOKS[preset].textShadow?.passes ?? 0
    expect(fills).toHaveLength(2 * (passes + 1))
    expect(calls.at(-2)).toMatch(/^fillText\(/)
    expect(calls).toContain(`fillStyle=(${CAPTION_LOOKS[preset].color})`)
  })

  it('writes capitals for caps, by the language, and leaves CJK as it is', () => {
    const calls = captionCalls(layer({ preset: 'caps', language: 'pt' }))
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual([
      'fillText(OLÁ',
      'fillText(HOJE VAMOS VER O KAMO.',
    ])
    expect(captionLineText('caps', 'istanbul', 'tr')).toBe('İSTANBUL')
    expect(captionLineText('caps', '今日は Kamo', 'ja')).toBe('今日は KAMO')
    expect(captionLineText('clean', 'Olá', 'pt')).toBe('Olá')
  })

  it('takes the letter spacing off the measured width and recenters the line', () => {
    const log: Call[] = []
    // An engine with letterSpacing: measureText counts it after every letter.
    const ctx = recordingContext(log, (text) => {
      const spacing = Number.parseFloat(String((ctx as { letterSpacing?: string }).letterSpacing))
      return text.length * 20 + text.length * (spacing || 0)
    })
    ;(ctx as { letterSpacing?: string }).letterSpacing = '0px'
    const output = outputSize('16:9', '1080p')
    const frame = { x: 0, y: 0, width: output.width, height: output.height }
    paintCaption(ctx, layer({ preset: 'caps', lines: ['abc'], opacity: 1 }), frame, output)
    const px = captionFontPx(output, { preset: 'caps', size: 'medium' })
    const spacing = (CAPTION_LOOKS.caps.tracking ?? 0) * px
    const fill = log.find((c) => c.name === 'fillText')
    expect(fill?.args[1]).toBeCloseTo(output.width / 2 + spacing / 2)
    const place = captionPlacement(frame, output, layer({ preset: 'caps' }), [60])
    const tag = log.filter((c) => c.name === 'arcTo')
    expect(tag.length).toBe(4)
    // The tag wraps 3 letters of 20px, not the trailing spacing.
    expect(place.lineBoxes[0]?.width).toBeCloseTo(60 + 2 * CAPTION_LOOKS.caps.padX * px)
  })

  it('draws one box per line for duo, each over its offset sage backing', () => {
    const calls = captionCalls(layer({ preset: 'duo' }))
    const fillStyles = calls.filter((c) => c.startsWith('fillStyle='))
    expect(fillStyles.slice(0, 2)).toEqual(['fillStyle=(#A8D5A2)', 'fillStyle=(#FFFFFF)'])
    expect(calls.filter((c) => c === 'fill()')).toHaveLength(4)
  })

  it('breaks lines the same for every style but bold (whose lines stay as before)', () => {
    for (const aspect of ['16:9', '9:16', '1:1'] as const) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const clean = captionMaxUnits(aspect, { preset: 'clean', size })
        for (const preset of CAPTION_PRESETS) {
          if (preset !== 'bold') expect(captionMaxUnits(aspect, { preset, size })).toBe(clean)
        }
      }
    }
    expect(captionMaxUnits('16:9', { preset: 'clean', size: 'medium' })).toBe(42)
    expect(captionMaxUnits('9:16', { preset: 'clean', size: 'medium' })).toBe(29)
    // Bold: 1.22× the font, as since step 24.
    expect(captionMaxUnits('9:16', { preset: 'bold', size: 'medium' })).toBe(
      Math.floor(
        (paddedArea(outputSize('9:16', '1080p'), 8).width * 0.88) / (0.044 * 1.22 * 1080 * 0.56),
      ),
    )
  })

  it('spans the frame with the cinema band', () => {
    const output = outputSize('16:9', '1080p')
    const frame = { x: 100, y: 50, width: 1600, height: 900 }
    const place = captionPlacement(frame, output, layer({ preset: 'cinema' }), [400])
    expect(place.box.x).toBe(100)
    expect(place.box.width).toBe(1600)
  })

  it('gives each preset its family, with the CJK system stack behind it', () => {
    const transcript = {
      language: 'ja',
      segments: [{ startMs: 0, endMs: 1000, text: 'こんにちは' }],
    } as Pick<Transcript, 'language' | 'segments'>
    const family = (preset: CaptionPreset) =>
      buildCaptionTrack(transcript, { ...DEFAULT_CAPTIONS, preset })?.fontFamily
    expect(family('clean')).toBe(
      '"Inter", "Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP", sans-serif',
    )
    expect(family('typewriter')).toMatch(/^"JetBrains Mono", "Hiragino Sans".*monospace$/)
    expect(family('cinema')).toMatch(/^"Instrument Serif", "Hiragino Sans".*serif$/)
    expect(captionFontFamily('pt')).toBe('"Inter", sans-serif')
    expect(captionFontSpec('cinema', '"Instrument Serif", serif')).toBe(
      '400 48px "Instrument Serif", serif',
    )
  })
})

describe('caption styles: the first three presets paint exactly as before', () => {
  for (const preset of ['clean', 'bold', 'kamo'] as const) {
    it(`${preset}`, () => {
      expect(captionCalls(layer({ preset }))).toMatchSnapshot()
      expect(
        captionCalls(layer({ preset, aspect: '9:16', position: 'middle', size: 'large' }), (t) =>
          t.length === 13 ? 700 : 2000,
        ),
      ).toMatchSnapshot()
    })
  }
})
