import { useEffect, useRef } from 'react'
import { useT } from '../i18n.tsx'
import { AlertIcon, VideoCameraIcon } from '../primitives/icons.tsx'
import {
  DevicePicker,
  SOURCE_CARD,
  SourceCardHeader,
  SourceMessageLine,
  type SourceMessage,
} from './SourceCard.tsx'

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

/** Home webcam card (A-03): toggle, a wide live preview and the camera picker under it. */
export function CameraSource(props: CameraSourceProps) {
  const t = useT()
  const { enabled, status, stream } = props
  const failed = enabled && (status === 'denied' || status === 'unavailable')
  const message: SourceMessage = failed
    ? {
        tone: 'warning',
        text: t(status === 'denied' ? 'home.camera.denied' : 'home.camera.unavailable'),
      }
    : null
  const live = enabled && status === 'live' && stream !== null

  return (
    <div className={SOURCE_CARD}>
      <SourceCardHeader
        icon={<VideoCameraIcon size={18} />}
        title={t('home.camera.title')}
        on={enabled}
        onToggle={() => props.onToggle(!enabled)}
      />
      <div className="relative flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {live ? (
          <StreamVideo
            stream={stream}
            label={t('home.camera.preview')}
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className={`flex flex-col items-center gap-xs px-sm text-center ${failed ? 'text-warning' : 'text-on-surface-muted'}`}
          >
            {failed ? <AlertIcon size={22} /> : <VideoCameraIcon size={22} />}
          </span>
        )}
        {!enabled && (
          <span className="absolute inset-x-0 bottom-0 truncate px-sm pb-xs text-center text-label text-on-surface-muted">
            {t('home.camera.offHint')}
          </span>
        )}
      </div>
      {enabled && (
        <DevicePicker
          devices={props.cameras}
          selectedId={props.cameraId}
          label={t('home.camera.choose')}
          defaultLabel={t('home.camera.default')}
          nameOf={(index) => t('home.camera.name', { index })}
          onSelect={props.onSelectCamera}
        />
      )}
      <SourceMessageLine message={message} />
    </div>
  )
}

/** A muted live video of a stream (the camera stream has no audio). */
function StreamVideo({
  stream,
  label,
  className,
}: {
  stream: MediaStream | null
  label: string
  className: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = stream
    if (stream) void element.play().catch(() => {})
  }, [stream])
  return <video ref={video} aria-label={label} muted autoPlay playsInline className={className} />
}

/**
 * Round, like the bubble it becomes in the video. Muted: the camera stream has no audio. The
 * extension popup shows it.
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
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-surface-raised"
      style={{ width: size, height: size }}
    >
      {stream && (
        <StreamVideo stream={stream} label={label} className="h-full w-full object-cover" />
      )}
    </div>
  )
}
