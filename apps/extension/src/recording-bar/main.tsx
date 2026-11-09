// recording-bar.html: the recording bar's window (background/control-bar.ts, flows.md →
// Recording in the extension). The desktop app's floating bar (RecordingBar from @kamo/ui) in a
// small Chrome popup window: timecode, Pause / Resume, Stop. Light on purpose like the popup:
// no engine, no storage. The service worker opens and closes this window; it never draws in the
// recorded tab, so it never shows in the video.
import { RecordingBar } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { POPUP_PORT, type BackgroundState } from '../shared/messages.ts'

type Control = 'pause' | 'resume' | 'stop'

/** Same requests as the popup: Stop goes through the service worker's one stop(). */
function send(type: Control): void {
  void chrome.runtime.sendMessage({ target: 'background', type }).catch(() => undefined)
}

function useSession(): BackgroundState['session'] | null {
  const [session, setSession] = useState<BackgroundState['session'] | null>(null)
  useEffect(() => {
    const port = chrome.runtime.connect({ name: POPUP_PORT })
    port.onMessage.addListener((next: BackgroundState) => setSession(next.session))
    return () => port.disconnect()
  }, [])
  return session
}

function ExtensionRecordingBar() {
  const session = useSession()
  const ended = session !== null && session.phase !== 'recording'
  // The service worker closes this window when the recording ends; should that fail, it goes
  // away on its own.
  useEffect(() => {
    if (ended) window.close()
  }, [ended])
  if (session?.phase !== 'recording') return null
  return (
    <RecordingBar
      clock={session.clock}
      draggable={false}
      onPause={() => send('pause')}
      onResume={() => send('resume')}
      onStop={() => send('stop')}
    />
  )
}

await boot(() => <ExtensionRecordingBar />, 'extension.barTitle')
