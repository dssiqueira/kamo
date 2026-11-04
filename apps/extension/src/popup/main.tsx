// popup.html (flows.md → Popup). Light on purpose (≤ 150KB, opens in < 200ms): no engine and
// no editor here; recovery loads its code only when the user clicks Recover.
import { formatProjectDate, resolveLocale } from '@kamo/i18n'
import {
  ExtensionPopup,
  useT,
  type PopupPhase,
  type PopupProject,
  type PopupTab,
  type RecoveryOutcome,
} from '@kamo/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isRecordableUrl } from '../shared/capture.ts'
import {
  CAMERA_CONSTRAINTS,
  deviceConstraint,
  deviceOptions,
  openWithFallback,
  type DeviceOption,
} from '../shared/devices.ts'
import { boot } from '../shared/boot.tsx'
import { DESKTOP_DOWNLOAD_URL } from '../shared/links.ts'
import {
  POPUP_PORT,
  STOP_COMMAND,
  type BackgroundRequest,
  type BackgroundState,
  type Session,
} from '../shared/messages.ts'
import {
  DEFAULT_PREFERENCES,
  devicePermission,
  loadPreferences,
  savePreferences,
  type MediaDevice,
  type Preferences,
} from '../shared/preferences.ts'
import { readLibrary, type InterruptedSummary } from '../storage/library.ts'
import { OpfsProjectStore } from '../storage/opfs-store.ts'

const RECENT_LIMIT = 3
const store = new OpfsProjectStore()

type Request = BackgroundRequest extends infer R
  ? R extends { target: 'background' }
    ? Omit<R, 'target'>
    : never
  : never

function send(request: Request): Promise<BackgroundState | undefined> {
  return chrome.runtime
    .sendMessage({ ...request, target: 'background' })
    .catch(() => undefined) as Promise<BackgroundState | undefined>
}

function toPhase(session: Session): PopupPhase {
  switch (session.phase) {
    case 'idle':
      return { kind: 'idle' }
    case 'countdown':
      return { kind: 'countdown', value: session.value }
    case 'starting':
      return { kind: 'starting' }
    case 'recording':
      return { kind: 'recording', clock: session.clock }
    case 'saving':
      return { kind: 'saving' }
  }
}

function activeProjectId(session: Session | undefined): string | undefined {
  return session && session.phase !== 'idle' ? session.projectId : undefined
}

function useBackgroundState(): BackgroundState | null {
  const [state, setState] = useState<BackgroundState | null>(null)
  useEffect(() => {
    const port = chrome.runtime.connect({ name: POPUP_PORT })
    port.onMessage.addListener((next: BackgroundState) => setState(next))
    return () => port.disconnect()
  }, [])
  return state
}

function useActiveTab(): (PopupTab & { id: number }) | null {
  const [tab, setTab] = useState<(PopupTab & { id: number }) | null>(null)
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      if (active?.id === undefined) return
      setTab({ id: active.id, title: active.title ?? '', recordable: isRecordableUrl(active.url) })
    })
  }, [])
  return tab
}

function useLibrary(refreshKey: string, activeId: string | undefined) {
  const [recent, setRecent] = useState<PopupProject[]>([])
  const [interrupted, setInterrupted] = useState<InterruptedSummary[]>([])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let urls: string[] = []
    let cancelled = false
    void readLibrary(store, { limit: RECENT_LIMIT, activeProjectId: activeId })
      .then((library) => {
        if (cancelled) return
        urls = []
        setRecent(
          library.recent.map((project) => {
            const thumbnailUrl = project.thumbnail ? URL.createObjectURL(project.thumbnail) : null
            if (thumbnailUrl) urls.push(thumbnailUrl)
            return { ...project, thumbnailUrl }
          }),
        )
        setInterrupted(library.interrupted)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [refreshKey, activeId, version])
  return { recent, interrupted, reload: () => setVersion((v) => v + 1) }
}

function useStopShortcut(): string | undefined {
  const [shortcut, setShortcut] = useState<string>()
  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      const stop = commands.find((c) => c.name === STOP_COMMAND)
      if (stop?.shortcut) setShortcut(stop.shortcut)
    })
  }, [])
  return shortcut
}

/**
 * Microphones and cameras for the pickers, refreshed when devices change. Labels need the
 * permission, which the extension's origin gets once on permission.html.
 */
function useDevices(): { microphones: DeviceOption[]; cameras: DeviceOption[] } {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((all) => !cancelled && setDevices(all))
        .catch(() => undefined)
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [])
  return useMemo(
    () => ({
      microphones: deviceOptions(devices, 'audioinput'),
      cameras: deviceOptions(devices, 'videoinput'),
    }),
    [devices],
  )
}

type CameraStatus = 'off' | 'starting' | 'live' | 'unavailable'

