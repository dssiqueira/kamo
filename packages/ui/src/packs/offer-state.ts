// What the "Transcribe" offer (A-05, flows.md §5) shows, from main's pack status alone: pure,
// so the states are tested without rendering. One state at a time, and so one error at most.
import type { PackView, PackViewId, PacksView } from './types.ts'

export type OfferStage =
  /** A transcription pack is installed: ask the one-time question, then transcribe. */
  | { stage: 'ready'; pack: PackView }
  /** The chosen pack is on its way (or stopped: paused, failed): its progress and controls. */
  | { stage: 'working'; pack: PackView }
  /** The list of packs could not be loaded: one notice with one retry, nothing per pack. */
  | { stage: 'unavailable'; error: string }
  /** Pick a pack. `loading`: the list is still on its way (sizes are estimates, no download). */
  | { stage: 'choosing'; loading: boolean }

const MOVING = new Set<PackView['state']>(['downloading', 'verifying'])

export function transcriptionPacks(packs: PacksView): PackView[] {
  return packs.packs.filter((pack) => pack.kind === 'transcription')
}

/**
 * @param started the pack the user asked for in this offer (null before the click, and again
 *   after Cancel).
 */
export function offerStage(packs: PacksView, started: PackViewId | null): OfferStage {
  const list = transcriptionPacks(packs)
  const installed =
    list.find((pack) => pack.id === started && pack.installedVersion !== null) ??
    list.find((pack) => pack.installedVersion !== null)
  if (installed) return { stage: 'ready', pack: installed }

  const chosen = started ? list.find((pack) => pack.id === started) : undefined
  if (chosen) {
    // Nothing started because the list failed: that is the error, not this pack.
    if (chosen.state === 'not_installed' && packs.catalog === 'error') {
      return { stage: 'unavailable', error: packs.catalogError ?? 'offline' }
    }
    return { stage: 'working', pack: chosen }
  }
  // A download started elsewhere (Settings → Packs) is still running.
  const moving = list.find((pack) => MOVING.has(pack.state))
  if (moving) return { stage: 'working', pack: moving }

  if (packs.catalog === 'error') {
    return { stage: 'unavailable', error: packs.catalogError ?? 'offline' }
  }
  return { stage: 'choosing', loading: packs.catalog !== 'ready' }
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

/** A pack that can be picked: this computer has a build of it. */
export function selectable(pack: PackView): boolean {
  return pack.error !== 'unsupported_platform'
}
