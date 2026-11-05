import { describe, expect, it } from 'vitest'
import { INTRO_SLIDES, INTRO_START, introKeyCommand, introStep, type IntroState } from './intro.ts'

const at = (index: number, direction: 1 | -1 = 1): IntroState => ({
  index,
  direction,
  finished: false,
})

describe('introStep', () => {
  it('has three slides, starting at the first', () => {
    expect(INTRO_SLIDES).toEqual(['record', 'click', 'edit'])
    expect(INTRO_START).toEqual(at(0))
  })

  it('goes forward and back, remembering the direction', () => {
    expect(introStep(at(0), 'next')).toEqual(at(1, 1))
    expect(introStep(at(2), 'back')).toEqual(at(1, -1))
  })

  it('stays on the first slide when going back', () => {
    const start = at(0)
    expect(introStep(start, 'back')).toBe(start)
  })

  it('finishes with Next on the last slide', () => {
    expect(introStep(at(2), 'next')).toEqual({ index: 2, direction: 1, finished: true })
  })

  it('finishes with Skip from any slide', () => {
    expect(introStep(at(0), 'skip').finished).toBe(true)
    expect(introStep(at(1), 'skip')).toEqual({ index: 1, direction: 1, finished: true })
  })

  it('ignores every command once finished', () => {
    const done = introStep(at(2), 'next')
    expect(introStep(done, 'back')).toBe(done)
    expect(introStep(done, { goTo: 0 })).toBe(done)
  })

  it('jumps to a dot, clamped, with the direction of the jump', () => {
    expect(introStep(at(0), { goTo: 2 })).toEqual(at(2, 1))
    expect(introStep(at(2), { goTo: 0 })).toEqual(at(0, -1))
    expect(introStep(at(1), { goTo: 9 })).toEqual(at(2, 1))
    expect(introStep(at(1), { goTo: -3 })).toEqual(at(0, -1))
    const same = at(1)
    expect(introStep(same, { goTo: 1 })).toBe(same)
  })

  it('works with another number of slides', () => {
    expect(introStep(at(0), 'next', 1).finished).toBe(true)
    expect(introStep(at(3), 'next', 5)).toEqual(at(4, 1))
  })
})

describe('introKeyCommand', () => {
  it('maps arrows, Enter and Esc', () => {
    expect(introKeyCommand('ArrowRight')).toBe('next')
    expect(introKeyCommand('ArrowLeft')).toBe('back')
    expect(introKeyCommand('Enter')).toBe('next')
    expect(introKeyCommand('Escape')).toBe('skip')
  })

  it('leaves Enter to a focused button, so one press moves once', () => {
    expect(introKeyCommand('Enter', { onControl: true })).toBeNull()
    expect(introKeyCommand('ArrowRight', { onControl: true })).toBe('next')
  })

  it('ignores held keys and other keys', () => {
    expect(introKeyCommand('ArrowRight', { repeat: true })).toBeNull()
    expect(introKeyCommand('a')).toBeNull()
    expect(introKeyCommand(' ')).toBeNull()
  })
})
