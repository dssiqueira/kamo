import { describe, expect, it } from 'vitest'
import { HEAD_CROP, cropFor, downsample } from './toolbar-frames.ts'

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return data
}

describe('cropFor', () => {
  it('is the head crop for head-look at the art size', () => {
    expect(cropFor('head-look', 180)).toEqual(HEAD_CROP)
  })

  it('lines the other poses up with head-look, at any art size', () => {
    expect(cropFor('head-blink', 180)).toEqual({ x: -12, y: 10, size: 160 })
    expect(cropFor('head-look-side', 360)).toEqual({ x: -10, y: 12, size: 320 })
  })
})

describe('downsample', () => {
  it('keeps a flat colour flat', () => {
    const out = downsample(
      solid(160, 160, [120, 180, 90, 255]),
      160,
      160,
      { x: 0, y: 0, size: 160 },
      16,
    )
    expect(out.length).toBe(16 * 16 * 4)
    expect([...out.slice(0, 4)]).toEqual([120, 180, 90, 255])
    expect([...out.slice(-4)]).toEqual([120, 180, 90, 255])
  })

  it('averages coverage: half a pixel of colour is half opaque, not darker', () => {
    // Left column white and opaque, right column transparent black.
    const white = [255, 255, 255, 255]
    const clear = [0, 0, 0, 0]
    const source = new Uint8ClampedArray([...white, ...clear, ...white, ...clear])
    const out = downsample(source, 2, 2, { x: 0, y: 0, size: 2 }, 1)
    expect([...out]).toEqual([255, 255, 255, 128])
  })

  it('treats pixels outside the image as transparent', () => {
    const out = downsample(solid(2, 2, [10, 20, 30, 255]), 2, 2, { x: -2, y: 0, size: 4 }, 2)
    expect(out[3]).toBe(0)
    expect(out[4 + 3]).toBeGreaterThan(0)
  })
})
