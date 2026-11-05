import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPlaybackClock, type PlaybackClock } from './playback-clock.ts'

export interface Playback {
  playing: boolean
  /**
   * The playhead (raw video time in ms, not relative to the trim), moved on every presented
   * frame. An external store, not state: read it with usePlaybackTime / usePlaybackValue in
   * the small components that show it, so playing does not re-render the whole editor.
   */
  clock: PlaybackClock
  /**
   * The playhead where it rests: moved by seeks, steps and pauses while paused, not by the
   * frames of playback. For things that only follow a still frame (the caption gallery).
   */
  settled: PlaybackClock
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
  const [clock] = useState(() => createPlaybackClock(trim.startMs))
  const [settled] = useState(() => createPlaybackClock(trim.startMs))
  const trimRef = useRef(trim)
  trimRef.current = trim
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    const element = video.current
    if (!element) return
    let handle = 0
    const report = (ms: number) => {
      clock.set(ms)
      if (element.paused) settled.set(ms)
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
    const onPause = () => {
      setPlaying(false)
      settled.set(clock.get())
    }
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
  }, [video, clock, settled])

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

  return useMemo(
    () => ({ playing, clock, settled, toggle, seek, step }),
    [playing, clock, settled, toggle, seek, step],
  )
}
