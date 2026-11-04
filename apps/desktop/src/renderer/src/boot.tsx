import { createI18n, resolveLocale } from '@kamo/i18n'
import { I18nProvider } from '@kamo/ui'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/** Shared start-up of every window: system language, i18n and the React root. */
export async function boot(render: () => ReactNode): Promise<void> {
  const locale = resolveLocale(await window.kamo.getLocale())
  const i18n = await createI18n(locale)

  // DESIGN.md: <html lang> picks the CJK font stack.
  document.documentElement.lang = locale
  document.title = i18n.t('app.name')

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')

  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>{render()}</I18nProvider>
    </StrictMode>,
  )
}
