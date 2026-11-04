import { Home, pickDisplay, useT, type DisplayOption, type HomeProps } from '@kamo/ui'
import { useEffect, useState } from 'react'
import type { RecordingStatus, ScreenAccess } from '../../shared/api.ts'

// Error codes from main (recording controller and capture helper) → i18n keys.
const ERROR_KEYS: Record<string, string> = {
  helper_missing: 'recording.errors.helperMissing',
  low_disk: 'recording.errors.lowDisk',
  display_not_found: 'recording.errors.displayNotFound',
  permission_denied: 'recording.errors.permissionDenied',
  too_short: 'recording.errors.tooShort',
}
const WARNING_KEYS = {
  display_lost: 'recording.errors.displayLost',
  disk_full: 'recording.errors.diskFull',
} as const

// F-01: thumbnails refresh at least once per second.
const THUMBNAIL_REFRESH_MS = 1000

/** Wires the platform-agnostic Home to the desktop: displays, thumbnails and permissions. */
export function DesktopHome() {
  const [displays, setDisplays] = useState<DisplayOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screenAccess, setScreenAccess] = useState<ScreenAccess>('granted')
  const [status, setStatus] = useState<RecordingStatus | null>(null)
  const t = useT()

  useEffect(() => window.kamo.onRecordingStatus(setStatus), [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = async () => {
      clearTimeout(timer)
      const next = await window.kamo.listDisplays()
      if (cancelled) return
      setDisplays(next)
      setSelectedId((current) => pickDisplay(next, current))
      // Paused while the window is hidden; resumes when it comes back.
      if (document.visibilityState === 'visible') {
        timer = setTimeout(() => void refresh(), THUMBNAIL_REFRESH_MS)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    void refresh()
    void window.kamo.getScreenAccess().then((access) => !cancelled && setScreenAccess(access))
    const unsubscribe = window.kamo.onDisplaysChanged(() => void refresh())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <Home
      displays={displays}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onRecord={() => {
        if (!selectedId) return
        setStatus(null)
        void window.kamo.startRecording(selectedId)
      }}
      notice={notice(status, t)}
      needsPermission={screenAccess !== 'granted'}
    />
  )
}

function notice(
  status: RecordingStatus | null,
  t: (key: string) => string,
): NonNullable<HomeProps['notice']> | null {
  if (!status) return null
  if (status.kind === 'error') {
    const tone = status.code === 'too_short' ? 'warning' : 'error'
    return { tone, text: t(ERROR_KEYS[status.code] ?? 'recording.errors.failed') }
  }
  // The editor opens here from step 4 on; until then, Home confirms the save.
  return status.warning
    ? { tone: 'warning', text: t(WARNING_KEYS[status.warning]) }
    : { tone: 'success', text: t('recording.saved') }
}