/** The popup's round camera preview, open only while the camera toggle is on (A-03). */
function useCameraPreview(enabled: boolean, cameraId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('off')
  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }
    let cancelled = false
    let opened: MediaStream | null = null
    setStatus('starting')
    void openWithFallback(cameraId, (id) =>
      navigator.mediaDevices.getUserMedia({
        video: { ...CAMERA_CONSTRAINTS, ...deviceConstraint(id) },
        audio: false,
      }),
    ).then(
      ({ stream: next }) => {
        if (cancelled) {
          for (const track of next.getTracks()) track.stop()
          return
        }
        opened = next
        setStream(next)
        setStatus('live')
      },
      () => !cancelled && setStatus('unavailable'),
    )
    return () => {
      cancelled = true
      for (const track of opened?.getTracks() ?? []) track.stop()
      setStream(null)
    }
  }, [enabled, cameraId])
  return { stream, status }
}

function Popup() {
  const t = useT()
  const state = useBackgroundState()
  const tab = useActiveTab()
  const stopShortcut = useStopShortcut()
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const devices = useDevices()
  // The preview is only for choosing: it closes once a recording starts.
  const preview = useCameraPreview(
    preferences.camera && (state?.session.phase ?? 'idle') === 'idle',
    preferences.cameraId,
  )
  const session = state?.session
  const phase = useMemo<PopupPhase>(
    () => (session ? toPhase(session) : { kind: 'idle' }),
    [session],
  )
  const library = useLibrary(phase.kind, activeProjectId(session))

  useEffect(() => {
    void loadPreferences().then(async (stored) => {
      // A permission can be revoked in Chrome's settings: the toggles follow it.
      const [micAllowed, cameraAllowed] = await Promise.all([
        devicePermission('microphone').then((state) => state === 'granted'),
        devicePermission('camera').then((state) => state === 'granted'),
      ])
      setPreferences({
        ...stored,
        microphone: stored.microphone && micAllowed,
        camera: stored.camera && cameraAllowed,
      })
    })
  }, [])

  // Esc in the popup cancels the countdown (E-01). The popup is Kamo's own focused page; the
  // recorded tab never gets a key listener (rule 2).
  useEffect(() => {
    if (phase.kind !== 'countdown') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void send({ type: 'cancel' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase.kind])

  const setDevice = useCallback(async (device: MediaDevice, on: boolean) => {
    if (on && (await devicePermission(device)) !== 'granted') {
      // The offscreen recorder can't show Chrome's prompt: ask on a visible page.
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`permission.html?device=${device}`),
      })
      return
    }
    setPreferences(await savePreferences({ [device]: on }))
  }, [])

  const choose = useCallback(async (change: Partial<Preferences>) => {
    setPreferences(await savePreferences(change))
  }, [])

  const setTabAudio = useCallback(async (on: boolean) => {
    setPreferences(await savePreferences({ tabAudio: on }))
  }, [])

  const record = () => {
    if (!tab?.recordable) return
    const locale = resolveLocale(navigator.languages)
    void send({
      type: 'record',
      tabId: tab.id,
      options: {
        microphone: preferences.microphone,
        microphoneId: preferences.microphoneId,
        tabAudio: preferences.tabAudio,
        camera: preferences.camera,
        cameraId: preferences.cameraId,
        projectName: t('project.defaultName', { date: formatProjectDate(locale, new Date()) }),
        devicePixelRatio: window.devicePixelRatio,
      },
    })
  }

  const recover = async (projectId: string): Promise<RecoveryOutcome> => {
    const { recoverRecording, RecoveryError } = await import('../storage/recovery.ts')
    try {
      await recoverRecording(store, projectId)
      library.reload()
      return 'ok'
    } catch (error) {
      return error instanceof RecoveryError && error.code === 'unrecoverable'
        ? 'unrecoverable'
        : 'failed'
    }
  }

  const discard = async (projectId: string): Promise<RecoveryOutcome> => {
    const { discardRecording } = await import('../storage/recovery.ts')
    try {
      await discardRecording(store, projectId)
      library.reload()
      return 'ok'
    } catch {
      return 'failed'
    }
  }

  return (
    <ExtensionPopup
      phase={phase}
      tab={tab}
      microphone={preferences.microphone}
      tabAudio={preferences.tabAudio}
      onMicrophoneChange={(on) => void setDevice('microphone', on)}
      onTabAudioChange={(on) => void setTabAudio(on)}
      microphones={devices.microphones}
      microphoneId={preferences.microphoneId}
      onMicrophoneSelect={(id) => void choose({ microphoneId: id })}
      camera={preferences.camera}
      onCameraChange={(on) => void setDevice('camera', on)}
      cameras={devices.cameras}
      cameraId={preferences.cameraId}
      onCameraSelect={(id) => void choose({ cameraId: id })}
      cameraPreview={preview.stream}
      cameraStatus={preview.status}
      onRecord={record}
      onCancel={() => void send({ type: 'cancel' })}
      onPause={() => void send({ type: 'pause' })}
      onResume={() => void send({ type: 'resume' })}
      onStop={() => void send({ type: 'stop' })}
      stopShortcut={stopShortcut}
      notices={state?.notices ?? []}
      onDismissNotices={() => void send({ type: 'dismiss-notices' })}
      recent={library.recent}
      interrupted={library.interrupted}
      onRecover={recover}
      onDiscard={discard}
      desktopAppUrl={DESKTOP_DOWNLOAD_URL}
    />
  )
}

await boot(() => <Popup />, 'app.name')
