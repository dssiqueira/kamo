import { describe, expect, it } from 'vitest'
import {
  computeLayout,
  cropFor,
  isInCrop,
  outputSize,
  outputToSource,
  sourceToOutput,
  type LayoutInput,
} from './layout.ts'

const SOURCE_16x9 = { width: 2560, height: 1440 }
const style = (padding: number, radius = 12) => ({ padding, radius })

function layout(over: Partial<LayoutInput> = {}) {
  return computeLayout({
    output: outputSize('16:9', '1080p'),
    sourceSize: SOURCE_16x9,
    style: style(0),
    aspect: '16:9',
    ...over,
  })
}

describe('outputSize', () => {
  it('gives the 1080p sizes per aspect', () => {
    expect(outputSize('16:9', '1080p')).toEqual({ width: 1920, height: 1080 })
    expect(outputSize('1:1', '1080p')).toEqual({ width: 1080, height: 1080 })
    expect(outputSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 })
  })

  it('doubles for 4k', () => {
    expect(outputSize('16:9', '4k')).toEqual({ width: 3840, height: 2160 })
    expect(outputSize('1:1', '4k')).toEqual({ width: 2160, height: 2160 })
    expect(outputSize('9:16', '4k')).toEqual({ width: 2160, height: 3840 })
  })
})

