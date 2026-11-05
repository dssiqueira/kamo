import { Settings, type LanguageChoice, type ThemeChoice } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, AppSettings, Folders } from '../../shared/api.ts'
import type { PackId, TranscriptionLanguage } from '../../shared/packs.ts'
import { boot } from './boot.tsx'
import { attempt } from './preferences/actions.ts'
import { probeHardwareH264 } from './preferences/encoder-probe.ts'
import { usePermissions } from './preferences/usePermissions.ts'
import { useUpdateStatus } from './preferences/useUpdateStatus.ts'
import { usePacks } from './transcription/usePacks.ts'

/** Settings window (F-15): wires the platform-agnostic Settings to main. */
function DesktopSettings() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folders, setFolders] = useState<Folders | null>(null)
  const [agentDevServer, setAgentDevServer] = useState<string | null>(null)
  const [permissions] = usePermissions()
  const update = useUpdateStatus()
  // A-07: the list of packs loads when the Packs section comes into view.
  const packs = usePacks()

  useEffect(() => {
    void window.kamo.getAppInfo().then(setInfo)
    void window.kamo.getSettings().then(setSettings)
    void window.kamo.getFolders().then(setFolders)
    void window.kamo
      .getAgentSetup()
      .then((setup) => setAgentDevServer(setup.devServerPath))
      .catch(() => {})
    // Changes from this window or any other (e.g. the theme set elsewhere).
    return window.kamo.onSettingsChanged(setSettings)
  }, [])

  const loadDiagnostics = useCallback(
    async () => window.kamo.getDiagnostics({ hardwareH264: await probeHardwareH264() }),
    [],
  )

  if (!info || !settings) return null

  const save = (update: {
    theme?: ThemeChoice
    language?: LanguageChoice
    closeToTray?: boolean
    autoTranscribe?: boolean
    transcriptionLanguage?: TranscriptionLanguage
    transcriptionPack?: PackId
  }) => {
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
      closeToTray={settings.closeToTray ?? info.closeToTrayDefault}
      onCloseToTrayChange={(closeToTray) => save({ closeToTray })}
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
      agent={{
        devServerPath: agentDevServer,
        onOpenDocs: () => void window.kamo.openAgentDocs().catch(() => {}),
      }}
      onShowTour={() => void window.kamo.openOnboarding({ tour: true }).catch(() => {})}
      {...(packs.status
        ? {
            packs: {
              ...packs.actions,
              packs: packs.status,
              onOpen: packs.refresh,
              autoTranscribe: settings.autoTranscribe,
              onAutoTranscribeChange: (autoTranscribe: boolean) => save({ autoTranscribe }),
              language: settings.transcriptionLanguage ?? 'auto',
              onLanguageChange: (transcriptionLanguage: TranscriptionLanguage) =>
                save({ transcriptionLanguage }),
              activePack: settings.transcriptionPack ?? null,
              onActivePackChange: (id: string) => save({ transcriptionPack: id as PackId }),
            },
          }
        : {})}
    />
  )
}

await boot(() => <DesktopSettings />, { titleKey: 'settings.title' })
