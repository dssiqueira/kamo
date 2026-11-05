// welcome.html (E-05): opened once on install by the service worker. A visible page, so it can
// ask for the microphone (the recorder can't) and for the optional "all sites" permission that
// keeps clicks captured when the recorded tab changes sites (E-02). Both are optional.
import { ExtensionWelcome, type WelcomeAskStatus } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { DESKTOP_DOWNLOAD_URL } from '../shared/links.ts'
import { devicePermission, savePreferences } from '../shared/preferences.ts'

const ALL_SITES = { origins: ['<all_urls>'] }

function WelcomePage() {
  const [microphone, setMicrophone] = useState<WelcomeAskStatus>('prompt')
  const [sites, setSites] = useState<WelcomeAskStatus>('prompt')

  useEffect(() => {
    void devicePermission('microphone').then(
      (state) => state === 'granted' && setMicrophone('granted'),
    )
    void chrome.permissions.contains(ALL_SITES).then((granted) => granted && setSites('granted'))
  }, [])

  const allowMicrophone = async () => {
    setMicrophone('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      await savePreferences({ microphone: true })
      setMicrophone('granted')
    } catch {
      setMicrophone('denied')
    }
  }

  const allowSites = async () => {
    setSites('asking')
    const granted = await chrome.permissions.request(ALL_SITES).catch(() => false)
    setSites(granted ? 'granted' : 'prompt')
  }

  return (
    <ExtensionWelcome
      desktopAppUrl={DESKTOP_DOWNLOAD_URL}
      microphone={microphone}
      onAllowMicrophone={() => void allowMicrophone()}
      sites={sites}
      onAllowSites={() => void allowSites()}
    />
  )
}

await boot(() => <WelcomePage />, 'extension.name')
