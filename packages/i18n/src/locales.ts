// UI languages (D-021). English is the source; the others follow the same keys.
export const SOURCE_LOCALE = 'en'

export const LOCALES = ['en', 'pt-BR', 'es', 'zh-CN', 'ja'] as const

export type Locale = (typeof LOCALES)[number]

export type Messages = { [key: string]: string | Messages }

// Loaded on demand so the extension only ships the language in use.
const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import('./locales/en.json', { with: { type: 'json' } }),
  'pt-BR': () => import('./locales/pt-BR.json', { with: { type: 'json' } }),
  es: () => import('./locales/es.json', { with: { type: 'json' } }),
  'zh-CN': () => import('./locales/zh-CN.json', { with: { type: 'json' } }),
  ja: () => import('./locales/ja.json', { with: { type: 'json' } }),
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await loaders[locale]()).default
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/**
 * Picks the UI language from the system or browser preferences
 * (`app.getLocale()`, `navigator.languages`). Any Chinese falls back to Simplified,
 * which also serves Taiwan, Hong Kong and Singapore at launch.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    let canonical: string
    try {
      canonical = Intl.getCanonicalLocales(tag)[0] ?? ''
    } catch {
      continue
    }
    if (isLocale(canonical)) return canonical
    const language = canonical.split('-')[0]
    if (language === 'pt') return 'pt-BR'
    if (language === 'zh') return 'zh-CN'
    if (language && isLocale(language)) return language
  }
  return SOURCE_LOCALE
}
