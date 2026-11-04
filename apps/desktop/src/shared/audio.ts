// Microphone and computer sound (F-04): types shared by main, preload, Home and the hidden
// audio recorder page. Audio is recorded in Electron, not by the capture helper (D-024).

export type AudioTrackName = 'mic' | 'system'

/** What to capture. `micDeviceId: null` follows the system default microphone. */
export interface AudioSources {
  mic: boolean
  micDeviceId: string | null
  system: boolean
}

/** A microphone the user can pick (F-04: several microphones). */
export interface AudioDevice {
  id: string
  /** OS label; empty until microphone access is granted. */
  label: string
}

/**
 * State of one source:
 * - `off`: toggle off
 * - `starting`: opening the device
 * - `live`: capturing (levels flowing)
 * - `denied`: no permission (F-04: records only the video and warns)
 * - `unavailable`: no device, or the OS refused to open it
 * - `unsupported`: not on this OS yet (computer sound on Mac)
 */
export type AudioSourceStatus =
  'off' | 'starting' | 'live' | 'denied' | 'unavailable' | 'unsupported'

/** Devices and per-source state, sent on every change. */
export interface AudioStatus {
  devices: AudioDevice[]
  mic: AudioSourceStatus
  system: AudioSourceStatus
}

/** Live levels, 0 to 1 (perceptual), about 12 times a second. */
export interface AudioLevels {
  mic: number
  system: number
}

/** What this OS can record. */
export interface AudioSupport {
  /** Computer sound: Windows (WASAPI loopback) only for now; Mac is a TODO (D-024). */
  system: boolean
}

export type MicrophoneAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** Problems with the audio of a saved recording; Home warns about them (F-04). */
export type AudioWarning = 'mic_unavailable' | 'mic_lost' | 'system_unavailable' | 'audio_failed'

/** main to recorder page. */
export type RecorderCommand =
  /** Open (or close) the sources for the Home meters. */
  | { type: 'configure'; sources: AudioSources }
  /** Start recording these sources (opens them first when needed). */
  | { type: 'start'; sources: AudioSources }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }

/** recorder page to main. */
export type RecorderReport =
  | { type: 'ready' }
  | { type: 'status'; status: AudioStatus }
  | { type: 'levels'; levels: AudioLevels }
  /** MediaRecorder began; `at` is `Date.now()` in the recorder at its `start` event. */
  | { type: 'started'; track: AudioTrackName; at: number; mimeType: string }
  /** A track could not start (`denied` or `unavailable`). */
  | { type: 'failed'; track: AudioTrackName; reason: 'denied' | 'unavailable' }
  /** The device went away mid-recording; the file goes on with silence (F-04). */
  | { type: 'lost'; track: AudioTrackName }
  /** Every chunk of this track was handed to main. */
  | { type: 'stopped'; track: AudioTrackName }

/** Preferred format: AAC in MP4 (`audio.m4a`, docs/data-model.md); Opus/WebM as a fallback. */
export const AUDIO_MIME_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus'] as const
