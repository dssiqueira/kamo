import { Settings, type LanguageChoice, type ThemeChoice } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, AppSettings, Folders } from '../../shared/api.ts'
import { boot } from './boot.tsx'
import { attempt } from './preferences/actions.ts'
import { probeHardwareH264 } from './preferences/encoder-probe.ts'
import { usePermissions } from './preferences/usePermissions.ts'
import { useUpdateStatus } from './preferences/useUpdateStatus.ts'

/** Settings window (F-15): wires the platform-agnostic Settings to main. */
function DesktopSettings() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folders, setFolders] = useState<Folders | null>(null)
  const [permissions] = usePermissions()
  const update = useUpdateStatus()

  useEffect(() => {
    void window.kamo.getAppInfo().then(setInfo)
    void window.kamo.getSettings().then(setSettings)
    void window.kamo.getFolders().then(setFolders)
    // Changes from this window or any other (e.g. the theme set elsewhere).
    return window.kamo.onSettingsChanged(setSettings)
  }, [])

  const loadDiagnostics = useCallback(
    async () => window.kamo.getDiagnostics({ hardwareH264: await probeHardwareH264() }),
    [],
  )

  if (!info || !settings) return null

  const save = (update: { theme?: ThemeChoice; language?: LanguageChoice }) => {
    setSettings((current) => current && { ...current, ...update })
    void window.kamo.updateSettings(update).catch(() => {
      void window.kamo.getSettings().then(setSettings)
    })
  }

  return (
    <Settings
      platform={info.platform}
      version={info.version}
      theme={settings.theme ?? 'light'}
      onThemeChange={(theme) => save({ theme })}
      language={settings.language ?? 'system'}
      onLanguageChange={(language) => save({ language })}
      folders={folders}
      onChangeFolder={(kind) =>
        attempt(async () => {
          const next = await window.kamo.chooseFolder(kind)
          if (next) setFolders(next)
        })
      }
      onShowFolder={(kind) => void window.kamo.showFolder(kind).catch(() => {})}
      stopShortcut={settings.stopShortcut ?? info.defaultStopShortcut}
      defaultStopShortcut={info.defaultStopShortcut}
      onStopShortcutChange={(accelerator) =>
        attempt(async () => setSettings(await window.kamo.setStopShortcut(accelerator)))
      }
      permissions={permissions}
      onOpenPermissionSettings={(kind) => void window.kamo.openPermissionSettings(kind)}
      update={update}
      onCheckUpdates={() => void window.kamo.checkForUpdates().catch(() => {})}
      onRestartToUpdate={() => attempt(() => window.kamo.restartToUpdate())}
      onLoadDiagnostics={loadDiagnostics}
      onCopy={(text) => attempt(() => window.kamo.copyText(text))}
      onOpenIssue={(text) => attempt(() => window.kamo.openIssue(text))}
      onLoadNotices={() => window.kamo.getThirdPartyNotices()}
    />
  )
}

await boot(() => <DesktopSettings />, { titleKey: 'settings.title' })
