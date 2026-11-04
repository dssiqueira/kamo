// permission.html?device=microphone|camera: asks for one device once, on a visible page (E-01,
// A-03). The offscreen recorder and the popup's camera preview share this extension's
// permission afterwards.
import { DevicePermission, type PermissionStatus } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { devicePermission, savePreferences, type MediaDevice } from '../shared/preferences.ts'

const device: MediaDevice =
  new URLSearchParams(location.search).get('device') === 'camera' ? 'camera' : 'microphone'

function PermissionPage() {
  const [status, setStatus] = useState<PermissionStatus>('prompt')

  useEffect(() => {
    // Already allowed (e.g. earlier, in Chrome's settings): the toggle that opened this page
    // asked for the device, so turn it on.
    void devicePermission(device).then(async (state) => {
      if (state !== 'granted') return
      await savePreferences({ [device]: true })
      setStatus('granted')
    })
  }, [])

  const allow = async () => {
    setStatus('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        device === 'camera' ? { video: true } : { audio: true },
      )
      for (const track of stream.getTracks()) track.stop()
      await savePreferences({ [device]: true })
      setStatus('granted')
    } catch {
      setStatus('denied')
    }
  }

  return <DevicePermission device={device} status={status} onAllow={() => void allow()} />
}

await boot(
  () => <PermissionPage />,
  device === 'camera' ? 'extension.camera.title' : 'extension.microphone.title',
)
