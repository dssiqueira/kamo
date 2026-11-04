// Procedural wallpapers (F-08, plan I-6). Pastel presets drawn only from canvas gradient
// primitives: no image files (zero weight in the installer, rule 6) and fully deterministic,
// so preview and export paint the exact same backdrop (rule 11).
//
// Each preset is data: a soft multi-stop linear base plus a few large radial "blobs" that
// fade to transparent. `wallpaperPlan` turns it into layers in output pixels (pure, tested in
// Node) and `drawWallpaper` just executes the layers.
import type { Style } from '../project/schema.ts'
import { isHexColor, rgba } from './color.ts'
import type { Context2D, Size } from './types.ts'

export interface GradientStop {
  /** 0..1 along the gradient */
  offset: number
  /** `#RRGGBB` */
  color: string
  alpha?: number
}

export interface WallpaperBlob {
  /** center, 0..1 of the canvas width and height */
  x: number
  y: number
  /** radius as a fraction of the canvas's longer side */
  r: number
  color: string
  alpha: number
}

export interface WallpaperPreset {
  /** stable id saved in project.json (`style.background.value`) */
  id: string
  /** i18n key for the picker label */
  labelKey: string
  /** solid color for the picker swatch */
  swatch: string
  /** base gradient direction in degrees, CSS-like (90 = left → right, 180 = top → bottom) */
  angle: number
  stops: readonly GradientStop[]
  blobs: readonly WallpaperBlob[]
}

function preset(
  id: string,
  swatch: string,
  angle: number,
  stops: readonly GradientStop[],
  blobs: readonly WallpaperBlob[],
): WallpaperPreset {
  return { id, labelKey: `style.wallpapers.${id}`, swatch, angle, stops, blobs }
}

/** The 8 ready-made wallpapers, in picker order. 'sage' is the default (DEFAULT_STYLE). */
export const WALLPAPERS: readonly WallpaperPreset[] = [
  preset(
    'sage',
    '#A8D5A2',
    135,
    [
      { offset: 0, color: '#DCEFD7' },
      { offset: 0.55, color: '#BFE0B9' },
      { offset: 1, color: '#A8D5A2' },
    ],
    [
      { x: 0.12, y: 0.15, r: 0.55, color: '#F4F9EF', alpha: 0.75 },
      { x: 0.9, y: 0.85, r: 0.6, color: '#CDE8E4', alpha: 0.6 },
      { x: 0.7, y: 0.2, r: 0.35, color: '#E3F1E0', alpha: 0.5 },
    ],
  ),
  preset(
    'cream',
    '#F3EFE8',
    160,
    [
      { offset: 0, color: '#FCFAF6' },
      { offset: 0.6, color: '#F5EEE3' },
      { offset: 1, color: '#EDE3D3' },
    ],
    [
      { x: 0.85, y: 0.15, r: 0.5, color: '#FBEFF2', alpha: 0.7 },
      { x: 0.1, y: 0.9, r: 0.55, color: '#F6E3CF', alpha: 0.6 },
    ],
  ),
  preset(
    'blossom',
    '#F6B8CC',
    135,
    [
      { offset: 0, color: '#FDEEF3' },
      { offset: 0.5, color: '#F9D3DF' },
      { offset: 1, color: '#F6B8CC' },
    ],
    [
      { x: 0.15, y: 0.2, r: 0.5, color: '#FFF7F9', alpha: 0.7 },
      { x: 0.85, y: 0.8, r: 0.5, color: '#F3E6F5', alpha: 0.6 },
      { x: 0.55, y: 0.95, r: 0.4, color: '#FBDDE5', alpha: 0.5 },
    ],
  ),
  preset(
    'water',
    '#A9D8D3',
    150,
    [
      { offset: 0, color: '#E6F4F2' },
      { offset: 0.5, color: '#CDE8E4' },
      { offset: 1, color: '#A9D8D3' },
    ],
    [
      { x: 0.2, y: 0.25, r: 0.5, color: '#F2FAF9', alpha: 0.7 },
      { x: 0.85, y: 0.75, r: 0.55, color: '#B9DDD8', alpha: 0.55 },
      { x: 0.6, y: 0.1, r: 0.35, color: '#E3F1E0', alpha: 0.5 },
    ],
  ),
  preset(
    'peach',
    '#F7C9A9',
    135,
    [
      { offset: 0, color: '#FEF3EA' },
      { offset: 0.55, color: '#FBDCC6' },
      { offset: 1, color: '#F7C9A9' },
    ],
    [
      { x: 0.15, y: 0.2, r: 0.5, color: '#FFF9F3', alpha: 0.7 },
      { x: 0.85, y: 0.85, r: 0.5, color: '#F6B8CC', alpha: 0.4 },
    ],
  ),
  preset(
    'lavender',
    '#CDBDE8',
    140,
    [
      { offset: 0, color: '#F4F0FA' },
      { offset: 0.55, color: '#E0D6F1' },
      { offset: 1, color: '#CDBDE8' },
    ],
    [
      { x: 0.15, y: 0.15, r: 0.5, color: '#FAF7FD', alpha: 0.7 },
      { x: 0.9, y: 0.8, r: 0.5, color: '#F6B8CC', alpha: 0.35 },
      { x: 0.3, y: 0.9, r: 0.45, color: '#CDE8E4', alpha: 0.4 },
    ],
  ),
  preset(
    'meadow',
    '#B9DDC8',
    120,
    [
      { offset: 0, color: '#E3F1E0' },
      { offset: 0.5, color: '#CDE8E4' },
      { offset: 1, color: '#A9D8D3' },
    ],
    [
      { x: 0.1, y: 0.85, r: 0.55, color: '#A8D5A2', alpha: 0.5 },
      { x: 0.8, y: 0.15, r: 0.5, color: '#FAF7F2', alpha: 0.6 },
      { x: 0.55, y: 0.55, r: 0.3, color: '#E6F4F2', alpha: 0.4 },
    ],
  ),
  preset(
    'dawn',
    '#FBDDE5',
    170,
    [
      { offset: 0, color: '#FAF7F2' },
      { offset: 0.5, color: '#FBDDE5' },
      { offset: 1, color: '#F7CFB4' },
    ],
    [
      { x: 0.8, y: 0.2, r: 0.5, color: '#FFF6E9', alpha: 0.7 },
      { x: 0.2, y: 0.75, r: 0.5, color: '#F6B8CC', alpha: 0.45 },
      { x: 0.9, y: 0.95, r: 0.4, color: '#CDBDE8', alpha: 0.35 },
    ],
  ),
]

