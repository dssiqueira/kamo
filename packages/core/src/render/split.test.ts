import { describe, expect, it } from 'vitest'
import { DEFAULT_WEBCAM, type WebcamSettings } from '../project/schema.ts'
import { outputSize, paddedArea } from './layout.ts'
import {
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  isSplitLayout,
  splitDividerY,
  splitGap,
  splitRatio,
  splitRatioAt,
  splitRegions,
} from './split.ts'
import { WEBCAM_FADE_LEAD_MS, webcamVisibility } from './webcam.ts'

const OUT = outputSize('9:16', '1080p')
const webcam = (over: Partial<WebcamSettings> = {}): WebcamSettings => ({
  ...DEFAULT_WEBCAM,
  layout: 'split',
  ...over,
})

describe('isSplitLayout', () => {
  it('only applies to a visible split webcam in 9:16', () => {
    expect(isSplitLayout(webcam(), '9:16')).toBe(true)
    expect(isSplitLayout(webcam(), '16:9')).toBe(false)
    expect(isSplitLayout(webcam(), '1:1')).toBe(false)
    expect(isSplitLayout(webcam({ visible: false }), '9:16')).toBe(false)
    expect(isSplitLayout(webcam({ layout: 'bubble' }), '9:16')).toBe(false)
    expect(isSplitLayout({ ...DEFAULT_WEBCAM }, '9:16')).toBe(false)
    expect(isSplitLayout(null, '9:16')).toBe(false)
  })
})

describe('splitRatio', () => {
  it('defaults to half and clamps to the allowed range', () => {
    expect(splitRatio(undefined)).toBe(0.5)
    expect(splitRatio({ ratio: 0.62 })).toBe(0.62)
    expect(splitRatio({ ratio: 0 })).toBe(SPLIT_RATIO_MIN)
    expect(splitRatio({ ratio: 1 })).toBe(SPLIT_RATIO_MAX)
    expect(splitRatio({ ratio: Number.NaN })).toBe(0.5)
  })
})

describe('splitRegions', () => {
  it('stacks the screen over the camera inside the padded area, a side margin apart', () => {
    const area = paddedArea(OUT, 8)
    const gap = splitGap(OUT, 8)
    expect(gap).toBeCloseTo(area.x)
    const { screen, camera } = splitRegions(OUT, 8, undefined)
    expect(screen.x).toBeCloseTo(area.x)
    expect(screen.width).toBeCloseTo(area.width)
    expect(camera.width).toBeCloseTo(area.width)
    expect(screen.y).toBeCloseTo(area.y)
    expect(camera.y - (screen.y + screen.height)).toBeCloseTo(gap)
    expect(camera.y + camera.height).toBeCloseTo(area.y + area.height)
    expect(screen.height).toBeCloseTo(camera.height)
  })

  it('gives the screen `ratio` of the height and puts the camera first when asked', () => {
    const { screen, camera } = splitRegions(OUT, 8, { ratio: 0.65, cameraFirst: true })
    expect(screen.height / (screen.height + camera.height)).toBeCloseTo(0.65)
    expect(camera.y).toBeCloseTo(paddedArea(OUT, 8).y)
    expect(screen.y).toBeGreaterThan(camera.y + camera.height)
  })

  it('clamps the ratio so neither card gets too thin', () => {
    const thin = splitRegions(OUT, 8, { ratio: 0.05 })
    expect(thin.screen.height / (thin.screen.height + thin.camera.height)).toBeCloseTo(
      SPLIT_RATIO_MIN,
    )
  })

  it('meets edge to edge with padding 0', () => {
    const { screen, camera, gap } = splitRegions(OUT, 0, undefined)
    expect(gap).toBe(0)
    expect(screen).toMatchObject({ x: 0, y: 0, width: 1080 })
    expect(camera.y).toBeCloseTo(screen.height)
    expect(camera.y + camera.height).toBeCloseTo(1920)
  })

  it('collapses the camera toward the outer edge as it hides', () => {
    const area = paddedArea(OUT, 8)
    const half = splitRegions(OUT, 8, undefined, 0.5)
    const full = splitRegions(OUT, 8, undefined, 1)
    expect(half.camera.height).toBeCloseTo(full.camera.height / 2)
    expect(half.camera.y + half.camera.height).toBeCloseTo(area.y + area.height)
    const hidden = splitRegions(OUT, 8, undefined, 0)
    expect(hidden.camera.height).toBe(0)
    expect(hidden.screen).toEqual(area)
    const top = splitRegions(OUT, 8, { ratio: 0.5, cameraFirst: true }, 0)
    expect(top.screen).toEqual(area)
  })

  it('grows the screen smoothly across a hidden stretch (spring, pure function of time)', () => {
    const hidden = [{ startMs: 5000, endMs: 8000 }]
    const heightAt = (t: number) =>
      splitRegions(OUT, 8, undefined, webcamVisibility(hidden, t)).screen.height
    const area = paddedArea(OUT, 8)
    expect(heightAt(5000 - WEBCAM_FADE_LEAD_MS - 1)).toBeCloseTo(
      splitRegions(OUT, 8, undefined).screen.height,
    )
    expect(heightAt(6000)).toBe(area.height)
    // Continuous: no frame-to-frame jump bigger than a small share of the height.
    let previous = heightAt(4000)
    for (let t = 4000; t <= 9000; t += 1000 / 60) {
      const h = heightAt(t)
      expect(Math.abs(h - previous)).toBeLessThan(area.height * 0.08)
      previous = h
    }
  })
})

describe('splitDividerY and splitRatioAt', () => {
  it('round-trips the divider position for both orders', () => {
    for (const cameraFirst of [false, true]) {
      for (const ratio of [0.3, 0.45, 0.5, 0.7]) {
        const y = splitDividerY(OUT, 8, { ratio, cameraFirst })
        expect(splitRatioAt(OUT, 8, cameraFirst, y)).toBeCloseTo(ratio, 2)
      }
    }
  })

  it('clamps and rounds the dragged ratio', () => {
    expect(splitRatioAt(OUT, 8, false, 0)).toBe(SPLIT_RATIO_MIN)
    expect(splitRatioAt(OUT, 8, false, 1920)).toBe(SPLIT_RATIO_MAX)
    const r = splitRatioAt(OUT, 8, false, 1000.123)
    expect(Math.round(r * 100) / 100).toBe(r)
  })
})
