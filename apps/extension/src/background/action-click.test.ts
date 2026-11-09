import { describe, expect, it } from 'vitest'
import type { Session } from '../shared/messages.ts'
import { MANIFEST_MESSAGES, POPUP } from '../../scripts/manifest.ts'
import { POPUP_PAGE, actionMode, actionSettings, type ActionMode } from './action-click.ts'

const ids = { tabId: 1, projectId: 'p' }
const clock = (state: 'recording' | 'paused') => ({ state, elapsedMs: 1000 }) as never

describe('actionMode', () => {
  it('stops on click while a recording runs', () => {
    expect(actionMode({ phase: 'recording', ...ids, clock: clock('recording') })).toBe('stop')
  })

  it('has its own tooltip while paused', () => {
    expect(actionMode({ phase: 'recording', ...ids, clock: clock('paused') })).toBe('paused')
  })

  it('keeps the popup in every other phase (it shows and cancels the countdown)', () => {
    const sessions: Session[] = [
      { phase: 'idle' },
      { phase: 'countdown', ...ids, value: 3 },
      { phase: 'starting', ...ids },
      { phase: 'saving', ...ids },
    ]
    for (const session of sessions) expect(actionMode(session)).toBe('popup')
  })
})

describe('actionSettings', () => {
  it('turns the popup off while recording or paused, so a click fires action.onClicked', () => {
    expect(actionSettings('stop')).toEqual({ popup: '', title: 'actionTitleRecording' })
    expect(actionSettings('paused')).toEqual({ popup: '', title: 'actionTitlePaused' })
    expect(actionSettings('popup')).toEqual({ popup: POPUP_PAGE, title: 'actionTitle' })
  })

  it('restores the manifest popup and uses only messages that reach _locales', () => {
    expect(POPUP_PAGE).toBe(POPUP)
    for (const mode of ['stop', 'paused', 'popup'] as ActionMode[]) {
      expect(MANIFEST_MESSAGES).toHaveProperty(actionSettings(mode).title)
    }
  })
})
