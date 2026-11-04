import { UpdateBanner } from '@kamo/ui'
import { useState } from 'react'
import { attempt } from './actions.ts'
import { useUpdateStatus } from './useUpdateStatus.ts'

/**
 * F-14 notice for Home: "New version ready, restart now?". Renders nothing until an update is
 * downloaded; "Later" hides it for this session (the update still installs when Kamo quits).
 */
export function DesktopUpdateBanner() {
  const status = useUpdateStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (status.state !== 'ready' || dismissed === status.version) return null
  return (
    <UpdateBanner
      version={status.version}
      onRestart={() => attempt(() => window.kamo.restartToUpdate())}
      onDismiss={() => setDismissed(status.version)}
    />
  )
}
