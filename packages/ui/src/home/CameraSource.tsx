import { useEffect, useId, useRef } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { SourceSwitch } from './SourceSwitch.tsx'

export interface CameraOption {
  id: string
  /** OS label; empty when the OS gives none. */
  label: string
}

/**
 * - `off`: toggle off
 * - `starting`: opening the camera
 * - `live`: the preview is running
 * - `denied`: no permission (recordings then have no camera)
 * - `unavailable`: no camera, unplugged, or another app holds it
 */
export type CameraStatus = 'off' | 'starting' | 'live' | 'denied' | 'unavailable'

export interface CameraSourceProps {
  /** The toggle (off by default). */
  enabled: boolean
  status: CameraStatus
  onToggle(enabled: boolean): void
  /** Cameras; the picker only shows with more than one. */
  cameras: readonly CameraOption[]
  /** null: the system default. */
  cameraId: string | null
  onSelectCamera(id: string | null): void
  /** The live preview. The platform opens it; Home only shows it. */
  stream: MediaStream | null
}

/** Home webcam card (A-03): toggle, camera picker and a small round live preview. */
export function CameraSource(props: CameraSourceProps) {
  const t = useT()
  const labelId = useId()
  const selectId = useId()
  const { enabled, status, cameras, cameraId, stream } = props
  // A remembered camera that is not plugged in reads as the default.
  const selected = cameras.some((c) => c.id === cameraId) ? (cameraId ?? '') : ''
  const message =
    !enabled || (status !== 'denied' && status !== 'unavailable')
      ? null
      : t(status === 'denied' ? 'home.camera.denied' : 'home.camera.unavailable')

  return (
    <div className="flex w-[240px] flex-col gap-sm rounded-lg border-2 border-border bg-surface p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span id={labelId} className="truncate text-title">
          {t('home.camera.title')}
        </span>
        <SourceSwitch on={enabled} labelId={labelId} onClick={() => props.onToggle(!enabled)} />
      </div>
      {enabled && (
        <div className="flex justify-center">
          <CameraPreview
            stream={status === 'live' ? stream : null}
            label={t('home.camera.preview')}
          />
        </div>
      )}
      {enabled && cameras.length > 1 && (
        <>
          <label htmlFor={selectId} className="sr-only">
            {t('home.camera.choose')}
          </label>
          <select
            id={selectId}
            value={selected}
            onChange={(event) => props.onSelectCamera(event.target.value || null)}
            className={`w-full truncate rounded-md border border-border bg-surface px-sm py-xs text-body ${FOCUS_RING}`}
          >
            <option value="">{t('home.camera.default')}</option>
            {cameras.map((c, index) => (
              <option key={c.id} value={c.id}>
                {c.label || t('home.camera.name', { index: index + 1 })}
              </option>
            ))}
          </select>
        </>
      )}
      {message && (
        <p role="alert" className="text-label text-warning">
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * Round, like the bubble it becomes in the video. Muted: the camera stream has no audio. The
 * extension popup shows it smaller.
 */
export function CameraPreview({
  stream,
  label,
  size = 96,
}: {
  stream: MediaStream | null
  label: string
  size?: number
}) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = stream
    if (stream) void element.play().catch(() => {})
  }, [stream])
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-surface-raised"
      style={{ width: size, height: size }}
    >
      {stream && (
        <video
          ref={video}
          aria-label={label}
          muted
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      )}
    </div>
  )
}
