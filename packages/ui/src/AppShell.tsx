import { useT } from './i18n.tsx'

/** Top-level layout. For now, a Home placeholder with the app name and tagline. */
export function AppShell() {
  const t = useT()
  return (
    <main className="flex h-full min-h-screen flex-col items-center justify-center gap-md bg-background p-2xl font-sans text-on-surface">
      <h1 className="font-serif text-display">{t('app.name')}</h1>
      <p className="text-title text-on-surface-muted">{t('app.tagline')}</p>
    </main>
  )
}
