import { useEffect, useRef, type RefObject } from 'react'
import { syncAudio, type PreviewAudioSettings } from './audio-sync.ts'

export type PreviewAudioId = 'mic' | 'system'

export interface PreviewAudioTrack extends PreviewAudioSettings {
  id: PreviewAudioId
  /** audio.m4a / system.m4a, resolved by the app like the video */
  url: string
}

export interface PreviewAudioProps {
  /** the preview's screen element: the audio follows its clock */
  video: RefObject<HTMLVideoElement | null>
  /** the recorded tracks (project.audio.<track>.enabled) the app can serve */
  tracks: readonly PreviewAudioTrack[]
}

/**
 * The preview's sound (F-10): one hidden <audio> per recorded track, kept on the screen
 * video's clock with the export's offset and volume rules (audio-sync.ts). Volume and mute
 * edits apply live. Frame steps and seeks are silent: the audio only runs while the video
 * plays.
 */
export function PreviewAudio({ video, tracks }: PreviewAudioProps) {
  return (
    <>
      {tracks.map((track) => (
        <PreviewAudioElement key={track.id} video={video} track={track} />
      ))}
    </>
  )
}

function PreviewAudioElement({
  video,
  track,
}: {
  video: RefObject<HTMLVideoElement | null>
  track: PreviewAudioTrack
}) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const settings = useRef<PreviewAudioSettings>(track)
  settings.current = track
  const sync = useRef<{ align(): void } | null>(null)

  // The source is set here, not as a prop, so leaving releases the file and the decoder
  // (a detached element that still has a source keeps them, and keeps playing if it was).
  useEffect(() => {
    const screen = video.current
    const element = audio.current
    if (!screen || !element) return
    element.src = track.url
    const synced = syncAudio(screen, element, () => settings.current)
    sync.current = synced
    return () => {
      synced.stop()
      sync.current = null
      element.removeAttribute('src')
      element.load()
    }
  }, [video, track.url])

  useEffect(() => {
    sync.current?.align()
  }, [track.volume, track.offsetMs])

  return (
    <audio
      ref={audio}
      preload="auto"
      className="hidden"
      data-testid={`preview-audio-${track.id}`}
    />
  )
}
