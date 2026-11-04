import { describe, expect, it } from 'vitest'
import { DEFAULT_STOP_SHORTCUT, isValidAccelerator } from './accelerator.ts'

describe('stop shortcut validation', () => {
  it.each([
    DEFAULT_STOP_SHORTCUT,
    'CommandOrControl+Alt+S',
    'Control+Shift+F9',
    'Alt+F12',
    'Super+Space',
    'CommandOrControl+Shift+/',
    'Command+Option+Up',
  ])('accepts %s', (accelerator) => {
    expect(isValidAccelerator(accelerator)).toBe(true)
  })

  it.each([
    ['a plain key (would swallow typing everywhere)', 'A'],
    ['Shift alone (would swallow capital letters)', 'Shift+A'],
    ['only modifiers', 'CommandOrControl+Shift'],
    ['two keys', 'CommandOrControl+A+B'],
    ['a repeated modifier', 'Alt+Alt+A'],
    ['a modifier after the key', 'A+Alt'],
    ['an unknown key', 'CommandOrControl+MediaPlayPause'],
    ['lowercase letters', 'CommandOrControl+a'],
    ['an empty string', ''],
    ['not a string', 42],
  ])('rejects %s', (_why, accelerator) => {
    expect(isValidAccelerator(accelerator)).toBe(false)
  })
})
