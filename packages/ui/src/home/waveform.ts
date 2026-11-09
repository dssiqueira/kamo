// The computer sound card's waveform (F-04): bar heights from the live level. Pure math, so it
// is tested in Node; the card draws it and springs each bar towards its target.
import { SPRING } from '@kamo/core'

/** Bars across the card. Odd, so one sits in the middle. */
export const WAVE_BARS = 31
/** Height of a bar in silence: a row of dots, never nothing. */
export const WAVE_FLOOR = 0.08

/** 1 in the middle, fading towards the sides (a bell, not a ramp). */
export function waveEnvelope(index: number, count = WAVE_BARS): number {
  const middle = (count - 1) / 2
  const distance = middle === 0 ? 0 : (index - middle) / middle
  return Math.exp(-2.4 * distance * distance)
}

/** A fixed number in [0, 1) per bar, so every bar moves in its own way, the same each time. */
export function waveSeed(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Target heights, 0 to 1, for a level (0 to 1, see audioLevel.ts). `tick` counts level updates:
 * each bar's share of the level drifts slowly with it (a sine per bar, not random), so the
 * shape changes while someone talks without flickering.
 */
export function waveTargets(level: number, tick: number, count = WAVE_BARS): number[] {
  const clamped = Math.min(1, Math.max(0, level))
  const heights: number[] = []
  for (let i = 0; i < count; i++) {
    const seed = waveSeed(i)
    const drift = 0.5 + 0.5 * Math.sin(seed * Math.PI * 2 + tick * (0.35 + seed * 0.5))
    const share = 0.55 + 0.45 * drift
    heights.push(WAVE_FLOOR + (1 - WAVE_FLOOR) * clamped * waveEnvelope(i, count) * share)
  }
  return heights
}

/** One bar's spring state. */
export interface WaveBar {
  x: number
  v: number
}

/**
 * Moves every bar towards its target with the Kamo spring (rule 10: stiffness 170, damping
 * 26), semi-implicit Euler with a capped step. Returns whether anything still moves.
 */
export function stepWave(bars: WaveBar[], targets: readonly number[], dtSeconds: number): boolean {
  const dt = Math.min(0.032, Math.max(0, dtSeconds))
  let moving = false
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    if (!bar) continue
    const target = targets[i] ?? WAVE_FLOOR
    const force = -SPRING.stiffness * (bar.x - target) - SPRING.damping * bar.v
    bar.v += force * dt
    bar.x = Math.min(1, Math.max(0, bar.x + bar.v * dt))
    if (Math.abs(bar.x - target) > 0.001 || Math.abs(bar.v) > 0.001) moving = true
    else {
      bar.x = target
      bar.v = 0
    }
  }
  return moving
}
