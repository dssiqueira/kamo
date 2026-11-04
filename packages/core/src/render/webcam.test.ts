import { describe, expect, it } from 'vitest'
import { buildCameraTrack, cameraAt } from '../camera/camera.ts'
import { DEFAULT_WEBCAM, type WebcamSettings } from '../project/schema.ts'
import { outputSize } from './layout.ts'
import {
  WEBCAM_DIAMETER,
  WEBCAM_FADE_LEAD_MS,
  WEBCAM_FADE_MIN_SCALE,
  WEBCAM_MARGIN,
  WEBCAM_SHRINK_MIN,
  webcamBubbleAt,
  webcamBubbleBase,
  webcamBubbleContains,
  webcamCoverCrop,
  webcamPlacementAt,
  webcamShrink,
  webcamTimeMs,
  webcamVisibility,
} from './webcam.ts'

const OUT_16x9 = outputSize('16:9', '1080p')
const settings = (over: Partial<WebcamSettings> = {}): WebcamSettings => ({
  ...DEFAULT_WEBCAM,
  ...over,
})

describe('webcamBubbleBase', () => {
  it('puts the bubble in each corner of the output, a margin away from both edges', () => {
    const margin = WEBCAM_MARGIN * 1080
    const r = (WEBCAM_DIAMETER.medium * 1080) / 2
    const at = (position: WebcamSettings['position']) =>
      webcamBubbleBase(position, 'medium', OUT_16x9)
    expect(at('top-left')).toMatchObject({ x: margin + r, y: margin + r, radius: r })
    expect(at('top-right')).toMatchObject({ x: 1920 - margin - r, y: margin + r, radius: r })
    expect(at('bottom-left')).toMatchObject({ x: margin + r, y: 1080 - margin - r, radius: r })
    expect(at('bottom-right')).toMatchObject({
      x: 1920 - margin - r,
      y: 1080 - margin - r,
      radius: r,
    })
  })

  it('sizes the bubble from the short side, so it reads the same in every format', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const wide = webcamBubbleBase('top-left', size, OUT_16x9)
      const square = webcamBubbleBase('top-left', size, outputSize('1:1', '1080p'))
      const tall = webcamBubbleBase('top-left', size, outputSize('9:16', '1080p'))
      expect(wide.radius * 2).toBeCloseTo(WEBCAM_DIAMETER[size] * 1080)
      expect(square.radius).toBe(wide.radius)
      expect(tall.radius).toBe(wide.radius)
    }
    const small = webcamBubbleBase('top-left', 'small', OUT_16x9).radius
    const medium = webcamBubbleBase('top-left', 'medium', OUT_16x9).radius
    const large = webcamBubbleBase('top-left', 'large', OUT_16x9).radius
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })

  it('doubles with 4K', () => {
    const hd = webcamBubbleBase('bottom-right', 'large', outputSize('16:9', '1080p'))
    const uhd = webcamBubbleBase('bottom-right', 'large', outputSize('16:9', '4k'))
    expect(uhd.radius).toBeCloseTo(hd.radius * 2)
    expect(uhd.x).toBeCloseTo(hd.x * 2)
  })

  it('keeps the outer corner in place when scaled down', () => {
    const full = webcamBubbleBase('bottom-right', 'medium', OUT_16x9)
    const half = webcamBubbleBase('bottom-right', 'medium', OUT_16x9, 0.5)
    expect(half.radius).toBeCloseTo(full.radius / 2)
    expect(half.x + half.radius).toBeCloseTo(full.x + full.radius)
    expect(half.y + half.radius).toBeCloseTo(full.y + full.radius)
  })
})

describe('webcamShrink', () => {
  it('is 1 at rest and the minimum from a 2x zoom up', () => {
    expect(webcamShrink(1)).toBe(1)
    expect(webcamShrink(2)).toBeCloseTo(WEBCAM_SHRINK_MIN)
    expect(webcamShrink(4)).toBeCloseTo(WEBCAM_SHRINK_MIN)
  })

  it('shrinks steadily as the camera zooms in, and only a little for a slight zoom', () => {
    let previous = 1
    for (let s = 1; s <= 2.001; s += 0.05) {
      const k = webcamShrink(s)
      expect(k).toBeLessThanOrEqual(previous + 1e-12)
      previous = k
    }
    expect(webcamShrink(1.1)).toBeGreaterThan(0.98)
  })

  it('follows the camera spring over time: shrinks into a zoom and grows back after', () => {
    const camera = buildCameraTrack({
      zooms: [
        {
          id: 'z',
          startMs: 1000,
          endMs: 3000,
          scale: 2,
          target: { x: 1280, y: 720 },
          follow: false,
          origin: 'manual',
          leadMs: 300,
        },
      ],
      events: [],
      video: { width: 2560, height: 1440 },
      durationMs: 6000,
    })
    const radiusAt = (t: number) =>
      webcamBubbleAt(settings(), OUT_16x9, t, cameraAt(camera, t).scale)?.radius ?? 0
    const full = webcamBubbleBase('bottom-right', 'medium', OUT_16x9).radius
    expect(radiusAt(0)).toBeCloseTo(full)
    expect(radiusAt(2000)).toBeCloseTo(full * WEBCAM_SHRINK_MIN, 1)
    expect(radiusAt(5500)).toBeCloseTo(full, 1)
    // Smooth: no jump between consecutive 60fps frames.
    for (let t = 0; t < 6000; t += 1000 / 60) {
      expect(Math.abs(radiusAt(t + 1000 / 60) - radiusAt(t))).toBeLessThan(full * 0.05)
    }
    // Shrink off: always full size.
    const off = webcamBubbleAt(
      settings({ shrinkOnZoom: false }),
      OUT_16x9,
      2000,
      cameraAt(camera, 2000).scale,
    )
    expect(off?.radius).toBeCloseTo(full)
  })
})

