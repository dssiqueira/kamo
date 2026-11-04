import type { AudioSourcesProps } from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import type { AudioSourceStatus, AudioSources, AudioStatus } from '../../shared/audio.ts'

interface Toggles {
  mic: boolean
  micDeviceId: string | null
  system: boolean
}

/**
 * Home audio (F-04): toggles remembered in settings (F-01), live meters and devices from the
 * hidden recorder page, and the Mac microphone prompt. Null until settings are loaded.
 */
export function useHomeAudio(): AudioSourcesProps | null {
  const [toggles, setToggles] = useState<Toggles | null>(null)
  const [systemSupported, setSystemSupported] = useState(true)
  const [status, setStatus] = useState<AudioStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.kamo.getSettings(), window.kamo.getAudioSupport()])
      .then(([settings, support]) => {
        if (cancelled) return
        setSystemSupported(support.system)
        setToggles({
          mic: settings.micEnabled === true,
          micDeviceId: settings.micDeviceId || null,
          system: support.system && settings.systemAudioEnabled === true,
        })
      })
      .catch(() => !cancelled && setToggles({ mic: false, micDeviceId: null, system: false }))
    const unsubscribe = window.kamo.onAudioStatus(setStatus)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // The meters follow the toggles; leaving Home closes the devices (main also does it when
  // the page navigates away, since unmount effects do not run then).
  useEffect(() => {
    if (!toggles) return
    const sources: AudioSources = { ...toggles }
    void window.kamo.setAudioMonitor(sources.mic || sources.system ? sources : null)
  }, [toggles])
  useEffect(() => () => void window.kamo.setAudioMonitor(null), [])

  const subscribeLevels = useCallback(
    (listener: (levels: { mic: number; system: number }) => void) =>
      window.kamo.onAudioLevels(listener),
    [],
  )

  if (!toggles) return null

  const update = (next: Partial<Toggles>) => {
    setToggles((current) => (current ? { ...current, ...next } : current))
    void window.kamo
      .updateSettings({
        ...(next.mic !== undefined ? { micEnabled: next.mic } : {}),
        ...(next.system !== undefined ? { systemAudioEnabled: next.system } : {}),
        ...(next.micDeviceId !== undefined ? { micDeviceId: next.micDeviceId ?? '' } : {}),
      })
      .catch(() => {})
  }

  // A source just turned on reads as starting until the recorder page reports on it.
  const shown = (enabled: boolean, reported: AudioSourceStatus | undefined) =>
    !enabled ? 'off' : !reported || reported === 'off' ? 'starting' : reported

  return {
    mic: { enabled: toggles.mic, status: shown(toggles.mic, status?.mic) },
    system: {
      enabled: toggles.system,
      status: systemSupported ? shown(toggles.system, status?.system) : 'unsupported',
    },
    onToggleMic: (enabled) => {
      if (!enabled) return update({ mic: false })
      // Mac shows its microphone prompt once, before the device is opened; denied shows as
      // a warning on the card (F-04: recordings then have video only).
      void window.kamo
        .requestMicrophoneAccess()
        .catch(() => {})
        .finally(() => update({ mic: true }))
    },
    onToggleSystem: (enabled) => update({ system: enabled }),
    microphones: status?.devices ?? [],
    microphoneId: toggles.micDeviceId,
    onSelectMicrophone: (id) => update({ micDeviceId: id }),
    subscribeLevels,
  }
}
