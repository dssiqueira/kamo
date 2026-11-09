import { InterruptedRecordings, type RecoveryOutcome } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import { ipcErrorCode, type InterruptedRecording } from '../../shared/api.ts'
import type { AudioWarning } from '../../shared/audio.ts'
import type { CameraWarning } from '../../shared/camera.ts'

function outcomeOf(error: unknown): RecoveryOutcome {
  return ipcErrorCode(error) === 'unrecoverable' ? 'unrecoverable' : 'failed'
}

export interface DesktopInterruptedRecordingsProps {
  /**
   * The video came back but some audio or the camera did not: Home says so instead of opening
   * the editor (it would hide the notice), and the notice offers "Open in editor" (F-02).
   */
  onRecoveredWithWarnings?(
    projectId: string,
    audioWarnings: AudioWarning[],
    cameraWarnings: CameraWarning[],
  ): void
}

/**
 * F-02 banner for Home: recordings a crash left behind, from earlier sessions. Re-read on
 * mount and whenever the projects change; a recovered one opens in the editor.
 */
export function DesktopInterruptedRecordings({
  onRecoveredWithWarnings,
}: DesktopInterruptedRecordingsProps = {}) {
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
        let recovered
        try {
          recovered = await window.kamo.recoverRecording(projectId)
        } catch (error) {
          void refresh()
          return outcomeOf(error)
        }
        const { audioWarnings, cameraWarnings } = recovered
        if (onRecoveredWithWarnings && (audioWarnings.length || cameraWarnings.length)) {
          onRecoveredWithWarnings(projectId, audioWarnings, cameraWarnings)
          return 'ok'
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
