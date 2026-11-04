import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, normalizePreferences } from './preferences.ts'

describe('normalizePreferences', () => {
  it('starts from the defaults: camera off, default devices', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(DEFAULT_PREFERENCES).toEqual({
      microphone: false,
      microphoneId: '',
      tabAudio: true,
      camera: false,
      cameraId: '',
    })
  })

  it('upgrades preferences saved before the device pickers', () => {
    expect(normalizePreferences({ microphone: true, tabAudio: false })).toEqual({
      ...DEFAULT_PREFERENCES,
      microphone: true,
      tabAudio: false,
    })
  })

  it('keeps the chosen devices', () => {
    const stored = { microphone: true, microphoneId: 'm1', camera: true, cameraId: 'c1' }
    expect(normalizePreferences(stored)).toMatchObject(stored)
  })

  it('ignores values of the wrong type', () => {
    expect(
      normalizePreferences({ microphone: 'yes', microphoneId: 4, camera: null, cameraId: {} }),
    ).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences('garbage')).toEqual(DEFAULT_PREFERENCES)
  })
})
