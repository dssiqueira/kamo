import { describe, expect, it } from 'vitest'
import { GAZE_PERIOD_MINUTES, gazeAlarmAction } from './gaze-alarm.ts'

describe('gazeAlarmAction', () => {
  it('looks around only while nothing is being recorded', () => {
    expect(gazeAlarmAction('idle', false)).toBe('create')
    expect(gazeAlarmAction('idle', true)).toBe('keep')
    for (const phase of ['countdown', 'starting', 'recording', 'saving'] as const) {
      expect(gazeAlarmAction(phase, true)).toBe('clear')
      expect(gazeAlarmAction(phase, false)).toBe('keep')
    }
  })

  it('wakes the browser at most once a minute', () => {
    expect(GAZE_PERIOD_MINUTES).toBeGreaterThanOrEqual(1)
  })
})
