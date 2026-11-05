// The welcome tour (F-13, flows.md §1): three slides where Kamo shows how the app works, before
// the permission screens on first run, and again from Settings. Pure navigation, unit tested.

/** The slides, in order: record, click, edit and export. */
export const INTRO_SLIDES = ['record', 'click', 'edit'] as const
export type IntroSlide = (typeof INTRO_SLIDES)[number]

export interface IntroState {
  /** The slide on screen. */
  index: number
  /** Where the last move came from: 1 forward, -1 back (the slide enters from that side). */
  direction: 1 | -1
  /** Set by Next on the last slide or by Skip: the tour is over. */
  finished: boolean
}

export type IntroCommand = 'next' | 'back' | 'skip' | { goTo: number }

export const INTRO_START: IntroState = { index: 0, direction: 1, finished: false }

/** Applies one command. Back on the first slide and moves after the end change nothing. */
export function introStep(
  state: IntroState,
  command: IntroCommand,
  count: number = INTRO_SLIDES.length,
): IntroState {
  if (state.finished) return state
  const last = Math.max(0, count - 1)
  if (command === 'skip') return { ...state, finished: true }
  if (command === 'next') {
    if (state.index >= last) return { ...state, finished: true }
    return { index: state.index + 1, direction: 1, finished: false }
  }
  if (command === 'back') {
    if (state.index <= 0) return state
    return { index: state.index - 1, direction: -1, finished: false }
  }
  const index = Math.min(last, Math.max(0, Math.round(command.goTo)))
  if (index === state.index) return state
  return { index, direction: index > state.index ? 1 : -1, finished: false }
}

/**
 * The tour's keys (only while the tour is on screen, in Kamo's own window): → and Enter go
 * forward, ← goes back, Esc skips. Enter on a focused button is left to the button, so one
 * press never moves twice; held keys (auto-repeat) are ignored.
 */
export function introKeyCommand(
  key: string,
  options: { onControl?: boolean; repeat?: boolean } = {},
): IntroCommand | null {
  if (options.repeat) return null
  switch (key) {
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'back'
    case 'Enter':
      return options.onControl ? null : 'next'
    case 'Escape':
      return 'skip'
    default:
      return null
  }
}