export const DEFAULT_WALLPAPER_ID = 'sage'

/** Neutral backdrop for `kind: 'image'` until custom images arrive (v0.4, A-08). */
export const IMAGE_FALLBACK_COLOR = '#F3EFE8'

/** Finds a preset by id; unknown ids fall back to the default ('sage'). */
export function wallpaperById(id: string): WallpaperPreset {
  const found = WALLPAPERS.find((w) => w.id === id)
  if (found) return found
  const fallback = WALLPAPERS.find((w) => w.id === DEFAULT_WALLPAPER_ID)
  if (!fallback) throw new Error('default wallpaper missing')
  return fallback
}

export type WallpaperLayer =
  | { kind: 'solid'; color: string }
  | {
      kind: 'linear'
      x0: number
      y0: number
      x1: number
      y1: number
      stops: readonly { offset: number; color: string }[]
    }
  | {
      kind: 'radial'
      x: number
      y: number
      r: number
      stops: readonly { offset: number; color: string }[]
    }

/** Fall-off of a blob from its center: a soft, almost gaussian edge. */
const BLOB_FALLOFF: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.3, 0.8],
  [0.6, 0.35],
  [0.8, 0.12],
  [1, 0],
]

/**
 * Layers (in `size` pixels) that paint `background`, bottom to top. Pure and deterministic.
 * - preset: linear base + radial blobs; unknown id → 'sage'
 * - color: one solid fill; invalid hex → the image fallback color
 * - image: the neutral fallback (v0.4)
 */
export function wallpaperPlan(background: Style['background'], size: Size): WallpaperLayer[] {
  if (background.kind === 'color') {
    const color = isHexColor(background.value) ? background.value : IMAGE_FALLBACK_COLOR
    return [{ kind: 'solid', color }]
  }
  if (background.kind === 'image') return [{ kind: 'solid', color: IMAGE_FALLBACK_COLOR }]

  const wallpaper = wallpaperById(background.value)
  const { width: w, height: h } = size
  const radians = (wallpaper.angle * Math.PI) / 180
  // CSS gradient line: through the center, long enough that the corners get offsets 0 and 1.
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const cx = w / 2
  const cy = h / 2
  const layers: WallpaperLayer[] = [
    {
      kind: 'linear',
      x0: cx - dx * half,
      y0: cy - dy * half,
      x1: cx + dx * half,
      y1: cy + dy * half,
      stops: wallpaper.stops.map((s) => ({ offset: s.offset, color: rgba(s.color, s.alpha ?? 1) })),
    },
  ]
  const longer = Math.max(w, h)
  for (const blob of wallpaper.blobs) {
    layers.push({
      kind: 'radial',
      x: blob.x * w,
      y: blob.y * h,
      r: blob.r * longer,
      stops: BLOB_FALLOFF.map(([offset, k]) => ({
        offset,
        color: rgba(blob.color, blob.alpha * k),
      })),
    })
  }
  return layers
}

/** Paints `background` over the whole `size` area of `ctx`. */
export function drawWallpaper(ctx: Context2D, background: Style['background'], size: Size): void {
  for (const layer of wallpaperPlan(background, size)) {
    if (layer.kind === 'solid') {
      ctx.fillStyle = layer.color
    } else {
      const gradient =
        layer.kind === 'linear'
          ? ctx.createLinearGradient(layer.x0, layer.y0, layer.x1, layer.y1)
          : ctx.createRadialGradient(layer.x, layer.y, 0, layer.x, layer.y, layer.r)
      for (const stop of layer.stops) gradient.addColorStop(stop.offset, stop.color)
      ctx.fillStyle = gradient
    }
    ctx.fillRect(0, 0, size.width, size.height)
  }
}
