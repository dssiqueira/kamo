import { useEffect, useState } from 'react'
import type { PermissionInfo } from '../../../shared/api.ts'

// F-13: the status changes as soon as the user flips the switch in System Settings.
const POLL_MS = 1000

/** Permission statuses, re-read every second while the window is visible. */
export function usePermissions(): [PermissionInfo[] | null, (next: PermissionInfo[]) => void] {
  const [permissions, setPermissions] = useState<PermissionInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      clearTimeout(timer)
      try {
        const next = await window.kamo.getPermissions()
        if (!cancelled) setPermissions(next)
      } catch {
        if (!cancelled) setPermissions((current) => current ?? [])
      }
      // Paused while hidden; resumes when the window comes back.
      if (!cancelled && document.visibilityState === 'visible') {
        timer = setTimeout(() => void poll(), POLL_MS)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return [permissions, setPermissions]
}
