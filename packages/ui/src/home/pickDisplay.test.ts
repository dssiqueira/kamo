import { describe, expect, it } from 'vitest'
import { pickDisplay, type DisplayOption } from './pickDisplay.ts'

const display = (id: string, primary = false): DisplayOption => ({
  id,
  label: '',
  width: 1920,
  height: 1080,
  primary,
  thumbnail: null,
})

const displays = [display('a'), display('b', true), display('c')]

describe('pickDisplay', () => {
  it('preselects the primary display', () => {
    expect(pickDisplay(displays, null)).toBe('b')
  })

  it('keeps the current choice while it is connected', () => {
    expect(pickDisplay(displays, 'c', 'a')).toBe('c')
  })

  it('restores the remembered display from the last recording', () => {
    expect(pickDisplay(displays, null, 'a')).toBe('a')
  })

  it('falls back to the primary when the chosen display is disconnected', () => {
    expect(pickDisplay([display('a'), display('b', true)], 'c', 'c')).toBe('b')
  })

  it('handles no displays and no primary', () => {
    expect(pickDisplay([], 'a')).toBeNull()
    expect(pickDisplay([display('x'), display('y')], null)).toBe('x')
  })
})
