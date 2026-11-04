// Keeps the hidden webcam <video> (A-03) on the screen video's clock in the editor: same
// play/pause state, same rate, and its time = screen time − offsetMs (webcamTimeMs). The
// renderer then draws whatever frame the webcam element shows, as it does for the screen.
import { webcamTimeMs, type WebcamSettings, type WebcamSource } from '@kamo/core'

/** Past this drift while playing, the webcam is re-seeked onto the screen's clock. */
export const WEBCAM_MAX_DRIFT_S = 0.12

/** The webcam frame the element shows now, or null while it has none to draw. */
export function webcamSourceOf(element: HTMLVideoElement | null | undefined): WebcamSource | null {
  if (!element || element.readyState < 2 || !element.videoWidth || !element.videoHeight) {
    return null
  }
  return { source: element, size: { width: element.videoWidth, height: element.videoHeight } }
}

/**
 * Where the webcam element should be (seconds) for the screen element's current time,
 * held on its last frame when the screen runs past the end of the webcam recording.
 */
export function webcamTargetS(
  settings: Pick<WebcamSettings, 'offsetMs'>,
  screen: HTMLVideoElement,
  webcam: HTMLVideoElement,
): number {
  const target = webcamTimeMs(settings, screen.currentTime * 1000) / 1000
  return Number.isFinite(webcam.duration) ? Math.min(target, webcam.duration) : target
}

/**
 * Follows the screen element: mirrors play, pause, seek and rate onto the webcam element,
 * and calls `redraw` when a webcam seek lands while paused (the frame changed). Returns the
 * cleanup.
 */
export function syncWebcam(
  screen: HTMLVideoElement,
  webcam: HTMLVideoElement,
  settings: () => Pick<WebcamSettings, 'offsetMs'> | null,
  redraw: () => void,
): () => void {
  const seekWebcam = () => {
    const current = settings()
    if (!current) return
    const target = webcamTargetS(current, screen, webcam)
    if (Math.abs(webcam.currentTime - target) > 1 / 240) webcam.currentTime = target
  }
  const onPlay = () => {
    seekWebcam()
    webcam.playbackRate = screen.playbackRate
    void webcam.play().catch(() => {})
  }
  const onPause = () => {
    webcam.pause()
    seekWebcam()
  }
  const onRate = () => {
    webcam.playbackRate = screen.playbackRate
  }
  const onWebcamFrame = () => {
    if (screen.paused) redraw()
  }
  screen.addEventListener('play', onPlay)
  screen.addEventListener('pause', onPause)
  screen.addEventListener('seeking', seekWebcam)
  screen.addEventListener('ratechange', onRate)
  screen.addEventListener('loadeddata', seekWebcam)
  webcam.addEventListener('seeked', onWebcamFrame)
  webcam.addEventListener('loadeddata', onWebcamFrame)
  seekWebcam()
  if (!screen.paused) onPlay()
  return () => {
    screen.removeEventListener('play', onPlay)
    screen.removeEventListener('pause', onPause)
    screen.removeEventListener('seeking', seekWebcam)
    screen.removeEventListener('ratechange', onRate)
    screen.removeEventListener('loadeddata', seekWebcam)
    webcam.removeEventListener('seeked', onWebcamFrame)
    webcam.removeEventListener('loadeddata', onWebcamFrame)
    webcam.pause()
  }
}

/** While playing: pulls the webcam back onto the screen's clock if it drifted away. */
export function correctWebcamDrift(
  screen: HTMLVideoElement,
  webcam: HTMLVideoElement,
  settings: Pick<WebcamSettings, 'offsetMs'>,
): void {
  if (screen.paused || webcam.seeking) return
  const target = webcamTargetS(settings, screen, webcam)
  if (Math.abs(webcam.currentTime - target) > WEBCAM_MAX_DRIFT_S) webcam.currentTime = target
  if (webcam.paused && !webcam.ended) void webcam.play().catch(() => {})
}
