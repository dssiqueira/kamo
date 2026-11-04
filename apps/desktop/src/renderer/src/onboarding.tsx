import { Onboarding } from '@kamo/ui'
import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/api.ts'
import { boot } from './boot.tsx'
import { attempt } from './preferences/actions.ts'
import { usePermissions } from './preferences/usePermissions.ts'

/** First-run permissions onboarding (F-13) in the main window. */
function DesktopOnboarding() {
  const [platform, setPlatform] = useState<AppInfo['platform'] | null>(null)
  const [permissions, setPermissions] = usePermissions()

  useEffect(() => {
    void window.kamo.getAppInfo().then((info) => setPlatform(info.platform))
  }, [])

  if (!platform) return null

  return (
    <Onboarding
      platform={platform}
      permissions={permissions}
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
          .finally(() => void window.kamo.openHome())
      }}
    />
  )
}

await boot(() => <DesktopOnboarding />)
