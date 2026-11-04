import type { createI18n } from '@kamo/i18n'
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'

/** The i18next instance created by `createI18n` from `@kamo/i18n`. */
export type I18n = Awaited<ReturnType<typeof createI18n>>

/** Translates a key from `@kamo/i18n` (ICU MessageFormat values). */
export type Translate = (key: string, values?: Record<string, unknown>) => string

const I18nContext = createContext<I18n | null>(null)

export interface I18nProviderProps {
  i18n: I18n
  children: ReactNode
}

/**
 * Makes the app's i18n instance available to `useT`/`useLocale`, re-renders on language change
 * and keeps `<html lang>` in sync (DESIGN.md: it selects the CJK font stack).
 */
export function I18nProvider({ i18n, children }: I18nProviderProps) {
  const language = useSyncExternalStore(
    (onChange) => {
      i18n.on('languageChanged', onChange)
      return () => i18n.off('languageChanged', onChange)
    },
    () => i18n.language,
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // Keyed by language so every consumer re-renders when it changes.
  return (
    <I18nContext.Provider key={language} value={i18n}>
      {children}
    </I18nContext.Provider>
  )
}

function useI18n(): I18n {
  const i18n = useContext(I18nContext)
  if (!i18n) throw new Error('useT and useLocale must be used inside <I18nProvider>')
  return i18n
}

/** Returns the translate function for the current language. */
export function useT(): Translate {
  const i18n = useI18n()
  return (key, values) => i18n.t(key, values ?? {})
}

/** Returns the current UI language (BCP 47). */
export function useLocale(): string {
  return useI18n().language
}
