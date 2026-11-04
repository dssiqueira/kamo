import { describe, expect, it } from 'vitest'
import { acceleratorFromKeyPress, formatAccelerator, type KeyPress } from './shortcut.ts'

function press(code: string, mods: Partial<KeyPress> = {}): KeyPress {
  return {
    key: code,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  }
}

describe('acceleratorFromKeyPress', () => {
  it('maps the platform main modifier to CommandOrControl', () => {
    expect(
      acceleratorFromKeyPress(press('Digit2', { ctrlKey: true, shiftKey: true }), 'windows'),
    ).toEqual({ kind: 'shortcut', accelerator: 'CommandOrControl+Shift+2' })
    expect(
      acceleratorFromKeyPress(press('Digit2', { metaKey: true, shiftKey: true }), 'mac'),
    ).toEqual({
      kind: 'shortcut',
      accelerator: 'CommandOrControl+Shift+2',
    })
    expect(acceleratorFromKeyPress(press('KeyS', { ctrlKey: true, altKey: true }), 'mac')).toEqual({
      kind: 'shortcut',
      accelerator: 'Control+Alt+S',
    })
    expect(acceleratorFromKeyPress(press('F9', { metaKey: true }), 'windows')).toEqual({
      kind: 'shortcut',
      accelerator: 'Super+F9',
    })
  })

  it('uses the physical key, so keyboard layouts do not matter', () => {
    expect(
      acceleratorFromKeyPress({ ...press('Digit2', { ctrlKey: true }), key: 'é' }, 'windows'),
    ).toEqual({ kind: 'shortcut', accelerator: 'CommandOrControl+2' })
    expect(acceleratorFromKeyPress(press('ArrowUp', { altKey: true }), 'windows')).toEqual({
      kind: 'shortcut',
      accelerator: 'Alt+Up',
    })
    expect(acceleratorFromKeyPress(press('Slash', { altKey: true }), 'windows')).toEqual({
      kind: 'shortcut',
      accelerator: 'Alt+/',
    })
  })

  it('waits while only modifiers are held', () => {
    expect(acceleratorFromKeyPress(press('ShiftLeft', { shiftKey: true }), 'mac')).toEqual({
      kind: 'pending',
    })
    expect(
      acceleratorFromKeyPress({ ...press('ControlRight'), key: 'Control' }, 'windows'),
    ).toEqual({ kind: 'pending' })
  })

  it('refuses keys without Ctrl/⌘/Alt (Shift alone would block typing)', () => {
    expect(acceleratorFromKeyPress(press('KeyA'), 'windows')).toEqual({ kind: 'needs_modifier' })
    expect(acceleratorFromKeyPress(press('KeyA', { shiftKey: true }), 'mac')).toEqual({
      kind: 'needs_modifier',
    })
  })

  it('refuses keys that cannot be shortcuts', () => {
    expect(acceleratorFromKeyPress(press('MediaPlayPause', { ctrlKey: true }), 'windows')).toEqual({
      kind: 'unsupported',
    })
  })
})

describe('formatAccelerator', () => {
  it('uses symbols on Mac and names elsewhere', () => {
    expect(formatAccelerator('CommandOrControl+Shift+2', 'mac')).toBe('⌘⇧2')
    expect(formatAccelerator('CommandOrControl+Shift+2', 'windows')).toBe('Ctrl+Shift+2')
    expect(formatAccelerator('Control+Alt+Up', 'mac')).toBe('⌃⌥↑')
    expect(formatAccelerator('Super+Return', 'windows')).toBe('Win+Enter')
  })
})
