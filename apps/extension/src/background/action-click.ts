// What a click on the toolbar icon does (E-01). Chrome fires `action.onClicked` only when the
// action has no popup, so while a recording runs (paused or not) the service worker takes the
// popup away and the click stops the recording (the same stop as ⌘⇧2 / Ctrl+Shift+2 and the
// recording bar's Stop). Pause and Resume live on the recording bar (control-bar.ts). Any other
// phase (idle, countdown, starting, saving) keeps the popup, which shows the countdown and
// cancels it.
import type { Session } from '../shared/messages.ts'

/** Built popup page (scripts/manifest.ts → POPUP, the manifest's `default_popup`). */
export const POPUP_PAGE = 'popup.html'

/** `_locales` message names (scripts/manifest.ts → MANIFEST_MESSAGES) the icon uses. */
export type ActionMessage = 'actionTitle' | 'actionTitleRecording' | 'actionTitlePaused'

export type ActionMode = 'popup' | 'stop' | 'paused'

export interface ActionSettings {
  /** `chrome.action.setPopup`: '' turns the click into `onClicked`. */
  popup: string
  /** Tooltip, as a `_locales` message name. */
  title: ActionMessage
}

export function actionMode(session: Session): ActionMode {
  if (session.phase !== 'recording') return 'popup'
  return session.clock.state === 'paused' ? 'paused' : 'stop'
}

export function actionSettings(mode: ActionMode): ActionSettings {
  switch (mode) {
    case 'stop':
      return { popup: '', title: 'actionTitleRecording' }
    case 'paused':
      // Still stops on click (and saves); Resume is on the recording bar.
      return { popup: '', title: 'actionTitlePaused' }
    case 'popup':
      return { popup: POPUP_PAGE, title: 'actionTitle' }
  }
}
