import { useEffect, useRef, type RefObject } from 'react'
import { audioGain, syncAudio, type PreviewAudioSettings } from './audio-sync.ts'

export type PreviewAudioId = 'mic' | 'system'

export interface PreviewAudioTrack extends PreviewAudioSettings {
  id: PreviewAudioId
  /** audio.m4a / system.m4a, resolved by the app like the video */
  url: string
}

export interface PreviewAudioProps {
  /** the preview's screen element: the audio follows its clock */
  video: RefObject<HTMLVideoElement | null>
  /**
   * the screen element's source. A track served from the same file (the extension's tab
   * sound lives in its screen file) plays from the screen element itself.
   */
  videoUrl?: string | undefined
  /** the recorded tracks (project.audio.<track>.enabled) the app can serve */
  tracks: readonly PreviewAudioTrack[]
}

/**
 * The preview's sound (F-10): one hidden <audio> per recorded track, kept on the screen
 * video's clock with the export's offset and volume rules (audio-sync.ts). Volume and mute
 * edits apply live. Frame steps and seeks are silent: the audio only runs while the video
 * plays.
 *
 * A track inside the screen file with no offset is the screen element's own sound: it is
 * unmuted at the track's volume instead of opening the file a second time, which would
 * decode the whole video again and keep re-seeking it to stay in sync (slow on a long WebM).
 */
export function PreviewAudio({ video, videoUrl, tracks }: PreviewAudioProps) {
  const inVideo = tracks.find((track) => track.url === videoUrl && track.offsetMs === 0)
  return (
    <>
      {tracks.map((track) =>
        track === inVideo ? (
          <VideoSound key={track.id} video={video} volume={track.volume} />
        ) : (
          <PreviewAudioElement key={track.id} video={video} track={track} />
        ),
      )}
    </>
  )
}

/** The screen element's own sound at a track's volume; muted again when the track goes. */
function VideoSound({
  video,
  volume,
}: {
  video: RefObject<HTMLVideoElement | null>
  volume: number
}) {
  useEffect(() => {
    const element = video.current
    if (!element) return
    const gain = audioGain(volume)
    element.volume = gain.volume
    element.muted = gain.muted
  }, [video, volume])
  useEffect(() => {
    const element = video.current
    return () => {
      if (element) element.muted = true
    }
  }, [video])
  return null
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
