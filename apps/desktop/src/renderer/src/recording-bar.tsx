import { RecordingBar, type RecordingClock } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from './boot.tsx'

function DesktopRecordingBar() {
  const [clock, setClock] = useState<RecordingClock | null>(null)
  useEffect(() => {
    const unsubscribe = window.kamo.onRecordingClock(setClock)
    // The bar boots asynchronously (locale, i18n) and can miss the first push: pull it too.
    // A push that lands first wins, so a stale pull never overwrites it.
    void window.kamo.getRecordingClock().then((c) => c && setClock((prev) => prev ?? c))
    return unsubscribe
  }, [])
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
