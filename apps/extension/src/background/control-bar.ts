// The recording bar (E-01, flows.md → Recording in the extension): a small Chrome popup window
// with the timecode, Pause / Resume and Stop, like the desktop app's floating bar. It is its own
// window, not part of the recorded tab, so tab capture never puts it in the video, and nothing
// is injected into the page (rule 2).
//
// It opens once the recording actually starts and closes when it ends (stop, save, cancel,
// failure). If the user closes it, the recording keeps going (the icon and ⌘⇧2 / Ctrl+Shift+2
// still stop it) and it does not come back for that recording. Its window id is kept in the
// background state (chrome.storage.session), so a restarted service worker adopts the open bar
// instead of opening a second one.
import type { BackgroundState, Session } from '../shared/messages.ts'

/** Built bar page (vite.config.ts entry point). */
export const BAR_PAGE = 'recording-bar.html'

/**
 * Outer size of the bar's window (title bar included). The desktop bar is 440×64 with no
 * frame; a Chrome popup window adds its title bar on top.
 */
export const BAR_SIZE = { width: 380, height: 108 }

/** Gap between the bar and the bottom edge of the browser window it sits on. */
export const BAR_MARGIN = 24

/**
 * The bar of the current recording: its window id while open, 'closed' once the user closed
 * it (it is not reopened for that recording), undefined when none was opened yet.
 */
export type BarRecord = BackgroundState['bar']

export interface BarPlan {
  /** Open a new bar (only while recording and none was ever open). */
  open: boolean
  /** Bar windows to close: every one outside a recording, and duplicates. */
  close: number[]
  /** What to persist once the plan ran (an opened bar then stores its new id). */
  next: BarRecord
}

/**
 * What to do with the bar, given the session, what was persisted and the windows that host the
 * bar page right now (`alive`, read from Chrome). Pure, so it can be tested.
 */
export function planBar(session: Session, stored: BarRecord, alive: readonly number[]): BarPlan {
  if (session.phase !== 'recording') return { open: false, close: [...alive], next: undefined }
  if (alive.length > 0) {
    // Keep the one this recording opened when it is still there; any other is a duplicate.
    const keep = typeof stored === 'number' && alive.includes(stored) ? stored : alive[0]!
    return { open: false, close: alive.filter((id) => id !== keep), next: keep }
  }
  // None open: first time for this recording → open; otherwise the user closed it.
  if (stored === undefined) return { open: true, close: [], next: undefined }
  return { open: false, close: [], next: 'closed' }
}

export interface WindowBounds {
  left?: number | undefined
  top?: number | undefined
  width?: number | undefined
  height?: number | undefined
}

/**
 * Where the bar opens: bottom-center of the browser window that holds the recorded tab (the
 * desktop bar sits bottom-center of the screen), kept inside that window when it is smaller.
 * Without the window's bounds, Chrome picks the place.
 */
export function barBounds(browser: WindowBounds): {
  width: number
  height: number
  left?: number
  top?: number
} {
  const { width, height } = BAR_SIZE
  const { left, top, width: w, height: h } = browser
  if (left === undefined || top === undefined || w === undefined || h === undefined) {
    return { width, height }
  }
  return {
    width,
    height,
    left: Math.round(left + Math.max(0, (w - width) / 2)),
    top: Math.round(top + Math.max(0, h - height - BAR_MARGIN)),
  }
}
