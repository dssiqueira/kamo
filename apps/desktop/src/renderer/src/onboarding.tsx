import { CornerDecor, IntroSlides, Onboarding } from '@kamo/ui'
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

/**
 * First-run onboarding (F-13) in the main window: the welcome tour, then the permissions. The
 * tour shows only until the onboarding was finished once; opened again for a missing
 * permission, it starts at the welcome screen.
 */
function DesktopOnboarding() {
  const [platform, setPlatform] = useState<AppInfo['platform'] | null>(null)
  const [intro, setIntro] = useState<boolean | null>(null)
  const [permissions, setPermissions] = usePermissions()

  useEffect(() => {
    void window.kamo.getAppInfo().then((info) => setPlatform(info.platform))
    void window.kamo
      .getSettings()
      .then((settings) => setIntro(settings.onboardingDone !== true))
      .catch(() => setIntro(true))
  }, [])

  if (!platform || intro === null) return null

  return (
    <Onboarding
      platform={platform}
      permissions={permissions}
      intro={intro}
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
