import { describe, expect, it } from 'vitest'
import { findKeyboardCapture, isScanned } from './keyboard-guard.ts'

const rules = (file: string, text: string) => findKeyboardCapture(file, text).map((v) => v.rule)

describe('keyboard guard', () => {
  it.each([
    [
      'apps/desktop/native/win/src/hook.rs',
      'SetWindowsHookExW(WH_KEYBOARD_LL, Some(proc), None, 0)',
    ],
    ['apps/desktop/native/mac/Sources/x/Tap.swift', 'let mask = 1 << CGEventType.keyDown.rawValue'],
    [
      'apps/desktop/native/mac/Sources/x/Tap.swift',
      'NSEvent.addGlobalMonitorForEvents(matching: .any)',
    ],
    ['apps/desktop/src/main/hook.ts', "import { uIOhook } from 'uiohook-napi'"],
    ['apps/desktop/src/main/index.ts', "globalShortcut.register('CommandOrControl+K', fn)"],
    ['apps/extension/src/content/clicks.ts', "document.addEventListener('keydown', onKey)"],
  ])('flags %s', (file, text) => {
    expect(rules(file, text)).toHaveLength(1)
  })

  it.each([
    [
      'apps/desktop/src/main/recording-controller.ts',
      'globalShortcut.register(STOP_SHORTCUT, () => stop())',
    ],
    ['apps/desktop/src/renderer/src/countdown.tsx', "window.addEventListener('keydown', onKey)"],
    [
      'apps/desktop/native/mac/Sources/x/Tap.swift',
      'let mask = 1 << CGEventType.leftMouseDown.rawValue',
    ],
    ['apps/desktop/native/win/src/hook.rs', 'SetWindowsHookExW(WH_MOUSE_LL, Some(proc), None, 0)'],
  ])('allows %s', (file, text) => {
    expect(rules(file, text)).toEqual([])
  })

  it('scans app and native sources only', () => {
    expect(isScanned('apps/desktop/src/main/index.ts')).toBe(true)
    expect(isScanned('apps/desktop/native/mac/Sources/kamo-capture/main.swift')).toBe(true)
    expect(isScanned('apps/desktop/native/mac/build/release/x.swift')).toBe(false)
    expect(isScanned('apps/desktop/src/main/foo.test.ts')).toBe(false)
    expect(isScanned('docs/plan.md')).toBe(false)
    expect(isScanned('node_modules/uiohook-napi/index.js')).toBe(false)
  })
})
