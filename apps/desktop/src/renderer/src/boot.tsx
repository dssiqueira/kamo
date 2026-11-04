import { changeLocale, createI18n, resolveLocale, type Locale } from '@kamo/i18n'
import { I18nProvider } from '@kamo/ui'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppSettings } from '../../shared/api.ts'
import './index.css'

export interface BootOptions {
  /** i18n key for the window title (default: the app name). */
  titleKey?: string
}

/** DESIGN.md: light by default; 'system' follows prefers-color-scheme (tokens.css). */
function applyTheme(settings: AppSettings | null): void {
  document.documentElement.dataset['theme'] = settings?.theme ?? 'light'
}

async function localeFor(settings: AppSettings | null): Promise<Locale> {
  const language = settings?.language
  if (language && language !== 'system') return language
  return resolveLocale(await window.kamo.getLocale())
}

/**
 * Shared start-up of every window: theme, language (Settings or the system's), i18n and the
 * React root. Theme and language follow Settings live, without restarting (F-15).
 */
export async function boot(render: () => ReactNode, options: BootOptions = {}): Promise<void> {
  const settings = await window.kamo.getSettings().catch(() => null)
  applyTheme(settings)
  const locale = await localeFor(settings)
  const i18n = await createI18n(locale)
  const titleKey = options.titleKey ?? 'app.name'

  // DESIGN.md: <html lang> picks the CJK font stack.
  document.documentElement.lang = locale
  document.title = i18n.t(titleKey)

  window.kamo.onSettingsChanged((next) => {
    applyTheme(next)
    void localeFor(next).then(async (nextLocale) => {
      if (nextLocale === i18n.language) return
      await changeLocale(i18n, nextLocale)
      document.title = i18n.t(titleKey)
    })
  })

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')

  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>{render()}</I18nProvider>
    </StrictMode>,
  )
}
