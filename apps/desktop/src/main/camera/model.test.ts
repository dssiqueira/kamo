import { describe, expect, it } from 'vitest'
import { mergeSettings, parseSettings, parseSettingsUpdate, publicSettings } from '../settings.ts'
import {
  cameraSourceFromSettings,
  isCameraPermissionAllowed,
  isWebm,
  parseCameraReport,
} from './model.ts'

describe('cameraSourceFromSettings', () => {
  it('is off by default, with the default camera', () => {
    expect(cameraSourceFromSettings({ version: 1 })).toEqual({ enabled: false, deviceId: null })
    expect(cameraSourceFromSettings({ version: 1, cameraDeviceId: '' }).deviceId).toBeNull()
  })

  it('records what the Home toggle says', () => {
    expect(
      cameraSourceFromSettings({ version: 1, cameraEnabled: true, cameraDeviceId: 'usb' }),
    ).toEqual({ enabled: true, deviceId: 'usb' })
  })
})

describe('camera settings (toggle remembered)', () => {
  it('reads the toggle and the camera, dropping only a broken field', () => {
    const settings = parseSettings(JSON.stringify({ cameraEnabled: 'yes', cameraDeviceId: 'cam' }))
    expect(publicSettings(settings).cameraDeviceId).toBe('cam')
    expect(publicSettings(settings).cameraEnabled).toBeUndefined()
  })

  it('accepts updates from the renderer and refuses wrong types', () => {
    const update = parseSettingsUpdate({ cameraEnabled: true, cameraDeviceId: '' })
    expect(mergeSettings({ version: 1 }, update)).toMatchObject({
      cameraEnabled: true,
      cameraDeviceId: '',
    })
    expect(() => parseSettingsUpdate({ cameraEnabled: 1 })).toThrow()
  })
})

describe('isWebm', () => {
  it('tells the VP9 fallback from MP4', () => {
    expect(isWebm('video/webm;codecs=vp9')).toBe(true)
    expect(isWebm('video/mp4;codecs=avc1.42E01F')).toBe(false)
  })
})

describe('parseCameraReport', () => {
  it('accepts the messages of the recorder page', () => {
    const reports = [
      { type: 'ready' },
      { type: 'started', at: 1_700_000_000_000, mimeType: 'video/mp4', width: 1280, height: 720 },
      { type: 'failed', reason: 'denied' },
      { type: 'lost' },
      { type: 'stopped' },
    ]
    for (const report of reports) expect(parseCameraReport(report)).toEqual(report)
  })

  it('refuses anything else', () => {
    for (const report of [
      null,
      { type: 'started', at: 1, mimeType: 'video/mp4' },
      { type: 'failed', reason: 'busy' },
      { type: 'stopped', extra: true },
      { type: 'keyboard' },
    ]) {
      expect(parseCameraReport(report)).toBeNull()
    }
  })
})

describe('isCameraPermissionAllowed', () => {
  it('allows video-only media to Home and the camera recorder page', () => {
    expect(
      isCameraPermissionAllowed({
        permission: 'media',
        fromCameraPage: true,
        mediaTypes: ['video'],
      }),
    ).toBe(true)
  })

  it('denies audio, mixed or unknown media, other permissions and other pages', () => {
    const denied = [
      { permission: 'media', fromCameraPage: true, mediaTypes: ['audio'] },
      { permission: 'media', fromCameraPage: true, mediaTypes: ['audio', 'video'] },
      { permission: 'media', fromCameraPage: true, mediaTypes: [] },
      { permission: 'display-capture', fromCameraPage: true },
      { permission: 'media', fromCameraPage: false, mediaTypes: ['video'] },
    ]
    for (const query of denied) expect(isCameraPermissionAllowed(query)).toBe(false)
  })
})
