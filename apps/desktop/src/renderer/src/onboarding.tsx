import type { Locale } from '@kamo/i18n'
import { CornerDecor, IntroSlides, Onboarding, languageSetting, systemLanguage } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/api.ts'
import { boot } from './boot.tsx'
import { attempt } from './preferences/actions.ts'
import { usePermissions } from './preferences/usePermissions.ts'

/** `?tour=1`: Settings replays the welcome tour alone (F-13). */
const tourOnly = new URLSearchParams(window.location.search).get('tour') === '1'

const goHome = () => void window.kamo.openHome().catch(() => {})

/** Settings → Help → "Show the welcome tour": the three slides, then back to Home. */
function DesktopTour() {
  const done = useCallback(goHome, [])
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-xl font-sans text-on-surface">
      <CornerDecor />
      <IntroSlides mode="tour" onDone={done} />
    </main>
  )
}

interface Start {
  platform: AppInfo['platform']
  /** First run: the language screen and the tour come first. */
  intro: boolean
  /** The OS language when Kamo speaks it. */
  system: Locale | undefined
}

// Read once per page: picking a language re-renders the whole window (I18nProvider), and the
// screen must not blink while these are fetched again.
let startLoad: Promise<Start> | undefined
let start: Start | null = null

function loadStart(): Promise<Start> {
  startLoad ??= Promise.all([
    window.kamo.getAppInfo(),
    window.kamo
      .getSettings()
      .then((settings) => settings.onboardingDone !== true)
      .catch(() => true),
    window.kamo.getLocale().catch(() => []),
  ]).then(([info, intro, preferred]) => {
    start = { platform: info.platform, intro, system: systemLanguage(preferred) }
    return start
  })
  return startLoad
}

/** F-13/F-15: keeping the system's language saves 'system'; main rebuilds its menus on change. */
function saveLanguage(choice: Locale, system: Locale | undefined) {
  void window.kamo.updateSettings({ language: languageSetting(choice, system) }).catch(() => {})
}

/**
 * First-run onboarding (F-13) in the main window: the language, the welcome tour, then the
 * permissions. Language and tour show only until the onboarding was finished once; opened
 * again for a missing permission, it starts at the welcome screen.
 */
function DesktopOnboarding() {
  const [ready, setReady] = useState<Start | null>(start)
  const [permissions, setPermissions] = usePermissions()

  useEffect(() => {
    if (ready) return
    void loadStart().then(setReady)
  }, [ready])

  if (!ready) return null
  const { platform, intro, system } = ready

  return (
    <Onboarding
      platform={platform}
      permissions={permissions}
      intro={intro}
      language={{ system, onChoose: (choice) => saveLanguage(choice, system) }}
      onRequest={(kind) => {
        void window.kamo
          .requestPermission(kind)
          .then(setPermissions)
          .catch(() => {})
      }}
      onOpenSettings={(kind) => void window.kamo.openPermissionSettings(kind).catch(() => {})}
      onRelaunch={() => attempt(() => window.kamo.relaunch())}
      onFinish={() => {
        void window.kamo
          .updateSettings({ onboardingDone: true })
          .catch(() => {})
          .finally(goHome)
      }}
    />
  )
}

await boot(() => (tourOnly ? <DesktopTour /> : <DesktopOnboarding />))
