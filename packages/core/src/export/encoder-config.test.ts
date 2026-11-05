import { describe, expect, it } from 'vitest'
import {
  avcCodecs,
  avcLevel,
  canExport4k,
  chooseVideoEncoder,
  exportBitrate,
  resolveVideoSettings,
  videoSettingsFallbacks,
  type EncoderSupport,
} from './encoder-config.ts'

const HD = { width: 1920, height: 1080 }
const UHD = { width: 3840, height: 2160 }

/** A fake WebCodecs that accepts configs up to a size × rate budget, hardware only below it. */
function fakeEncoder(
  accept: (config: VideoEncoderConfig) => boolean,
): EncoderSupport & { asked: VideoEncoderConfig[] } {
  const asked: VideoEncoderConfig[] = []
  return {
    asked,
    isConfigSupported: async (config) => {
      asked.push(config)
      return { supported: accept(config) }
    },
  }
}

describe('avcLevel', () => {
  it('picks the lowest level that fits each export', () => {
    expect(avcLevel(HD, 30)).toBe('28') // 4.0
    expect(avcLevel(HD, 60)).toBe('2a') // 4.2
    expect(avcLevel(UHD, 30)).toBe('33') // 5.1
    expect(avcLevel(UHD, 60)).toBe('34') // 5.2
    expect(avcLevel({ width: 2160, height: 3840 }, 60)).toBe('34')
    // Never below 4.0, which every hardware encoder takes.
    expect(avcLevel({ width: 1080, height: 1080 }, 30)).toBe('28')
  })

  it('moves up a level when the bitrate needs it', () => {
    expect(avcLevel(HD, 30, 30_000_000)).toBe('29')
  })

  it('lists High, Main and Baseline at that level', () => {
    expect(avcCodecs(UHD, 60)).toEqual(['avc1.640034', 'avc1.4d0034', 'avc1.42e034'])
  })
})

describe('exportBitrate', () => {
  it('keeps 1080p30 as before and gives 60fps 1.5× the 30fps bitrate', () => {
    expect(exportBitrate(HD, 30)).toBe(Math.round(1920 * 1080 * 30 * 0.16))
    expect(exportBitrate(HD, 60)).toBe(Math.round(exportBitrate(HD, 30) * 1.5))
  })
})

describe('chooseVideoEncoder', () => {
  it('prefers hardware High profile', async () => {
    const encoder = fakeEncoder(() => true)
    expect(await chooseVideoEncoder(HD, 30, 1, encoder)).toEqual({
      codec: 'avc1.640028',
      hardware: true,
    })
  })

  it('falls back to software when no hardware encoder takes the config', async () => {
    const encoder = fakeEncoder((c) => c.hardwareAcceleration === 'prefer-software')
    expect(await chooseVideoEncoder(UHD, 60, 1, encoder)).toEqual({
      codec: 'avc1.640034',
      hardware: false,
    })
  })

  it('is null without WebCodecs or when nothing is supported', async () => {
    expect(await chooseVideoEncoder(HD, 30, 1, undefined)).toBeNull()
    expect(
      await chooseVideoEncoder(
        HD,
        30,
        1,
        fakeEncoder(() => false),
      ),
    ).toBeNull()
  })
})

describe('resolveVideoSettings', () => {
  it('lists the fallbacks best first, without repeats', () => {
    expect(videoSettingsFallbacks({ resolution: '4k', fps: 60 })).toEqual([
      { resolution: '4k', fps: 60 },
      { resolution: '4k', fps: 30 },
      { resolution: '1080p', fps: 60 },
      { resolution: '1080p', fps: 30 },
    ])
    expect(videoSettingsFallbacks({ resolution: '1080p', fps: 30 })).toEqual([
      { resolution: '1080p', fps: 30 },
    ])
  })

  it('keeps what was asked when the encoder takes it', async () => {
    const resolved = await resolveVideoSettings(
      '16:9',
      { resolution: '4k', fps: 60 },
      fakeEncoder(() => true),
    )
    expect(resolved).toMatchObject({ resolution: '4k', fps: 60, fallback: false })
  })

  it('drops to 4K30 when the encoder cannot do 4K60', async () => {
    // A hardware encoder limited to 4K30 worth of macroblocks per second.
    const encoder = fakeEncoder(
      (c) => c.width * c.height * (c.framerate ?? 30) <= UHD.width * UHD.height * 30,
    )
    const resolved = await resolveVideoSettings('16:9', { resolution: '4k', fps: 60 }, encoder)
    expect(resolved).toMatchObject({ resolution: '4k', fps: 30, fallback: true })
    expect(resolved?.encoder.codec).toBe('avc1.640033')
  })

  it('drops to 1080p when the encoder has no 4K at all', async () => {
    const encoder = fakeEncoder((c) => c.width * c.height <= HD.width * HD.height)
    const resolved = await resolveVideoSettings('9:16', { resolution: '4k', fps: 60 }, encoder)
    expect(resolved).toMatchObject({ resolution: '1080p', fps: 60, fallback: true })
  })

  it('is null when there is no H.264 encoder', async () => {
    expect(
      await resolveVideoSettings(
        '16:9',
        { resolution: '1080p', fps: 30 },
        fakeEncoder(() => false),
      ),
    ).toBeNull()
  })
})

describe('canExport4k', () => {
  it('needs a recording clearly above 1080p', () => {
    expect(canExport4k({ width: 1920, height: 1080 })).toBe(false)
    expect(canExport4k({ width: 1080, height: 1920 })).toBe(false)
    expect(canExport4k({ width: 1920, height: 1200 })).toBe(false)
    expect(canExport4k({ width: 2560, height: 1080 })).toBe(true)
    expect(canExport4k({ width: 2560, height: 1440 })).toBe(true)
    expect(canExport4k({ width: 2880, height: 1800 })).toBe(true)
    expect(canExport4k({ width: 1440, height: 2560 })).toBe(true)
  })
})
