import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/api.ts'

/** Live update status (F-14). */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    let cancelled = false
    void window.kamo
      .getUpdateStatus()
      .then((current) => !cancelled && setStatus(current))
      .catch(() => {})
    const unsubscribe = window.kamo.onUpdateStatus(setStatus)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  return status
}
