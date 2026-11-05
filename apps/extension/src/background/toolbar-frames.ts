// Toolbar icon frames (E-01): Kamo's head, cut from the mascot art, with the eye in each pose
// (look, aside, up, blink). The service worker draws them on demand from the same webp files
// the popup shows, so the extension ships no extra image; `icons/toolbar-*.png` is the
// resting frame (`head-look-side`, looking ahead) as a static file for the manifest. Pure, so
// it is unit tested.
import { GAZE_OFFSETS, HEAD_ART_HEIGHT, type GazePose } from '@kamo/ui/gaze'

/** The resting frame (REST_POSE, looking ahead) as static files: the manifest's toolbar icon. */
export const TOOLBAR_ICON = { 16: 'icons/toolbar-16.png', 32: 'icons/toolbar-32.png' } as const

/** Toolbar sizes: 16px, and 32px for 2x displays. */
export const TOOLBAR_SIZES = [16, 32] as const

/**
 * The square of `head-look` that becomes the icon, in art pixels: the whole head, crest to
 * chin. At 16px a tighter crop loses the silhouette and the eye alone reads as a smudge.
 */
export const HEAD_CROP = { x: 0, y: 8, size: 160 } as const

export interface Box {
  x: number
  y: number
  size: number
}

/** The crop of `pose` in its own image of `height` pixels, lined up with `head-look`. */
export function cropFor(pose: GazePose, height: number): Box {
  const scale = height / HEAD_ART_HEIGHT
  const { dx, dy } = GAZE_OFFSETS[pose]
  return {
    x: (HEAD_CROP.x + dx) * scale,
    y: (HEAD_CROP.y + dy) * scale,
    size: HEAD_CROP.size * scale,
  }
}

/**
 * Scales the square `box` of an RGBA image down to `size`×`size` by averaging every source
 * pixel it covers (weighted by coverage and alpha), which keeps a 10× reduction crisp where
 * plain bilinear sampling would alias. Pixels outside the image count as transparent.
 */
export function downsample(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
  size: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4)
  const step = box.size / size
  for (let oy = 0; oy < size; oy++) {
    const y0 = box.y + oy * step
    const y1 = y0 + step
    for (let ox = 0; ox < size; ox++) {
      const x0 = box.x + ox * step
      const x1 = x0 + step
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * wy
          if (w <= 0) continue
          area += w
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          const i = (sy * width + sx) * 4
          const alpha = ((source[i + 3] ?? 0) / 255) * w
          r += (source[i] ?? 0) * alpha
          g += (source[i + 1] ?? 0) * alpha
          b += (source[i + 2] ?? 0) * alpha
          a += alpha
        }
      }
      const o = (oy * size + ox) * 4
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
      }
      out[o + 3] = area > 0 ? (a / area) * 255 : 0
    }
  }
  return out
}
