/**
 * The only API the renderer gets from the preload (`window.kamo`). Keep it small and typed:
 * the renderer never sees `ipcRenderer` or any Node/Electron object.
 */
export interface KamoApi {
  /** The user's preferred languages (BCP 47), most preferred first. */
  getLocale(): Promise<string[]>
  /** Connected displays with a fresh thumbnail each call (F-01). */
  listDisplays(): Promise<DisplayInfo[]>
  /** Called when a display is connected, removed or changes resolution. Returns unsubscribe. */
  onDisplaysChanged(listener: () => void): () => void
  /** Screen recording permission (only ever not `granted` on Mac). */
  getScreenAccess(): Promise<ScreenAccess>

  // Recording (F-01, F-02). Home starts it; the countdown and the floating bar drive it.
  startRecording(displayId: string): Promise<void>
  cancelCountdown(): Promise<void>
  countdownDone(): Promise<void>
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
  stopRecording(): Promise<void>
  /** Floating bar: clock snapshots on every state change. Returns unsubscribe. */
  onRecordingClock(listener: (clock: RecordingClock) => void): () => void
  /** Home: how the last recording ended. Returns unsubscribe. */
  onRecordingStatus(listener: (status: RecordingStatus) => void): () => void
}

export interface RecordingClock {
  state: 'recording' | 'paused'
  /** Recorded time (pauses excluded) when `at` was taken. */
  elapsedMs: number
  /** `Date.now()` of this snapshot. */
  at: number
  fps: number
}

export type RecordingStatus =
  | { kind: 'saved'; projectId: string; warning?: 'display_lost' | 'disk_full' }
  | { kind: 'error'; code: string }

export interface DisplayInfo {
  id: string
  /** OS label (e.g. the monitor model); empty when the OS gives none. */
  label: string
  /** Physical pixels (logical size × scale factor), what the recording will have. */
  width: number
  height: number
  scaleFactor: number
  primary: boolean
  /** JPEG data URL, or null when the OS did not return one. */
  thumbnail: string | null
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** IPC channel names shared by main and preload. */
export const IpcChannel = {
  getLocale: 'kamo:get-locale',
  listDisplays: 'kamo:list-displays',
  displaysChanged: 'kamo:displays-changed',
  getScreenAccess: 'kamo:get-screen-access',
  startRecording: 'kamo:recording-start',
  cancelCountdown: 'kamo:countdown-cancel',
  countdownDone: 'kamo:countdown-done',
  pauseRecording: 'kamo:recording-pause',
  resumeRecording: 'kamo:recording-resume',
  stopRecording: 'kamo:recording-stop',
  recordingClock: 'kamo:recording-clock',
  recordingStatus: 'kamo:recording-status',
} as const
