// When the toolbar Kamo may look around (E-01). An MV3 service worker sleeps after ~30s idle, so
// a chrome.alarms alarm wakes it once a minute (never more), and the move itself runs on
// timers while it is awake (under 2s). While recording the icon is the recording dot, so the
// alarm is cleared, and set again once the recording is over.
import type { Session } from '../shared/messages.ts'

export const GAZE_ALARM = 'kamo-gaze'
/** Once a minute: lively enough to notice, cheap enough to never matter. */
export const GAZE_PERIOD_MINUTES = 1

export type GazeAlarmAction = 'create' | 'clear' | 'keep'

export function gazeAlarmAction(phase: Session['phase'], alarmSet: boolean): GazeAlarmAction {
  if (phase === 'idle') return alarmSet ? 'keep' : 'create'
  return alarmSet ? 'clear' : 'keep'
}
