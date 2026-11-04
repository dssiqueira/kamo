// Start-up shared by the extension's visible pages: browser language (integrations.md →
// Languages), light theme (DESIGN.md default), i18n and the React root.
import { createI18n, resolveLocale } from '@kamo/i18n'
import { I18nProvider } from '@kamo/ui'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

export async function boot(render: () => ReactNode, titleKey: string): Promise<void> {
  document.documentElement.dataset['theme'] = 'light'
  const locale = resolveLocale(navigator.languages)
  const i18n = await createI18n(locale)
  document.documentElement.lang = locale
  document.title = i18n.t(titleKey)
  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')
  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>{render()}</I18nProvider>
    </StrictMode>,
  )
}
