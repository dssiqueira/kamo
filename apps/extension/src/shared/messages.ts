// Messages between the extension's pieces (E-01). `chrome.runtime.sendMessage` reaches every
// extension page at once, so each message names its `target` and the others ignore it.
//
//   popup ──request──▶ background (service worker) ──request──▶ offscreen (recorder)
//   popup ◀──state (port)── background ◀──events── offscreen
import type { ClockSnapshot } from './clock.ts'

/** Port the popup opens to receive the background state while it is open. */
export const POPUP_PORT = 'kamo-popup'

/** Chrome command (manifest `commands`) that stops the recording: ⌘⇧2 / Ctrl+Shift+2. */
export const STOP_COMMAND = 'stop-recording'

/** Port the content script in the recorded tab opens to the offscreen recorder (E-02). */
export const MOUSE_PORT = 'kamo-mouse'

/** Where the recording is. Only one recording at a time, in one tab. */
export type Session =
  | { phase: 'idle' }
  | { phase: 'countdown'; tabId: number; projectId: string; value: number }
  | { phase: 'starting'; tabId: number; projectId: string }
  | { phase: 'recording'; tabId: number; projectId: string; clock: ClockSnapshot }
  | { phase: 'saving'; tabId: number; projectId: string }

/** A message for the popup, as an i18n key from @kamo/i18n (rule 14). */
export interface Notice {
  key: string
  tone: 'success' | 'warning' | 'error'
}

export interface BackgroundState {
  session: Session
  /** Shown once in the popup (e.g. "Saved"), then dismissed. */
  notices: Notice[]
}

export interface RecordOptions {
  microphone: boolean
  /** '' = the default microphone. */
  microphoneId: string
  tabAudio: boolean
  /** Webcam bubble (A-03). */
  camera: boolean
  /** '' = the default camera. */
  cameraId: string
  /** "Recording 03/11, 22:38", already translated by the popup (project.defaultName). */
  projectName: string
  /** The popup's devicePixelRatio, the best guess of the tab's (same display). */
  devicePixelRatio: number
}

export type BackgroundRequest =
  | { target: 'background'; type: 'get-state' }
  | { target: 'background'; type: 'record'; tabId: number; options: RecordOptions }
  | { target: 'background'; type: 'cancel' }
  | { target: 'background'; type: 'pause' }
  | { target: 'background'; type: 'resume' }
  | { target: 'background'; type: 'stop' }
  | { target: 'background'; type: 'dismiss-notices' }

/** Events the offscreen recorder sends on its own. */
export type OffscreenEvent =
  | { target: 'background'; type: 'clock'; projectId: string; clock: ClockSnapshot }
  /** The recording ended (stop, tab closed or failure) and the project is final. */
  | { target: 'background'; type: 'finished'; projectId: string; notices: Notice[] }

export interface PrepareRequest {
  target: 'offscreen'
  type: 'prepare'
  streamId: string
  /** The recorded tab: only its mouse events are kept (E-02). */
  tabId: number
  projectId: string
  projectName: string
  microphone: boolean
  microphoneId: string
  tabAudio: boolean
  camera: boolean
  cameraId: string
  /** Requested video size (already capped at 1080p). */
  width: number
  height: number
  /** Video pixels per CSS pixel of the tab: what step 13 needs to place the clicks. */
  scaleFactor: number
}

export type OffscreenRequest =
  | PrepareRequest
  | { target: 'offscreen'; type: 'start' }
  | { target: 'offscreen'; type: 'pause' }
  | { target: 'offscreen'; type: 'resume' }
  | { target: 'offscreen'; type: 'stop' }
  | { target: 'offscreen'; type: 'cancel' }
  /** The tab went where the extension cannot follow: clicks stop being captured (E-02). */
  | { target: 'offscreen'; type: 'events-lost' }

export type OffscreenResponse =
  { ok: true; clock?: ClockSnapshot; notices?: Notice[] } | { ok: false; notice: Notice }

export function isBackgroundMessage(
  message: unknown,
): message is BackgroundRequest | OffscreenEvent {
  return isTargeted(message, 'background')
}

export function isOffscreenRequest(message: unknown): message is OffscreenRequest {
  return isTargeted(message, 'offscreen')
}

function isTargeted(message: unknown, target: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { target?: unknown }).target === target
  )
}
