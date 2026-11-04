import type { CameraOption, CameraSourceProps, CameraStatus } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { CAMERA_CONSTRAINTS } from '../../shared/camera.ts'

interface Toggle {
  enabled: boolean
  deviceId: string | null
}

/**
 * Home webcam (A-03): the toggle and camera remembered in settings, the camera list and a live
 * preview. The camera is only opened while the toggle is on and Home is visible: recording
 * hides Home, which frees the camera for the hidden recorder page. Null until settings load.
 */
export function useHomeCamera(): CameraSourceProps | null {
  const [toggle, setToggle] = useState<Toggle | null>(null)
  const [status, setStatus] = useState<CameraStatus>('off')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const [visible, setVisible] = useState(document.visibilityState === 'visible')
  // Bumped when devices change, so a missing camera is tried again once one is plugged in.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.kamo
      .getSettings()
      .then((settings) => {
        if (cancelled) return
        setToggle({
          enabled: settings.cameraEnabled === true,
          deviceId: settings.cameraDeviceId || null,
        })
      })
      .catch(() => !cancelled && setToggle({ enabled: false, deviceId: null }))
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const enabled = toggle?.enabled === true
  const deviceId = toggle?.deviceId ?? null

  // The camera list (labels come once access is granted), refreshed when devices change.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const refresh = async () => {
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      if (cancelled) return
      setCameras(
        all
          .filter((d) => d.kind === 'videoinput' && d.deviceId !== '')
          .map((d) => ({ id: d.deviceId, label: d.label })),
      )
    }
    const onChange = () => {
      void refresh()
      if (status !== 'live') setAttempt((n) => n + 1)
    }
    void refresh()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', onChange)
    }
  }, [enabled, status])

  // The preview stream.
  useEffect(() => {
    if (!enabled || !visible) {
      setStatus('off')
      return
    }
    let cancelled = false
    let opened: MediaStream | null = null
    setStatus((current) => (current === 'live' ? current : 'starting'))
    void openCamera(deviceId).then(
      (next) => {
        if (cancelled) {
          stopAll(next)
          return
        }
        opened = next
        setStream(next)
        setStatus('live')
        next.getVideoTracks()[0]?.addEventListener('ended', () => {
          // Unplugged or taken by another app.
          if (opened !== next) return
          setStream(null)
          setStatus('unavailable')
        })
      },
      (error: unknown) => {
        if (cancelled) return
        setStream(null)
        setStatus(failureOf(error))
      },
    )
    return () => {
      cancelled = true
      stopAll(opened)
      opened = null
      setStream(null)
    }
  }, [enabled, deviceId, visible, attempt])

  if (!toggle) return null

  const update = (next: Partial<Toggle>) => {
    setToggle((current) => (current ? { ...current, ...next } : current))
    void window.kamo
      .updateSettings({
        ...(next.enabled !== undefined ? { cameraEnabled: next.enabled } : {}),
        ...(next.deviceId !== undefined ? { cameraDeviceId: next.deviceId ?? '' } : {}),
      })
      .catch(() => {})
  }

  return {
    enabled,
    status: enabled ? (status === 'off' ? 'starting' : status) : 'off',
    onToggle: (on) => {
      if (!on) return update({ enabled: false })
      // Asked only now, never in the onboarding (F-13). Mac shows its prompt once; a refusal
      // shows as a warning on the card (recordings then have no camera).
      void window.kamo
        .requestCameraAccess()
        .catch(() => {})
        .finally(() => update({ enabled: true }))
    },
    cameras,
    cameraId: deviceId,
    onSelectCamera: (id) => update({ deviceId: id }),
    stream,
  }
}

async function openCamera(deviceId: string | null): Promise<MediaStream> {
  const constraints = (id: string | null): MediaStreamConstraints => ({
    video: id ? { ...CAMERA_CONSTRAINTS, deviceId: { exact: id } } : { ...CAMERA_CONSTRAINTS },
    audio: false,
  })
  try {
    return await navigator.mediaDevices.getUserMedia(constraints(deviceId))
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    // The chosen camera is gone: the recording will use the default, so the preview does too.
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw error
    return navigator.mediaDevices.getUserMedia(constraints(null))
  }
}

function stopAll(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

function failureOf(error: unknown): 'denied' | 'unavailable' {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
}
