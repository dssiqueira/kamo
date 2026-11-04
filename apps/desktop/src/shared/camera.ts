// Webcam bubble, capture half (A-03): types shared by main, preload, Home and the hidden
// camera recorder page. Like the microphone (D-024), the camera is recorded in Electron, not
// by the native capture helper, into its own file (`webcam.mp4`, docs/data-model.md).

/** What the next recording captures. `deviceId: null` follows the system default camera. */
export interface CameraSource {
  enabled: boolean
  deviceId: string | null
}

/** Camera access as the OS reports it (Mac asks once; Windows only reads it). */
export type CameraAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** Problems with the camera of a saved recording; Home warns about them (A-03). */
export type CameraWarning = 'camera_unavailable' | 'camera_lost' | 'camera_failed'

/** main to camera recorder page. */
export type CameraCommand =
  /** Countdown: open the camera now, so the recording starts warm. */
  | { type: 'prepare'; source: CameraSource }
  /** Start recording (opens the camera first when needed). */
  | { type: 'start'; source: CameraSource }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }

/** camera recorder page to main. */
export type CameraReport =
  | { type: 'ready' }
  /** MediaRecorder began; `at` is `Date.now()` in the recorder at its `start` event. */
  | { type: 'started'; at: number; mimeType: string; width: number; height: number }
  /** The camera could not start (`denied` or `unavailable`). */
  | { type: 'failed'; reason: 'denied' | 'unavailable' }
  /** The camera went away mid-recording; the file ends there (A-03). */
  | { type: 'lost' }
  /** Every chunk was handed to main. */
  | { type: 'stopped' }

/**
 * Capture size and rate (A-03: the bubble is at most a few hundred pixels wide in a 1080p
 * export, so 720p is plenty). Home's preview asks for the same, so both share one device mode.
 */
export const CAMERA_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
} as const

/**
 * Preferred format: H.264 in MP4 (`webcam.mp4`, docs/data-model.md). VP9/WebM is the fallback
 * when this Chromium has no H.264 encoder; main remuxes it into MP4 (VP9 is valid in MP4).
 */
export const CAMERA_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
] as const