describe('webcamVisibility', () => {
  const hidden = [{ startMs: 2000, endMs: 4000 }]

  it('is fully visible far from any hidden stretch', () => {
    expect(webcamVisibility([], 1234)).toBe(1)
    expect(webcamVisibility(hidden, 0)).toBe(1)
    expect(webcamVisibility(hidden, 2000 - WEBCAM_FADE_LEAD_MS)).toBe(1)
    expect(webcamVisibility(hidden, 6000)).toBeGreaterThan(0.999)
  })

  it('is 0 inside a stretch', () => {
    for (const t of [2000, 2500, 3999]) expect(webcamVisibility(hidden, t)).toBe(0)
  })

  it('fades out before the stretch and back in after it, with the spring', () => {
    expect(webcamVisibility(hidden, 2000 - 1)).toBeLessThan(0.03)
    const before = webcamVisibility(hidden, 2000 - WEBCAM_FADE_LEAD_MS / 2)
    expect(before).toBeGreaterThan(0.05)
    expect(before).toBeLessThan(0.95)
    expect(webcamVisibility(hidden, 4000)).toBeLessThan(0.03)
    const after = webcamVisibility(hidden, 4150)
    expect(after).toBeGreaterThan(0.3)
    expect(after).toBeLessThan(0.8)
    // Monotonic on the way out (no flicker).
    let previous = 1
    for (let t = 2000 - WEBCAM_FADE_LEAD_MS; t < 2000; t += 10) {
      const v = webcamVisibility(hidden, t)
      expect(v).toBeLessThanOrEqual(previous + 1e-9)
      previous = v
    }
  })

  it('stays hidden between two stretches too close to show the bubble again', () => {
    const close = [
      { startMs: 1000, endMs: 2000 },
      { startMs: 2100, endMs: 3000 },
    ]
    expect(webcamVisibility(close, 2050)).toBeLessThan(0.15)
  })

  it('does not depend on the order of the stretches', () => {
    const first = { startMs: 1000, endMs: 2000 }
    const second = { startMs: 5000, endMs: 6000 }
    for (const t of [900, 2200, 4800, 6300]) {
      expect(webcamVisibility([second, first], t)).toBe(webcamVisibility([first, second], t))
    }
  })
})

describe('webcamBubbleAt', () => {
  it('draws nothing without a webcam, when it is off, or inside a hidden stretch', () => {
    expect(webcamBubbleAt(null, OUT_16x9, 0, 1)).toBeNull()
    expect(webcamBubbleAt(settings({ visible: false }), OUT_16x9, 0, 1)).toBeNull()
    const hidden = settings({ hidden: [{ startMs: 0, endMs: 1000 }] })
    expect(webcamBubbleAt(hidden, OUT_16x9, 500, 1)).toBeNull()
  })

  it('scales and fades the bubble together while it disappears', () => {
    const s = settings({ hidden: [{ startMs: 2000, endMs: 4000 }] })
    const full = webcamBubbleAt(s, OUT_16x9, 0, 1)
    const fading = webcamBubbleAt(s, OUT_16x9, 2000 - WEBCAM_FADE_LEAD_MS / 3, 1)
    if (!full || !fading) throw new Error('expected a bubble')
    expect(full.opacity).toBe(1)
    expect(fading.opacity).toBeGreaterThan(0)
    expect(fading.opacity).toBeLessThan(1)
    expect(fading.radius).toBeLessThan(full.radius)
    expect(fading.radius).toBeGreaterThanOrEqual(full.radius * WEBCAM_FADE_MIN_SCALE)
  })
})

describe('webcam helpers', () => {
  it('maps video time to webcam time with offsetMs', () => {
    expect(webcamTimeMs({}, 1000)).toBe(1000)
    expect(webcamTimeMs({ offsetMs: 300 }, 1000)).toBe(700)
    expect(webcamTimeMs({ offsetMs: -200 }, 1000)).toBe(1200)
    expect(webcamTimeMs({ offsetMs: 300 }, 100)).toBe(0)
  })

  it('cover-crops a centered square of the camera', () => {
    expect(webcamCoverCrop({ width: 1280, height: 720 })).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    })
    expect(webcamCoverCrop({ width: 480, height: 640 })).toEqual({
      x: 0,
      y: 80,
      width: 480,
      height: 480,
    })
  })
})