describe('computeLayout: frame and radius', () => {
  it('fills the whole output with padding 0', () => {
    expect(layout().frame).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('takes 20% off each side with padding 20, keeping the output aspect', () => {
    const { frame } = layout({ style: style(20) })
    expect(frame.x).toBeCloseTo(384)
    expect(frame.y).toBeCloseTo(216)
    expect(frame.width).toBeCloseTo(1152)
    expect(frame.height).toBeCloseTo(648)
    expect(frame.width / frame.height).toBeCloseTo(16 / 9)
  })

  it('clamps padding to 0..20', () => {
    expect(layout({ style: style(35) }).frame).toEqual(layout({ style: style(20) }).frame)
    expect(layout({ style: style(-5) }).frame).toEqual(layout({ style: style(0) }).frame)
  })

  it('pads a 1:1 output into a centered square', () => {
    const { frame } = layout({
      output: outputSize('1:1', '1080p'),
      aspect: '1:1',
      style: style(10),
    })
    expect(frame.x).toBeCloseTo(108)
    expect(frame.y).toBeCloseTo(108)
    expect(frame.width).toBeCloseTo(864)
    expect(frame.height).toBeCloseTo(864)
  })

  it('fits a 16:10 source inside the 16:9 frame area without cropping', () => {
    const { frame, crop } = layout({ sourceSize: { width: 2880, height: 1800 } })
    expect(frame.height).toBeCloseTo(1080)
    expect(frame.width).toBeCloseTo(1728)
    expect(frame.x).toBeCloseTo(96)
    expect(crop).toEqual({ x: 0, y: 0, width: 2880, height: 1800 })
  })

  it('keeps the radius in 1080p pixels and scales it with the output', () => {
    expect(layout({ style: style(8, 12) }).radius).toBeCloseTo(12)
    expect(layout({ output: outputSize('16:9', '4k'), style: style(8, 12) }).radius).toBeCloseTo(24)
    expect(
      layout({ output: outputSize('9:16', '1080p'), aspect: '9:16', style: style(8, 32) }).radius,
    ).toBeCloseTo(32)
    expect(layout({ style: style(0, 0) }).radius).toBe(0)
  })

  it('never makes the radius larger than half the frame', () => {
    const { radius, frame } = layout({ output: { width: 40, height: 20 }, style: style(0, 9999) })
    expect(radius).toBe(Math.min(frame.width, frame.height) / 2)
  })
})

describe('computeLayout: crop', () => {
  it('equals the viewport for a 16:9 source in 16:9', () => {
    const viewport = { x: 640, y: 360, width: 1280, height: 720 }
    const result = layout({ viewport })
    expect(result.crop).toEqual(viewport)
    expect(result.scale).toBeCloseTo(1920 / 1280)
  })

  it('uses the whole source without a viewport', () => {
    expect(layout().crop).toEqual({ x: 0, y: 0, width: 2560, height: 1440 })
  })

  it('takes the centered square of the viewport in 1:1', () => {
    const { crop } = layout({ output: outputSize('1:1', '1080p'), aspect: '1:1' })
    expect(crop).toEqual({ x: 560, y: 0, width: 1440, height: 1440 })
  })

  it('follows a zoomed viewport in 1:1 (not a fixed center crop)', () => {
    const viewport = { x: 100, y: 200, width: 1280, height: 720 }
    const { crop } = layout({ output: outputSize('1:1', '1080p'), aspect: '1:1', viewport })
    expect(crop.width).toBeCloseTo(720)
    expect(crop.height).toBeCloseTo(720)
    expect(crop.x + crop.width / 2).toBeCloseTo(100 + 640)
    expect(crop.y + crop.height / 2).toBeCloseTo(200 + 360)
  })

  it('takes a 9:16 slice of the viewport', () => {
    const viewport = { x: 0, y: 0, width: 2560, height: 1440 }
    const { crop } = layout({ output: outputSize('9:16', '1080p'), aspect: '9:16', viewport })
    expect(crop.height).toBeCloseTo(1440)
    expect(crop.width).toBeCloseTo((1440 * 9) / 16)
    expect(crop.x + crop.width / 2).toBeCloseTo(1280)
  })

  it('keeps the crop inside the source when the viewport is at an edge or outside', () => {
    const left = cropFor({ x: -300, y: -50, width: 1280, height: 720 }, SOURCE_16x9, 1)
    // the viewport is first pulled inside (x 0..1280), then its centered square is taken
    expect(left.x).toBe(280)
    expect(left.y).toBe(0)
    const right = cropFor({ x: 2200, y: 1000, width: 1280, height: 720 }, SOURCE_16x9, 1)
    expect(right.x + right.width).toBeCloseTo(2560 - 280)
    expect(right.y + right.height).toBeCloseTo(1440)
  })

  it('shrinks a viewport larger than the source', () => {
    const crop = cropFor({ x: -100, y: -100, width: 5120, height: 2880 }, SOURCE_16x9, 16 / 9)
    expect(crop).toEqual({ x: 0, y: 0, width: 2560, height: 1440 })
  })

  it('crops a taller-than-frame viewport by width', () => {
    const crop = cropFor({ x: 0, y: 0, width: 1000, height: 1000 }, SOURCE_16x9, 2)
    expect(crop).toEqual({ x: 0, y: 250, width: 1000, height: 500 })
  })

  it('always gives the crop the frame aspect', () => {
    for (const aspect of ['16:9', '1:1', '9:16'] as const) {
      for (const padding of [0, 8, 20]) {
        const viewport = { x: 900, y: 500, width: 853, height: 480 }
        const r = layout({
          output: outputSize(aspect, '1080p'),
          aspect,
          style: style(padding),
          viewport,
        })
        expect(r.crop.width / r.crop.height).toBeCloseTo(r.frame.width / r.frame.height, 9)
      }
    }
  })
})

describe('sourceToOutput', () => {
  it('maps the crop corners onto the frame corners', () => {
    const r = layout({ style: style(10), viewport: { x: 640, y: 360, width: 1280, height: 720 } })
    expect(sourceToOutput({ x: 640, y: 360 }, r)).toEqual({ x: r.frame.x, y: r.frame.y })
    const end = sourceToOutput({ x: 1920, y: 1080 }, r)
    expect(end.x).toBeCloseTo(r.frame.x + r.frame.width)
    expect(end.y).toBeCloseTo(r.frame.y + r.frame.height)
  })

  it('round-trips with outputToSource in every format', () => {
    for (const aspect of ['16:9', '1:1', '9:16'] as const) {
      const r = layout({
        output: outputSize(aspect, '4k'),
        aspect,
        style: style(13),
        viewport: { x: 333, y: 211, width: 1100, height: 618.75 },
      })
      for (const p of [
        { x: 0, y: 0 },
        { x: 800, y: 500 },
        { x: 2559, y: 1439 },
      ]) {
        const back = outputToSource(sourceToOutput(p, r), r)
        expect(back.x).toBeCloseTo(p.x, 9)
        expect(back.y).toBeCloseTo(p.y, 9)
      }
    }
  })

  it('tells whether a point is inside the crop', () => {
    const r = layout({ viewport: { x: 640, y: 360, width: 1280, height: 720 } })
    expect(isInCrop({ x: 1000, y: 700 }, r)).toBe(true)
    expect(isInCrop({ x: 100, y: 700 }, r)).toBe(false)
    expect(isInCrop({ x: 1000, y: 1200 }, r)).toBe(false)
  })
})
