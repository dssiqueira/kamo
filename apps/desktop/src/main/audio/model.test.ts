import { describe, expect, it } from 'vitest'
import { mergeSettings, parseSettings, parseSettingsUpdate, publicSettings } from '../settings.ts'
import {
  audioFileName,
  audioSourcesFromSettings,
  hasAnySource,
  isAudioPermissionAllowed,
  parseAudioSources,
  parseRecorderReport,
  trackOffsetMs,
} from './model.ts'

describe('trackOffsetMs', () => {
  it('is negative when the audio started before the first video frame', () => {
    expect(trackOffsetMs(1_000_000, 1_000_450)).toBe(-450)
  })

  it('is positive when the audio started late, and rounds to whole ms', () => {
    expect(trackOffsetMs(1_000_012.6, 1_000_000)).toBe(13)
    expect(trackOffsetMs(5, 5)).toBe(0)
  })
})

describe('audioFileName', () => {
  it('uses the data-model names for AAC/MP4', () => {
    expect(audioFileName('mic', 'audio/mp4;codecs=mp4a.40.2')).toBe('audio.m4a')
    expect(audioFileName('system', 'audio/mp4')).toBe('system.m4a')
  })

  it('keeps the base name for the Opus/WebM fallback', () => {
    expect(audioFileName('mic', 'audio/webm;codecs=opus')).toBe('audio.webm')
    expect(audioFileName('system', 'audio/webm')).toBe('system.webm')
  })
})

describe('audioSourcesFromSettings', () => {
  const settings = { version: 1, micEnabled: true, micDeviceId: 'abc', systemAudioEnabled: true }

  it('records what the Home toggles say', () => {
    expect(audioSourcesFromSettings(settings as never, { system: true })).toEqual({
      mic: true,
      micDeviceId: 'abc',
      micNoiseSuppression: true,
      system: true,
    })
  })

  it('never records computer sound where it is not supported (Mac, for now)', () => {
    expect(audioSourcesFromSettings(settings as never, { system: false }).system).toBe(false)
  })

  it('is off by default, with the default microphone', () => {
    const sources = audioSourcesFromSettings({ version: 1 }, { system: true })
    expect(sources).toEqual({
      mic: false,
      micDeviceId: null,
      micNoiseSuppression: true,
      system: false,
    })
    expect(hasAnySource(sources)).toBe(false)
    const fromEmpty = audioSourcesFromSettings({ version: 1, micDeviceId: '' }, { system: true })
    expect(fromEmpty.micDeviceId).toBeNull()
  })

  it('keeps noise suppression on unless it was turned off', () => {
    const off = { version: 1, micNoiseSuppression: false } as const
    expect(audioSourcesFromSettings(off, { system: true }).micNoiseSuppression).toBe(false)
    const on = { version: 1, micNoiseSuppression: true } as const
    expect(audioSourcesFromSettings(on, { system: true }).micNoiseSuppression).toBe(true)
  })
})

describe('audio settings (F-01: toggles remembered)', () => {
  it('reads the toggles and the microphone, dropping only a broken field', () => {
    const settings = parseSettings(
      JSON.stringify({ micEnabled: true, micDeviceId: 'usb-mic', systemAudioEnabled: 'yes' }),
    )
    expect(publicSettings(settings)).toMatchObject({ micEnabled: true, micDeviceId: 'usb-mic' })
    expect(publicSettings(settings).systemAudioEnabled).toBeUndefined()
  })

  it('accepts toggle updates from the renderer and refuses wrong types', () => {
    const update = parseSettingsUpdate({ micEnabled: false, systemAudioEnabled: true })
    expect(mergeSettings({ version: 1, micEnabled: true }, update)).toMatchObject({
      micEnabled: false,
      systemAudioEnabled: true,
    })
    expect(parseSettingsUpdate({ micDeviceId: '' })).toEqual({ micDeviceId: '' })
    expect(() => parseSettingsUpdate({ micEnabled: 'on' })).toThrow()
  })

  it('reads the noise suppression setting, dropping a broken value (F-04)', () => {
    const off = parseSettings(JSON.stringify({ micNoiseSuppression: false }))
    expect(publicSettings(off).micNoiseSuppression).toBe(false)
    const broken = parseSettings(JSON.stringify({ micNoiseSuppression: 'no', micEnabled: true }))
    expect(publicSettings(broken).micNoiseSuppression).toBeUndefined()
    expect(publicSettings(broken).micEnabled).toBe(true)
    expect(parseSettings(null).micNoiseSuppression).toBeUndefined()
  })

  it('accepts a noise suppression update and refuses wrong types', () => {
    const update = parseSettingsUpdate({ micNoiseSuppression: false })
    expect(mergeSettings({ version: 1 }, update)).toMatchObject({ micNoiseSuppression: false })
    expect(() => parseSettingsUpdate({ micNoiseSuppression: 'off' })).toThrow()
  })
})

