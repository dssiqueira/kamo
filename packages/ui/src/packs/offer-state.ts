// What the "Transcribe" offer (A-05, flows.md §5) shows, from main's pack status alone: pure,
// so the states are tested without rendering. One state at a time, and so one error at most.
import type { CardTranscriptState, PackView, PackViewId, PacksView } from './types.ts'

export type OfferStage =
  /** A model is installed: ask the one-time question, then transcribe. */
  | { stage: 'ready'; pack: PackView }
  /** The chosen model is on its way (or stopped: paused, failed): its progress and controls. */
  | { stage: 'working'; pack: PackView }
  /** This build cannot transcribe at all (no whisper-cli): one calm notice, nothing to pick. */
  | { stage: 'unavailable'; error: 'program_missing' }
  /** Pick a model. */
  | { stage: 'choosing' }

const MOVING = new Set<PackView['state']>(['downloading', 'verifying'])

export function transcriptionPacks(packs: PacksView): PackView[] {
  return [...packs.packs]
}

/**
 * @param started the pack the user asked for in this offer (null before the click, and again
 *   after Cancel).
 */
export function offerStage(packs: PacksView, started: PackViewId | null): OfferStage {
  // Without the program a model would be downloaded for nothing: say so first.
  if (packs.program === 'missing') return { stage: 'unavailable', error: 'program_missing' }
  const list = transcriptionPacks(packs)
  const installed =
    list.find((pack) => pack.id === started && pack.installedVersion !== null) ??
    list.find((pack) => pack.installedVersion !== null)
  if (installed) return { stage: 'ready', pack: installed }

  const chosen = started ? list.find((pack) => pack.id === started) : undefined
  if (chosen) return { stage: 'working', pack: chosen }
  // A download started elsewhere (Settings → Optional packs) is still running.
  const moving = list.find((pack) => MOVING.has(pack.state))
  if (moving) return { stage: 'working', pack: moving }
  return { stage: 'choosing' }
}

/** The Light model is weak in Chinese and Japanese (features.md A-05). */
export function recommendedPack(locale: string): PackViewId {
  return /^(zh|ja)\b/i.test(locale) ? 'transcribe-accurate' : 'transcribe-light'
}

/** The pack selected when the offer opens: a download left paused, else the recommended one. */
export function defaultChoice(packs: PacksView, locale: string): PackViewId {
  const paused = transcriptionPacks(packs).find((pack) => pack.state === 'paused')
  return paused?.id ?? recommendedPack(locale)
}

/** How a pack compares, out of METER_MAX (drawn as two small meters on its card). */
export const METER_MAX = 5
export function packMeters(quality: PackView['quality']): { speed: number; accuracy: number } {
  return quality === 'light' ? { speed: 4, accuracy: 3 } : { speed: 2, accuracy: 5 }
}

/** One reading of a download: when (ms) and how many bytes had arrived. */
export interface RateSample {
  at: number
  bytes: number
}

/** The readings the estimate looks back on: long enough to smooth bursts, short to follow. */
export const RATE_WINDOW_MS = 8_000
/** Less than this much history says nothing about the rate yet. */
const RATE_MIN_SPAN_MS = 1_500

/** Keeps the samples inside the window (and the one right before it, as the anchor). */
export function addRateSample(samples: readonly RateSample[], next: RateSample): RateSample[] {
  const last = samples.at(-1)
  // A smaller count is a new download (cancel, then start again): start over.
  const kept = last && next.bytes < last.bytes ? [] : [...samples]
  kept.push(next)
  while (kept.length > 2 && next.at - kept[1]!.at >= RATE_WINDOW_MS) kept.shift()
  return kept
}

/**
 * Seconds left at the rate observed over the window, or null while there is too little to
 * tell (just started, just resumed, nothing arriving).
 */
export function estimateSecondsLeft(
  samples: readonly RateSample[],
  totalBytes: number,
): number | null {
  const first = samples[0]
  const last = samples.at(-1)
  if (!first || !last || last.at - first.at < RATE_MIN_SPAN_MS) return null
  const rate = (last.bytes - first.bytes) / ((last.at - first.at) / 1000)
  if (rate <= 0) return null
  return Math.max(0, (totalBytes - last.bytes) / rate)
}

/** After the pack is in: what the offer shows while the first transcript is made. */
export type FinishStage = 'asking' | 'transcribing' | 'done' | 'failed' | 'no_audio'

export function finishStage(
  asking: boolean,
  transcript: CardTranscriptState | undefined,
): FinishStage {
  if (asking) return 'asking'
  switch (transcript?.state) {
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
    case 'no_audio':
      return 'no_audio'
    default:
      return 'transcribing'
  }
}
