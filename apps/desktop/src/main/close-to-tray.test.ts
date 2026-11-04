import { describe, expect, it } from 'vitest'
import {
  closeToTrayDefault,
  closeToTrayEnabled,
  shouldHideOnClose,
  shouldShowAppTray,
  shouldShowTrayNotice,
} from './close-to-tray.ts'

describe('closeToTrayDefault', () => {
  it('is on for Windows and Linux, off for Mac (the Dock keeps the app alive)', () => {
    expect(closeToTrayDefault('win32')).toBe(true)
    expect(closeToTrayDefault('linux')).toBe(true)
    expect(closeToTrayDefault('darwin')).toBe(false)
  })
})

describe('closeToTrayEnabled', () => {
  it('uses the saved choice over the platform default', () => {
    expect(closeToTrayEnabled(undefined, 'win32')).toBe(true)
    expect(closeToTrayEnabled(false, 'win32')).toBe(false)
    expect(closeToTrayEnabled(undefined, 'darwin')).toBe(false)
    expect(closeToTrayEnabled(true, 'darwin')).toBe(true)
  })
})

describe('shouldHideOnClose', () => {
  const base = { quitting: false, closeToTray: true, trayAvailable: true, smokeTest: false }

  it('hides when the setting is on and the tray icon is there', () => {
    expect(shouldHideOnClose(base)).toBe(true)
  })

  it('closes for real when quitting (tray Quit, Cmd+Q, shutdown, update)', () => {
    expect(shouldHideOnClose({ ...base, quitting: true })).toBe(false)
  })

  it('closes for real when the setting is off', () => {
    expect(shouldHideOnClose({ ...base, closeToTray: false })).toBe(false)
  })

  it('never hides without a tray icon to bring the window back', () => {
    expect(shouldHideOnClose({ ...base, trayAvailable: false })).toBe(false)
  })

  it('never hides in smoke tests', () => {
    expect(shouldHideOnClose({ ...base, smokeTest: true })).toBe(false)
  })
})

describe('shouldShowAppTray', () => {
  it('follows the setting', () => {
    expect(shouldShowAppTray({ closeToTray: true, recording: false, smokeTest: false })).toBe(true)
    expect(shouldShowAppTray({ closeToTray: false, recording: false, smokeTest: false })).toBe(
      false,
    )
  })

  it('gives way to the recording tray icon, so only one icon shows', () => {
    expect(shouldShowAppTray({ closeToTray: true, recording: true, smokeTest: false })).toBe(false)
  })

  it('never shows in smoke tests', () => {
    expect(shouldShowAppTray({ closeToTray: true, recording: false, smokeTest: true })).toBe(false)
  })
})

describe('shouldShowTrayNotice', () => {
  it('shows once on Windows', () => {
    expect(shouldShowTrayNotice({ platform: 'win32', noticeShown: false })).toBe(true)
    expect(shouldShowTrayNotice({ platform: 'win32', noticeShown: true })).toBe(false)
  })

  it('does not show on Mac', () => {
    expect(shouldShowTrayNotice({ platform: 'darwin', noticeShown: false })).toBe(false)
  })
})
