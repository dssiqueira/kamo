import { Home, pickDisplay, type DisplayOption } from '@kamo/ui'
import { useEffect, useState } from 'react'
import type { ScreenAccess } from '../../shared/api.ts'

// F-01: thumbnails refresh at least once per second.
const THUMBNAIL_REFRESH_MS = 1000

/** Wires the platform-agnostic Home to the desktop: displays, thumbnails and permissions. */
export function DesktopHome() {
  const [displays, setDisplays] = useState<DisplayOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screenAccess, setScreenAccess] = useState<ScreenAccess>('granted')

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
      // Countdown and recording arrive in the next commits of step 2.
      onRecord={() => {}}
      needsPermission={screenAccess !== 'granted'}
    />
  )
}
