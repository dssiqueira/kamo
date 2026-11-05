import { describe, expect, it } from 'vitest'
import {
  borderWindow,
  centered,
  clampRect,
  clampSize,
  displayPixels,
  fitSize,
  hitsAny,
  initialSelection,
  moveRect,
  resizeRect,
  resizeTo,
  SELECTION_PRESETS,
  toDip,
  toolbarPosition,
  toPixels,
} from './selection.ts'

const fullHd = { width: 1920, height: 1080, scaleFactor: 1 }
// a 4K display at 150%: 2560 × 1440 DIP
const scaled = { width: 2560, height: 1440, scaleFactor: 1.5 }
// a 2560 × 1600 display at 175%: Electron rounds the DIP size
const odd = { width: 1463, height: 914, scaleFactor: 1.75 }

describe('selection sizes', () => {
  it('measures the display in pixels of the recording', () => {
    expect(displayPixels(fullHd)).toEqual({ width: 1920, height: 1080 })
    expect(displayPixels(scaled)).toEqual({ width: 3840, height: 2160 })
    expect(displayPixels(odd)).toEqual({ width: 2560, height: 1600 })
    expect(displayPixels({ width: 1920, height: 1080, scaleFactor: Number.NaN })).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('keeps sizes even, at least 320 × 240 and at most the display', () => {
    expect(clampSize({ width: 801, height: 451 }, fullHd)).toEqual({ width: 800, height: 450 })
    expect(clampSize({ width: 100, height: 100 }, fullHd)).toEqual({ width: 320, height: 240 })
    expect(clampSize({ width: 5000, height: 5000 }, fullHd)).toEqual({ width: 1920, height: 1080 })
    expect(clampSize({ width: Number.NaN, height: 600 }, fullHd)).toEqual({
      width: 320,
      height: 600,
    })
    // a display smaller than the minimum gives the whole display
    expect(
      clampSize({ width: 100, height: 100 }, { width: 300, height: 201, scaleFactor: 1 }),
    ).toEqual({ width: 300, height: 200 })
  })

  it('keeps the rectangle on the display', () => {
    expect(clampRect({ x: -50, y: 2000, width: 640, height: 480 }, fullHd)).toEqual({
      x: 0,
      y: 600,
      width: 640,
      height: 480,
    })
    expect(clampRect({ x: 10.4, y: 20.6, width: 640, height: 480 }, fullHd)).toEqual({
      x: 10,
      y: 21,
      width: 640,
      height: 480,
    })
  })

  it('moves and stops at the edges', () => {
    const rect = { x: 100, y: 100, width: 640, height: 480 }
    expect(moveRect(rect, 50, -20, fullHd)).toEqual({ x: 150, y: 80, width: 640, height: 480 })
    expect(moveRect(rect, 5000, 5000, fullHd)).toEqual({
      x: 1280,
      y: 600,
      width: 640,
      height: 480,
    })
  })
})

describe('resizing by the edges', () => {
  const rect = { x: 200, y: 200, width: 640, height: 480 }

  it('keeps the opposite edges and even sizes', () => {
    expect(resizeRect(rect, { right: true, bottom: true }, 101, 51, fullHd)).toEqual({
      x: 200,
      y: 200,
      width: 740,
      height: 530,
    })
    // the left edge moves, the right edge (840) stays
    expect(resizeRect(rect, { left: true }, -100, 0, fullHd)).toEqual({
      x: 100,
      y: 200,
      width: 740,
      height: 480,
    })
    expect(resizeRect(rect, { top: true }, 0, 31, fullHd)).toEqual({
      x: 200,
      y: 232,
      width: 640,
      height: 448,
    })
  })

  it('stops at the minimum and at the display', () => {
    expect(resizeRect(rect, { right: true }, -1000, 0, fullHd).width).toBe(320)
    expect(resizeRect(rect, { left: true }, 1000, 0, fullHd)).toEqual({
      x: 520,
      y: 200,
      width: 320,
      height: 480,
    })
    expect(resizeRect(rect, { left: true, top: true }, -1000, -1000, fullHd)).toEqual({
      x: 0,
      y: 0,
      width: 840,
      height: 680,
    })
    expect(resizeRect(rect, { right: true, bottom: true }, 5000, 5000, fullHd)).toEqual({
      x: 200,
      y: 200,
      width: 1720,
      height: 880,
    })
  })
})

describe('typed sizes and presets', () => {
  it('keeps the top left for typed sizes and slides back onto the display', () => {
    const rect = { x: 1000, y: 100, width: 640, height: 480 }
    expect(resizeTo(rect, { width: 801, height: 600 }, fullHd)).toEqual({
      x: 1000,
      y: 100,
      width: 800,
      height: 600,
    })
    expect(resizeTo(rect, { width: 1280, height: 720 }, fullHd)).toEqual({
      x: 640,
      y: 100,
      width: 1280,
      height: 720,
    })
  })

  it('keeps the center for presets', () => {
    const rect = { x: 400, y: 200, width: 640, height: 480 }
    expect(resizeTo(rect, { width: 1080, height: 1080 }, fullHd, 'center')).toEqual({
      x: 180,
      y: 0,
      width: 1080,
      height: 1080,
    })
  })

  it('scales presets down to fit, keeping their shape', () => {
    const [hd, fhd, square, vertical] = SELECTION_PRESETS
    expect(fitSize(hd!, fullHd)).toEqual({ width: 1280, height: 720 })
    expect(fitSize(fhd!, fullHd)).toEqual({ width: 1920, height: 1080 })
    expect(fitSize(square!, fullHd)).toEqual({ width: 1080, height: 1080 })
    // 1080 × 1920 on a 1080-high display: 607.5 × 1080 → 608 (even)
    expect(fitSize(vertical!, fullHd)).toEqual({ width: 608, height: 1080 })
    // a small display (1366 × 768) scales 1920 × 1080 down
    expect(fitSize(fhd!, { width: 1366, height: 768, scaleFactor: 1 })).toEqual({
      width: 1364,
      height: 768,
    })
    // a scaled display has room: presets are pixels, not DIP
    expect(fitSize(vertical!, scaled)).toEqual({ width: 1080, height: 1920 })
  })
})

describe('DIP and pixels', () => {
  it('converts both ways without drift', () => {
    const px = { x: 151, y: 75, width: 962, height: 722 }
    const dip = toDip(px, scaled)
    expect(dip.x).toBeCloseTo(100.667, 2)
    expect(toPixels(dip, scaled)).toEqual(px)
    // what the helper does with it (round(x·s), round((x+w)·s)): exactly these pixels
    expect(Math.round(dip.x * 1.5)).toBe(151)
    expect(Math.round((dip.x + dip.width) * 1.5) - Math.round(dip.x * 1.5)).toBe(962)
    for (const display of [fullHd, scaled, odd]) {
      for (const rect of [
        { x: 1, y: 3, width: 320, height: 240 },
        { x: 333, y: 517, width: 1278, height: 722 },
      ]) {
        expect(toPixels(toDip(rect, display), display)).toEqual(rect)
      }
    }
  })

  it('opens at the remembered selection or 1280 × 720 in the middle', () => {
    expect(initialSelection(null, fullHd)).toEqual({ x: 320, y: 180, width: 1280, height: 720 })
    expect(initialSelection(null, scaled)).toEqual({ x: 1280, y: 720, width: 1280, height: 720 })
    expect(initialSelection(null, { width: 1024, height: 600, scaleFactor: 1 })).toEqual({
      x: 0,
      y: 12,
      width: 1024,
      height: 576,
    })
    // remembered in DIP on a 150% display
    expect(initialSelection({ x: 100, y: 50, width: 640, height: 360 }, scaled)).toEqual({
      x: 150,
      y: 75,
      width: 960,
      height: 540,
    })
    // remembered on a bigger display: brought back onto this one
    expect(initialSelection({ x: 3000, y: 0, width: 3000, height: 500 }, fullHd)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 500,
    })
    expect(centered({ width: 640, height: 480 }, fullHd)).toEqual({
      x: 640,
      y: 300,
      width: 640,
      height: 480,
    })
  })
})

describe('toolbar and recording border', () => {
  const toolbar = { width: 400, height: 44 }
  const display = { width: 1920, height: 1080 }

  it('hangs under the frame, flips above, then goes inside', () => {
    expect(toolbarPosition({ x: 100, y: 100, width: 640, height: 360 }, toolbar, display)).toEqual({
      x: 220,
      y: 460,
      placement: 'below',
    })
    expect(toolbarPosition({ x: 100, y: 700, width: 640, height: 360 }, toolbar, display)).toEqual({
      x: 220,
      y: 656,
      placement: 'above',
    })
    expect(toolbarPosition({ x: 0, y: 0, width: 1920, height: 1080 }, toolbar, display)).toEqual({
      x: 760,
      y: 1024,
      placement: 'inside',
    })
    // a narrow frame at the left edge: the toolbar stays on the display
    expect(toolbarPosition({ x: 0, y: 100, width: 200, height: 200 }, toolbar, display).x).toBe(0)
  })

  it('draws the border around the selection, cut to the display (negative origins too)', () => {
    // a display left of the primary one
    const left = { x: -1920, y: -200, width: 1920, height: 1080 }
    expect(borderWindow({ x: 100, y: 100, width: 640, height: 360 }, left, 3)).toEqual({
      bounds: { x: -1823, y: -103, width: 646, height: 366 },
      inner: { x: 3, y: 3, width: 640, height: 360 },
    })
    // the whole display: no room outside, the border window is the display
    expect(borderWindow({ x: 0, y: 0, width: 1920, height: 1080 }, left, 3)).toEqual({
      bounds: left,
      inner: { x: 0, y: 0, width: 1920, height: 1080 },
    })
    // fractional DIP (a 150% display): whole-DIP bounds around it
    const b = borderWindow({ x: 100.5, y: 50.25, width: 640.5, height: 360 }, fullRect, 3)
    expect(b.bounds).toEqual({ x: 97, y: 47, width: 647, height: 367 })
    expect(b.inner).toEqual({ x: 3.5, y: 3.25, width: 640.5, height: 360 })
  })
})

const fullRect = { x: 0, y: 0, width: 1920, height: 1080 }

describe('hit areas', () => {
  it('takes the mouse over an area only', () => {
    const areas = [
      { x: 94, y: 94, width: 12, height: 12 },
      { x: 300, y: 460, width: 400, height: 44 },
    ]
    expect(hitsAny(areas, 100, 100)).toBe(true)
    expect(hitsAny(areas, 699, 503)).toBe(true)
    expect(hitsAny(areas, 700, 503)).toBe(false)
    expect(hitsAny(areas, 400, 300)).toBe(false)
    expect(hitsAny([], 0, 0)).toBe(false)
  })
})
