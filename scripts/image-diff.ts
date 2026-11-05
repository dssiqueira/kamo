// Pixel comparison for the visual regression (scripts/visual-regression.ts). Pure: works on
// RGBA byte arrays, so it is tested without a canvas.

export interface DiffOptions {
  /** a pixel differs when any channel moves more than this (0–255) */
  channelTolerance: number
  /** the images match while at most this share of pixels differ (0–1) */
  maxDifferentRatio: number
}

/**
 * Defaults sized for Skia on different OSes and CPUs: anti-aliased edges, gradients and text
 * can move by a few levels; a moved box, a wrong color or a missing layer moves far more.
 */
export const DEFAULT_DIFF: DiffOptions = { channelTolerance: 24, maxDifferentRatio: 0.002 }

export interface DiffResult {
  match: boolean
  /** pixels over the channel tolerance */
  different: number
  total: number
  /** largest channel difference seen (0–255) */
  maxDelta: number
  /** RGBA picture of the differences (red where over tolerance, faded reference elsewhere) */
  diff: Uint8ClampedArray
}

export function diffImages(
  actual: Uint8ClampedArray,
  expected: Uint8ClampedArray,
  options: DiffOptions = DEFAULT_DIFF,
): DiffResult {
  if (actual.length !== expected.length || actual.length % 4 !== 0) {
    throw new Error(`image sizes differ: ${actual.length} vs ${expected.length} bytes`)
  }
  const total = actual.length / 4
  const diff = new Uint8ClampedArray(actual.length)
  let different = 0
  let maxDelta = 0
  for (let i = 0; i < actual.length; i += 4) {
    let delta = 0
    for (let c = 0; c < 4; c++) {
      delta = Math.max(delta, Math.abs(actual[i + c]! - expected[i + c]!))
    }
    maxDelta = Math.max(maxDelta, delta)
    if (delta > options.channelTolerance) {
      different++
      diff[i] = 255
      diff[i + 1] = 0
      diff[i + 2] = 0
      diff[i + 3] = 255
    } else {
      const gray = (expected[i]! + expected[i + 1]! + expected[i + 2]!) / 3
      const faded = 255 - (255 - gray) * 0.25
      diff[i] = faded
      diff[i + 1] = faded
      diff[i + 2] = faded
      diff[i + 3] = 255
    }
  }
  return {
    match: different <= total * options.maxDifferentRatio,
    different,
    total,
    maxDelta,
    diff,
  }
}
