import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface Playback {
  playing: boolean
  /** Video time in ms (raw video, not relative to the trim). */
  timeMs: number
  toggle(): void
  seek(timeMs: number): void
  /** Moves by whole frames (F-10: arrows step one frame). */
  step(frames: number): void
}

/**
 * Plays the raw video inside the trim (F-16) and reports its time. `onFrame` runs for every
 * presented frame while playing and after every seek, so the preview redraws exactly then.
 */
export function usePlayback(
  video: RefObject<HTMLVideoElement | null>,
  trim: { startMs: number; endMs: number },
  fps: number,
  onFrame: (timeMs: number) => void,
): Playback {
  const [playing, setPlaying] = useState(false)
  const [timeMs, setTimeMs] = useState(trim.startMs)
  const trimRef = useRef(trim)
  trimRef.current = trim
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    const element = video.current
    if (!element) return
    let handle = 0
    const report = (ms: number) => {
      setTimeMs(ms)
      onFrameRef.current(ms)
    }
    const onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      const ms = meta.mediaTime * 1000
      if (ms >= trimRef.current.endMs) {
        element.pause()
        element.currentTime = trimRef.current.endMs / 1000
      }
      report(Math.min(ms, trimRef.current.endMs))
      if (!element.paused) handle = element.requestVideoFrameCallback(onVideoFrame)
    }
    const onPlay = () => {
      setPlaying(true)
      handle = element.requestVideoFrameCallback(onVideoFrame)
    }
    const onPause = () => setPlaying(false)
    const onSeeked = () => report(element.currentTime * 1000)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('seeked', onSeeked)
    element.addEventListener('loadeddata', onSeeked)
    return () => {
      element.cancelVideoFrameCallback(handle)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('seeked', onSeeked)
      element.removeEventListener('loadeddata', onSeeked)
    }
  }, [video])

  const seek = useCallback(
    (ms: number) => {
      const element = video.current
      if (!element) return
      const { startMs, endMs } = trimRef.current
      element.currentTime = Math.min(endMs, Math.max(startMs, ms)) / 1000
    },
    [video],
  )

  const toggle = useCallback(() => {
    const element = video.current
    if (!element) return
    if (!element.paused) return element.pause()
    // Playing from the end starts over at the trim start.
    if (element.currentTime * 1000 >= trimRef.current.endMs - 1) {
      element.currentTime = trimRef.current.startMs / 1000
    }
    void element.play()
  }, [video])

  const step = useCallback(
    (frames: number) => {
      const element = video.current
      if (!element) return
      element.pause()
      seek(element.currentTime * 1000 + (frames * 1000) / fps)
    },
    [video, seek, fps],
  )

  return { playing, timeMs, toggle, seek, step }
}
