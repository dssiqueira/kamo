import { InterruptedRecordings, type RecoveryOutcome } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import { ipcErrorCode, type InterruptedRecording } from '../../shared/api.ts'

function outcomeOf(error: unknown): RecoveryOutcome {
  return ipcErrorCode(error) === 'unrecoverable' ? 'unrecoverable' : 'failed'
}

/**
 * F-02 banner for Home: recordings a crash left behind, from earlier sessions. Re-read on
 * mount and whenever the projects change; a recovered one opens in the editor.
 */
export function DesktopInterruptedRecordings() {
  const [recordings, setRecordings] = useState<InterruptedRecording[]>([])

  const refresh = useCallback(async () => {
    try {
      setRecordings(await window.kamo.listInterruptedRecordings())
    } catch {
      // the banner is a convenience: Home works without it
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.kamo.onProjectsChanged(() => void refresh())
  }, [refresh])

  return (
    <InterruptedRecordings
      recordings={recordings}
      onRecover={async (projectId) => {
        try {
          await window.kamo.recoverRecording(projectId)
        } catch (error) {
          void refresh()
          return outcomeOf(error)
        }
        await window.kamo.openEditor(projectId).catch(() => {})
        return 'ok'
      }}
      onDiscard={async (projectId) => {
        try {
          await window.kamo.discardRecording(projectId)
          return 'ok'
        } catch (error) {
          void refresh()
          return outcomeOf(error)
        }
      }}
    />
  )
}
