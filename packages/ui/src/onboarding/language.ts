// The language screen (F-13, flows.md §1): the first screen on first run, before the welcome
// tour, so the tour already speaks the user's language. Pure choices and keys, unit tested.
import { LOCALES, SOURCE_LOCALE, isLocale, resolveLocale, type Locale } from '@kamo/i18n'

/** What settings.json stores: 'system' follows the OS language (D-021), a locale pins it. */
export type LanguageSetting = 'system' | Locale

/**
 * The OS language when Kamo speaks it (from `app.getLocale()`-style tags, best first), else
 * undefined: `resolveLocale` alone can't tell English from "none of the five".
 */
export function systemLanguage(preferred: readonly string[]): Locale | undefined {
  const speaks = preferred.some(
    (tag) => resolveLocale([tag]) !== SOURCE_LOCALE || /^en(-|_|$)/i.test(tag),
  )
  return speaks ? resolveLocale(preferred) : undefined
}

/**
 * The language selected when the screen opens: the one already saved (Kamo closed during the
 * onboarding), else the system's when Kamo speaks it, else English.
 */
export function initialLanguage(
  stored: LanguageSetting | undefined,
  system: string | undefined,
): Locale {
  if (stored && stored !== 'system' && isLocale(stored)) return stored
  return system && isLocale(system) ? system : 'en'
}

/** Keeping the system's language saves 'system', so Kamo follows the OS if it changes later. */
export function languageSetting(choice: Locale, system: string | undefined): LanguageSetting {
  return choice === system ? 'system' : choice
}

export type LanguageCommand = 'next' | 'previous' | 'first' | 'last' | 'continue'

/**
 * Keys while the screen shows (Kamo's own window only): arrows move the choice (radio group),
 * Home and End jump, Enter continues. Enter on a button other than a choice is left to it;
 * held keys are ignored, since every move switches the whole UI language.
 */
export function languageKeyCommand(
  key: string,
  options: { onChoice?: boolean; onControl?: boolean; repeat?: boolean } = {},
): LanguageCommand | null {
  if (options.repeat) return null
  if (options.onControl && !options.onChoice) return null
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return 'next'
    case 'ArrowUp':
    case 'ArrowLeft':
      return 'previous'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case 'Enter':
      return 'continue'
    default:
      return null
  }
}

/** The choice after a move. Arrows wrap around, like any radio group. */
export function moveLanguage(
  current: Locale,
  command: Exclude<LanguageCommand, 'continue'>,
  locales: readonly Locale[] = LOCALES,
): Locale {
  const count = locales.length
  const index = Math.max(0, locales.indexOf(current))
  const target =
    command === 'first'
      ? 0
      : command === 'last'
        ? count - 1
        : (index + (command === 'next' ? 1 : -1) + count) % count
  return locales[target] ?? current
}
