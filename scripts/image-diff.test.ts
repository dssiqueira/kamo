import { describe, expect, it } from 'vitest'
import { diffImages } from './image-diff.ts'

function image(pixels: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return data
}

describe('diffImages', () => {
  it('matches identical images', () => {
    const a = image(100, [10, 20, 30, 255])
    const result = diffImages(a, a.slice())
    expect(result).toMatchObject({ match: true, different: 0, total: 100, maxDelta: 0 })
  })

  it('ignores small channel moves (anti-aliasing on another OS)', () => {
    const result = diffImages(image(100, [10, 20, 30, 255]), image(100, [30, 20, 30, 255]))
    expect(result.match).toBe(true)
    expect(result.maxDelta).toBe(20)
  })

  it('fails when more than the allowed share of pixels moves', () => {
    const expected = image(1000, [0, 0, 0, 255])
    const actual = expected.slice()
    for (let p = 0; p < 3; p++) actual[p * 4] = 200
    const result = diffImages(actual, expected)
    expect(result).toMatchObject({ match: false, different: 3, maxDelta: 200 })
    expect(result.diff[0]).toBe(255)
    expect(result.diff[1]).toBe(0)
  })

  it('throws on different sizes', () => {
    expect(() => diffImages(image(2, [0, 0, 0, 0]), image(3, [0, 0, 0, 0]))).toThrow()
  })
})
