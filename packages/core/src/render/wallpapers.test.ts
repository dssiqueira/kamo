import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE } from '../project/schema.ts'
import { isHexColor, parseHex, rgba } from './color.ts'
import type { Context2D } from './types.ts'
import {
  DEFAULT_WALLPAPER_ID,
  IMAGE_FALLBACK_COLOR,
  WALLPAPERS,
  coverCrop,
  drawWallpaper,
  wallpaperById,
  wallpaperPlan,
} from './wallpapers.ts'

const SIZE = { width: 1920, height: 1080 }

describe('WALLPAPERS', () => {
  it('has exactly 8 presets with unique ids, including the default sage', () => {
    expect(WALLPAPERS).toHaveLength(8)
    expect(new Set(WALLPAPERS.map((w) => w.id)).size).toBe(8)
    expect(WALLPAPERS.map((w) => w.id)).toContain('sage')
    expect(DEFAULT_WALLPAPER_ID).toBe(DEFAULT_STYLE.background.value)
  })

  it('gives every preset an i18n key, a hex swatch and valid gradient data', () => {
    for (const w of WALLPAPERS) {
      expect(w.labelKey).toBe(`style.wallpapers.${w.id}`)
      expect(isHexColor(w.swatch)).toBe(true)
      expect(w.stops.length).toBeGreaterThanOrEqual(2)
      for (const s of w.stops) expect(isHexColor(s.color)).toBe(true)
      for (const b of w.blobs) {
        expect(isHexColor(b.color)).toBe(true)
        expect(b.alpha).toBeGreaterThan(0)
        expect(b.alpha).toBeLessThanOrEqual(1)
      }
      const offsets = w.stops.map((s) => s.offset)
      expect(offsets[0]).toBe(0)
      expect(offsets.at(-1)).toBe(1)
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
    }
  })

  it('falls back to sage for an unknown id', () => {
    expect(wallpaperById('nope').id).toBe('sage')
    expect(wallpaperById('dawn').id).toBe('dawn')
  })
})

describe('wallpaperPlan', () => {
  it('is deterministic', () => {
    for (const w of WALLPAPERS) {
      const bg = { kind: 'preset' as const, value: w.id }
      expect(wallpaperPlan(bg, SIZE)).toEqual(wallpaperPlan(bg, SIZE))
    }
  })

  it('paints a preset as a linear base and fading radial blobs', () => {
    const plan = wallpaperPlan({ kind: 'preset', value: 'sage' }, SIZE)
    const sage = wallpaperById('sage')
    expect(plan[0]?.kind).toBe('linear')
    expect(plan).toHaveLength(1 + sage.blobs.length)
    for (const layer of plan.slice(1)) {
      expect(layer.kind).toBe('radial')
      if (layer.kind !== 'radial') continue
      expect(layer.stops.at(-1)?.color).toMatch(/, 0\)$/)
    }
  })

  it('runs the base gradient across the whole canvas along its angle', () => {
    const plan = wallpaperPlan({ kind: 'preset', value: 'dawn' }, SIZE) // 170°: mostly downward
    const base = plan[0]
    if (base?.kind !== 'linear') throw new Error('expected linear base')
    expect(base.y1).toBeGreaterThan(base.y0)
    expect((base.x0 + base.x1) / 2).toBeCloseTo(960)
    expect((base.y0 + base.y1) / 2).toBeCloseTo(540)
  })

  it('paints a solid color, and a neutral fallback for bad colors and images', () => {
    expect(wallpaperPlan({ kind: 'color', value: '#123456' }, SIZE)).toEqual([
      { kind: 'solid', color: '#123456' },
    ])
    expect(wallpaperPlan({ kind: 'color', value: 'red' }, SIZE)).toEqual([
      { kind: 'solid', color: IMAGE_FALLBACK_COLOR },
    ])
    expect(wallpaperPlan({ kind: 'image', value: 'wall.png' }, SIZE)).toEqual([
      { kind: 'solid', color: IMAGE_FALLBACK_COLOR },
    ])
  })
})

describe('image background (A-04)', () => {
  const IMAGE = { kind: 'image', value: 'background-0123456789abcdef.png' } as const

  it('paints the fallback under the image, cover-cropped to the output', () => {
    expect(wallpaperPlan(IMAGE, SIZE, { width: 3000, height: 2000 })).toEqual([
      { kind: 'solid', color: IMAGE_FALLBACK_COLOR },
      { kind: 'image', crop: { x: 0, y: 156.25, width: 3000, height: 1687.5 } },
    ])
  })

  it('keeps only the fallback while the image is missing or empty', () => {
    expect(wallpaperPlan(IMAGE, SIZE, null)).toEqual([
      { kind: 'solid', color: IMAGE_FALLBACK_COLOR },
    ])
    expect(wallpaperPlan(IMAGE, SIZE, { width: 0, height: 100 })).toHaveLength(1)
  })

  it('ignores an image size for presets and colors', () => {
    const image = { width: 100, height: 100 }
    expect(wallpaperPlan({ kind: 'color', value: '#123456' }, SIZE, image)).toHaveLength(1)
    expect(
      wallpaperPlan({ kind: 'preset', value: 'sage' }, SIZE, image).every(
        (l) => l.kind !== 'image',
      ),
    ).toBe(true)
  })

  it('cover-crops to every format with no bars and no distortion', () => {
    const image = { width: 4000, height: 3000 }
    for (const area of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1920 },
    ]) {
      const crop = coverCrop(image, area)
      expect(crop.width / crop.height).toBeCloseTo(area.width / area.height)
      // The crop stays inside the image, centered, and touches two opposite edges.
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.x * 2 + crop.width).toBeCloseTo(image.width)
      expect(crop.y * 2 + crop.height).toBeCloseTo(image.height)
      expect(crop.width === image.width || crop.height === image.height).toBe(true)
    }
    // 9:16 out of a 4:3 image: the full height, a centered vertical strip.
    expect(coverCrop(image, { width: 1080, height: 1920 })).toEqual({
      x: (4000 - 1687.5) / 2,
      y: 0,
      width: 1687.5,
      height: 3000,
    })
  })

  it('draws the image over the whole area with drawWallpaper', () => {
    const calls: { name: string; args: unknown[] }[] = []
    const ctx = new Proxy(
      {},
      {
        get:
          (_target, key) =>
          (...args: unknown[]) =>
            calls.push({ name: String(key), args }),
        set: () => true,
      },
    ) as unknown as Context2D
    const source = { bitmap: true }
    drawWallpaper(ctx, IMAGE, SIZE, { source, size: { width: 1920, height: 1080 } })
    expect(calls.map((c) => c.name)).toEqual(['fillRect', 'drawImage'])
    expect(calls[1]?.args).toEqual([source, 0, 0, 1920, 1080, 0, 0, 1920, 1080])
    calls.length = 0
    drawWallpaper(ctx, IMAGE, SIZE)
    expect(calls.map((c) => c.name)).toEqual(['fillRect'])
  })
})

describe('color', () => {
  it('parses #RRGGBB and builds rgba strings', () => {
    expect(parseHex('#A8D5A2')).toEqual({ r: 168, g: 213, b: 162 })
    expect(parseHex('#abc')).toBeNull()
    expect(rgba('#A8D5A2', 0.5)).toBe('rgba(168, 213, 162, 0.5)')
    expect(rgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)')
  })
})
