import { RecordingBar, type RecordingClock } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from './boot.tsx'

function DesktopRecordingBar() {
  const [clock, setClock] = useState<RecordingClock | null>(null)
  useEffect(() => window.kamo.onRecordingClock(setClock), [])
  if (!clock) return null
  return (
    <RecordingBar
      clock={clock}
      onPause={() => void window.kamo.pauseRecording()}
      onResume={() => void window.kamo.resumeRecording()}
      onStop={() => void window.kamo.stopRecording()}
    />
  )
}

await boot(() => <DesktopRecordingBar />)