describe('parseRecorderReport', () => {
  it('accepts the messages of the recorder page', () => {
    const reports = [
      { type: 'ready' },
      { type: 'levels', levels: { mic: 0.4, system: 0 } },
      { type: 'started', track: 'mic', at: 1_700_000_000_000, mimeType: 'audio/mp4' },
      { type: 'failed', track: 'system', reason: 'unavailable' },
      { type: 'lost', track: 'mic' },
      { type: 'stopped', track: 'system' },
      {
        type: 'status',
        status: { devices: [{ id: 'a', label: 'USB' }], mic: 'live', system: 'unsupported' },
      },
    ]
    for (const report of reports) expect(parseRecorderReport(report)).toEqual(report)
  })

  it('refuses anything else', () => {
    for (const report of [
      null,
      { type: 'levels', levels: { mic: 2, system: 0 } },
      { type: 'started', track: 'camera', at: 1, mimeType: 'x' },
      { type: 'stopped', track: 'mic', extra: true },
      { type: 'keyboard' },
    ]) {
      expect(parseRecorderReport(report)).toBeNull()
    }
  })
})

describe('parseAudioSources', () => {
  it('accepts sources or null, and throws on anything else', () => {
    expect(parseAudioSources(null)).toBeNull()
    const sources = { mic: true, micDeviceId: null, system: false }
    expect(parseAudioSources(sources)).toEqual(sources)
    const quiet = { mic: true, micDeviceId: null, micNoiseSuppression: false, system: false }
    expect(parseAudioSources(quiet)).toEqual(quiet)
    expect(() => parseAudioSources({ ...quiet, micNoiseSuppression: 'no' })).toThrow()
    expect(() => parseAudioSources({ mic: true })).toThrow()
  })
})

describe('isAudioPermissionAllowed', () => {
  it('allows audio-only media and display capture for the recorder page', () => {
    expect(
      isAudioPermissionAllowed({ permission: 'media', fromRecorder: true, mediaTypes: ['audio'] }),
    ).toBe(true)
    expect(isAudioPermissionAllowed({ permission: 'display-capture', fromRecorder: true })).toBe(
      true,
    )
  })

  it('denies the camera, unknown media and every other permission', () => {
    const denied = [
      { permission: 'media', fromRecorder: true, mediaTypes: ['video'] },
      { permission: 'media', fromRecorder: true, mediaTypes: ['audio', 'video'] },
      { permission: 'media', fromRecorder: true, mediaTypes: [] },
      { permission: 'notifications', fromRecorder: true },
      { permission: 'clipboard-read', fromRecorder: true },
    ]
    for (const query of denied) expect(isAudioPermissionAllowed(query)).toBe(false)
  })

  it('denies everything to any other page', () => {
    expect(
      isAudioPermissionAllowed({ permission: 'media', fromRecorder: false, mediaTypes: ['audio'] }),
    ).toBe(false)
    expect(isAudioPermissionAllowed({ permission: 'display-capture', fromRecorder: false })).toBe(
      false,
    )
  })
})
