// The language screen (F-13, flows.md §1): the first screen on first run. Kamo says hi in the
// five launch languages and the user picks one; the whole window switches to it at once, so the
// welcome tour that follows already speaks it. Saved on Continue (by the app).
import { LOCALES, isLocale, loadMessages, type Locale, type Messages } from '@kamo/i18n'
import { useEffect, useRef, useState } from 'react'
import { useLocale, useSetLocale, useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { PrimaryButton } from '../settings/parts.tsx'
import { localeName } from '../settings/Settings.tsx'
import { initialLanguage, languageKeyCommand, moveLanguage } from './language.ts'

export interface LanguagePickerProps {
  /** The OS language when Kamo speaks it (that row says "Same as your system"); else undefined. */
  system: Locale | undefined
  /** Continue (button or Enter), with the language already on screen. */
  onContinue(choice: Locale): void
}

type Greetings = Partial<Record<Locale, string>>

const GREETING_KEY = ['onboarding', 'language', 'hello'] as const

function greetingIn(messages: Messages): string | undefined {
  let node: string | Messages | undefined = messages
  for (const key of GREETING_KEY) {
    node = typeof node === 'object' ? node[key] : undefined
  }
  return typeof node === 'string' ? node : undefined
}

// Each greeting is written in its own language, so every bundle is read once (desktop only:
// they ship with the app). Kept across remounts: the window re-renders on every pick.
let greetingsCache: Greetings | null = null
let greetingsLoad: Promise<Greetings> | undefined

function loadGreetings(): Promise<Greetings> {
  greetingsLoad ??= Promise.all(
    LOCALES.map(async (locale) => [locale, greetingIn(await loadMessages(locale))] as const),
  ).then((entries) => {
    const greetings: Greetings = {}
    for (const [locale, text] of entries) if (text) greetings[locale] = text
    greetingsCache = greetings
    return greetings
  })
  return greetingsLoad
}

function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null
  )
}

function isChoice(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[role="radio"]') !== null
}

export function LanguagePicker({ system, onContinue }: LanguagePickerProps) {
  const t = useT()
  const uiLocale = useLocale()
  const setLocale = useSetLocale()
  // The choice is the language on screen (the saved one or the system's when the screen opens).
  const selected = initialLanguage(isLocale(uiLocale) ? uiLocale : undefined, system)
  const [greetings, setGreetings] = useState<Greetings | null>(greetingsCache)
  const choices = useRef(new Map<Locale, HTMLButtonElement>())

  useEffect(() => {
    if (greetings) return
    let cancelled = false
    void loadGreetings()
      .then((loaded) => {
        if (!cancelled) setGreetings(loaded)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [greetings])

  // A new language re-renders the whole window: the focus stays on the chosen row.
  useEffect(() => {
    choices.current.get(selected)?.focus()
  }, [selected])

  const choose = (next: Locale) => {
    if (next !== selected) void setLocale(next).catch(() => {})
  }

  // Keys in Kamo's window only (never system-wide): arrows move, Enter continues.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const command = languageKeyCommand(event.key, {
        onChoice: isChoice(event.target),
        onControl: isControl(event.target),
        repeat: event.repeat,
      })
      if (!command) return
      event.preventDefault()
      if (command === 'continue') onContinue(selected)
      else {
        const next = moveLanguage(selected, command)
        if (next !== selected) void setLocale(next).catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onContinue, setLocale])

  return (
    <section className="relative flex w-full max-w-[860px] flex-wrap items-center justify-center gap-2xl">
      <div className="flex w-[300px] shrink-0 flex-col items-center gap-lg">
        <Mascot pose="head-happy" size={190} backdrop />
        {/* "Hi" in each language, in its own font stack; the one on screen stands out. */}
        <p
          aria-hidden
          className="flex min-h-[32px] flex-wrap items-baseline justify-center gap-x-md gap-y-xs text-title"
        >
          {LOCALES.map((locale) => (
            <span
              key={locale}
              lang={locale}
              className={
                locale === selected
                  ? 'font-semibold text-primary-strong'
                  : 'font-normal text-on-surface-muted'
              }
            >
              {greetings?.[locale] ?? ''}
            </span>
          ))}
        </p>
      </div>

      <div className="flex w-full max-w-[440px] flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <h1 id="onboarding-language-title" className="font-serif text-headline">
            {t('onboarding.language.title')}
          </h1>
          <p className="text-body text-on-surface-muted">{t('onboarding.language.body')}</p>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="onboarding-language-title"
          className="flex flex-col gap-sm"
        >
          {LOCALES.map((locale) => {
            const checked = locale === selected
            return (
              <button
                key={locale}
                ref={(node) => {
                  if (node) choices.current.set(locale, node)
                  else choices.current.delete(locale)
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-language={locale}
                onClick={() => choose(locale)}
                className={`flex w-full items-center gap-md rounded-lg border-2 px-lg py-[10px] text-start transition-colors ${
                  checked
                    ? 'border-tertiary bg-tertiary-container text-on-surface'
                    : 'border-border bg-surface text-on-surface hover:bg-surface-raised'
                } ${FOCUS_RING}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  {/* Never translated: each name in its own language and font stack. */}
                  <span lang={locale} className="text-title font-semibold">
                    {localeName(locale)}
                  </span>
                  {locale === system && (
                    <span lang={uiLocale} className="text-label text-on-surface-muted">
                      {t('onboarding.language.system')}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-2 ${
                    checked ? 'border-tertiary bg-tertiary' : 'border-border bg-surface'
                  }`}
                >
                  {checked && <span className="block h-[8px] w-[8px] rounded-full bg-surface" />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex justify-end" data-language-continue>
          <PrimaryButton onClick={() => onContinue(selected)}>
            {t('onboarding.continue')}
          </PrimaryButton>
        </div>
      </div>
    </section>
  )
}
