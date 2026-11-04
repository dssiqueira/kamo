import { describe, expect, it } from 'vitest'
import {
  deviceConstraint,
  deviceOptions,
  isDeviceGone,
  openWithFallback,
  pickCameraMimeType,
  selectedDevice,
  webcamFileFor,
} from './devices.ts'

const device = (kind: MediaDeviceKind, deviceId: string, label = '') => ({ kind, deviceId, label })

describe('deviceOptions', () => {
  it('lists one kind, without the default aliases or hidden ids', () => {
    const all = [
      device('audioinput', 'default', 'Default - Headset'),
      device('audioinput', 'communications', 'Communications - Headset'),
      device('audioinput', 'a1', 'Headset'),
      device('audioinput', 'a2', 'Built-in'),
      device('videoinput', 'v1', 'FaceTime'),
      device('audiooutput', 'o1', 'Speakers'),
      device('videoinput', '', ''),
    ]
    expect(deviceOptions(all, 'audioinput')).toEqual([
      { id: 'a1', label: 'Headset' },
      { id: 'a2', label: 'Built-in' },
    ])
    expect(deviceOptions(all, 'videoinput')).toEqual([{ id: 'v1', label: 'FaceTime' }])
  })
})

describe('selectedDevice', () => {
  const options = [{ id: 'a1', label: '' }]
  it('keeps a remembered device that is plugged in', () => {
    expect(selectedDevice(options, 'a1')).toBe('a1')
  })
  it('reads as the default when the device is gone', () => {
    expect(selectedDevice(options, 'gone')).toBe('')
    expect(selectedDevice([], '')).toBe('')
  })
})

describe('openWithFallback', () => {
  const failing = (name: string) => Object.assign(new Error(name), { name })

  it('opens the default directly when no device is chosen', async () => {
    const asked: string[] = []
    const result = await openWithFallback('', async (id) => (asked.push(id), 'stream'))
    expect(result).toEqual({ stream: 'stream', fellBack: false })
    expect(asked).toEqual([''])
  })

  it('opens the chosen device', async () => {
    const result = await openWithFallback('a1', async (id) => `stream:${id}`)
    expect(result).toEqual({ stream: 'stream:a1', fellBack: false })
  })

  it('falls back to the default when the chosen device is gone', async () => {
    for (const name of ['OverconstrainedError', 'NotFoundError']) {
      const asked: string[] = []
      const result = await openWithFallback('gone', async (id) => {
        asked.push(id)
        if (id) throw failing(name)
        return 'default'
      })
      expect(result).toEqual({ stream: 'default', fellBack: true })
      expect(asked).toEqual(['gone', ''])
    }
  })

  it('does not hide a missing permission or a busy device', async () => {
    await expect(
      openWithFallback('a1', async () => {
        throw failing('NotAllowedError')
      }),
    ).rejects.toThrow('NotAllowedError')
    expect(isDeviceGone(failing('NotReadableError'))).toBe(false)
    expect(isDeviceGone(null)).toBe(false)
  })
})

describe('deviceConstraint', () => {
  it('asks for the exact device, or leaves the default to the browser', () => {
    expect(deviceConstraint('a1')).toEqual({ deviceId: { exact: 'a1' } })
    expect(deviceConstraint('')).toEqual({})
  })
})

describe('camera format', () => {
  it('prefers MP4, like the desktop webcam.mp4', () => {
    expect(pickCameraMimeType(() => true)).toBe('video/mp4;codecs=avc1.42E01F')
    expect(pickCameraMimeType((t) => t === 'video/mp4;codecs=vp9')).toBe('video/mp4;codecs=vp9')
  })
  it('falls back to WebM, and to nothing', () => {
    expect(pickCameraMimeType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9')
    expect(pickCameraMimeType(() => false)).toBeNull()
  })
  it('names the file after the container', () => {
    expect(webcamFileFor('video/mp4;codecs=avc1')).toBe('webcam.mp4')
    expect(webcamFileFor('video/webm;codecs=vp9')).toBe('webcam.webm')
  })
})
