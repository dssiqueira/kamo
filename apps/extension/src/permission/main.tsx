// microphone.html: asks for the microphone once, on a visible page (E-01). The offscreen
// recorder shares this extension's permission afterwards.
import { MicrophonePermission, type MicrophoneStatus } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { microphonePermission, savePreferences } from '../shared/preferences.ts'

function MicrophonePage() {
  const [status, setStatus] = useState<MicrophoneStatus>('prompt')

  useEffect(() => {
    // Already allowed (e.g. earlier, in Chrome's settings): the toggle that opened this page
    // asked for the microphone, so turn it on.
    void microphonePermission().then(async (state) => {
      if (state !== 'granted') return
      await savePreferences({ microphone: true })
      setStatus('granted')
    })
  }, [])

  const allow = async () => {
    setStatus('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      await savePreferences({ microphone: true })
      setStatus('granted')
    } catch {
      setStatus('denied')
    }
  }

  return <MicrophonePermission status={status} onAllow={() => void allow()} />
}

await boot(() => <MicrophonePage />, 'extension.microphone.title')
