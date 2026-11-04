import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE } from '../project/schema.ts'
import { isHexColor, parseHex, rgba } from './color.ts'
import {
  DEFAULT_WALLPAPER_ID,
  IMAGE_FALLBACK_COLOR,
  WALLPAPERS,
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

describe('color', () => {
  it('parses #RRGGBB and builds rgba strings', () => {
    expect(parseHex('#A8D5A2')).toEqual({ r: 168, g: 213, b: 162 })
    expect(parseHex('#abc')).toBeNull()
    expect(rgba('#A8D5A2', 0.5)).toBe('rgba(168, 213, 162, 0.5)')
    expect(rgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)')
  })
})