describe('shapes', () => {
  it('sizes each shape around the same diameter and keeps it in the corner', () => {
    const d = WEBCAM_DIAMETER.medium * 1080
    const margin = WEBCAM_MARGIN * 1080
    const square = webcamBubbleBase('top-left', 'medium', OUT_16x9, 1, undefined, 'square')
    expect(square).toMatchObject({ width: d, height: d })
    expect(square.cornerRadius).toBeLessThan(d / 2)
    const wide = webcamBubbleBase('bottom-right', 'medium', OUT_16x9, 1, undefined, 'landscape')
    expect(wide.width / wide.height).toBeCloseTo(16 / 9)
    expect(wide.x + wide.width / 2).toBeCloseTo(1920 - margin)
    expect(wide.y + wide.height / 2).toBeCloseTo(1080 - margin)
    const tall = webcamBubbleBase('top-right', 'medium', OUT_16x9, 1, undefined, 'portrait')
    expect(tall.height / tall.width).toBeCloseTo(16 / 9)
    expect(tall.y - tall.height / 2).toBeCloseTo(margin)
  })

  it('keeps old projects without a shape round', () => {
    const bubble = webcamBubbleAt(settings(), OUT_16x9, 0, 1)!
    expect(bubble.width).toBe(bubble.height)
    expect(bubble.cornerRadius).toBe(bubble.width / 2)
  })

  it('cover-crops the camera to the shape', () => {
    expect(webcamCoverCrop({ width: 1280, height: 720 }, 9 / 16)).toEqual({
      x: 437.5,
      y: 0,
      width: 405,
      height: 720,
    })
    expect(webcamCoverCrop({ width: 1080, height: 1920 }, 9 / 16)).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
    })
  })

  it('hit-tests the whole box', () => {
    const b = webcamBubbleBase('top-left', 'medium', OUT_16x9, 1, undefined, 'landscape')
    expect(webcamBubbleContains(b, { x: b.x + b.width / 2 - 1, y: b.y })).toBe(true)
    expect(webcamBubbleContains(b, { x: b.x, y: b.y + b.height / 2 + 1 })).toBe(false)
  })
})

describe('free placement', () => {
  it('keeps a free bubble centered on its anchor, inside the frame in any format', () => {
    const mid = webcamBubbleBase('bottom-right', 'medium', OUT_16x9, 1, { x: 0.5, y: 0.5 })
    expect(mid).toMatchObject({ x: 960, y: 540 })
    const r = (WEBCAM_DIAMETER.large * 1080) / 2
    const inset = WEBCAM_MARGIN * 1080 + r
    const edge = webcamBubbleBase('top-left', 'large', OUT_16x9, 1, { x: 0, y: 1 })
    expect(edge.x).toBeCloseTo(inset)
    expect(edge.y).toBeCloseTo(1080 - inset)
    const tall = outputSize('9:16', '1080p')
    const inTall = webcamBubbleBase('top-left', 'large', tall, 1, { x: 1, y: 0.5 })
    expect(inTall.x).toBeCloseTo(tall.width - inset)
  })

  it('shrinks a free bubble around its center', () => {
    const anchor = { x: 0.4, y: 0.6 }
    const full = webcamBubbleBase('top-left', 'medium', OUT_16x9, 1, anchor)
    const small = webcamBubbleBase('top-left', 'medium', OUT_16x9, 0.6, anchor)
    expect(small).toMatchObject({ x: full.x, y: full.y })
    expect(small.radius).toBeCloseTo(full.radius * 0.6)
  })

  it('snaps to a corner when dropped near it, otherwise stays where it was dropped', () => {
    const spot = webcamBubbleBase('top-right', 'medium', OUT_16x9)
    expect(webcamPlacementAt({ x: spot.x - 20, y: spot.y + 30 }, 'medium', OUT_16x9)).toEqual({
      position: 'top-right',
    })
    const free = webcamPlacementAt({ x: 960, y: 540 }, 'medium', OUT_16x9)
    expect(free.anchor).toEqual({ x: 0.5, y: 0.5 })
    // Dropped past the edge: stored where it is actually drawn.
    const out = webcamPlacementAt({ x: 960, y: 5000 }, 'medium', OUT_16x9)
    const drawn = webcamBubbleBase(out.position, 'medium', OUT_16x9, 1, out.anchor)
    expect(drawn.y).toBeCloseTo(out.anchor!.y * 1080)
  })

  it('draws the bubble at its anchor at any time', () => {
    const bubble = webcamBubbleAt(settings({ anchor: { x: 0.5, y: 0.5 } }), OUT_16x9, 0, 1)
    expect(bubble).toMatchObject({ x: 960, y: 540 })
  })
})
