// Level meters for the Home audio toggles (F-04). Pure math, shared by the desktop audio
// recorder page (which measures) and the meters (which draw).

/** Quietest level the meter shows; anything below reads as silence. */
export const METER_FLOOR_DB = -60

/** Root mean square of PCM samples in [-1, 1] (AnalyserNode time-domain data). */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * RMS to a 0 to 1 meter position on a dB scale (perceptual: a whisper still moves it), from
 * METER_FLOOR_DB to 0 dBFS.
 */
export function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0
  const db = 20 * Math.log10(rms)
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB))
}

/**
 * Meter ballistics: rises at once, falls gently (`release` of the drop per update), so a
 * voice reads as a steady bar instead of flicker at 10 to 15 updates per second.
 */
export function smoothLevel(previous: number, next: number, release = 0.35): number {
  if (next >= previous) return next
  return Math.max(next, previous - (previous - next) * release - 0.02)
}
