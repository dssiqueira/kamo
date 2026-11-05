import { describe, expect, it } from 'vitest'
import { captureSize, isRecordableUrl, pickVideoMimeType, videoBitrate } from './capture.ts'

describe('isRecordableUrl', () => {
  it('accepts regular pages and local files', () => {
    expect(isRecordableUrl('https://example.com/app')).toBe(true)
    expect(isRecordableUrl('http://localhost:5173/')).toBe(true)
    expect(isRecordableUrl('file:///C:/demo.html')).toBe(true)
  })

  it('refuses pages Chrome does not let extensions capture', () => {
    expect(isRecordableUrl('chrome://settings')).toBe(false)
    expect(isRecordableUrl('chrome-extension://abc/popup.html')).toBe(false)
    expect(isRecordableUrl('edge://newtab')).toBe(false)
    expect(isRecordableUrl('about:blank')).toBe(false)
    expect(isRecordableUrl('view-source:https://example.com')).toBe(false)
    expect(isRecordableUrl('https://chromewebstore.google.com/detail/x')).toBe(false)
    expect(isRecordableUrl('https://chrome.google.com/webstore/category')).toBe(false)
  })

  it('refuses a tab without a URL (the extension was not invoked on it)', () => {
    expect(isRecordableUrl(undefined)).toBe(false)
    expect(isRecordableUrl('')).toBe(false)
    expect(isRecordableUrl('not a url')).toBe(false)
  })
})

describe('captureSize', () => {
  it('keeps a tab smaller than 1080p at its own pixel size', () => {
    expect(captureSize({ width: 1280, height: 720 }, 1)).toEqual({ width: 1280, height: 720 })
  })

  it('scales a HiDPI tab down to fit 1920×1080, keeping the aspect ratio', () => {
    expect(captureSize({ width: 1440, height: 900 }, 2)).toEqual({ width: 1728, height: 1080 })
    expect(captureSize({ width: 1920, height: 1080 }, 1.5)).toEqual({ width: 1920, height: 1080 })
  })

  it('returns even sizes and survives a bad devicePixelRatio', () => {
    expect(captureSize({ width: 1001, height: 601 }, 1)).toEqual({ width: 1000, height: 600 })
    expect(captureSize({ width: 800, height: 600 }, Number.NaN)).toEqual({
      width: 800,
      height: 600,
    })
  })
})

describe('videoBitrate', () => {
  it('is about 6 Mbps at 1080p30 and has a floor for small tabs', () => {
    expect(videoBitrate({ width: 1920, height: 1080 })).toBe(6_220_800)
    expect(videoBitrate({ width: 320, height: 240 })).toBe(1_500_000)
  })
})

describe('pickVideoMimeType', () => {
  it('prefers H.264 in MP4, then VP9, then VP8, then plain WebM (D-037)', () => {
    expect(pickVideoMimeType(() => true, true)).toBe('video/mp4;codecs=avc1,opus')
    const noMp4 = (t: string) => !t.startsWith('video/mp4')
    expect(pickVideoMimeType(noMp4, true)).toBe('video/webm;codecs=vp9,opus')
    expect(pickVideoMimeType((t) => noMp4(t) && !t.includes('vp9'), true)).toBe(
      'video/webm;codecs=vp8,opus',
    )
    expect(pickVideoMimeType((t) => t === 'video/webm', false)).toBe('video/webm')
  })

  it('asks for a video-only type when the tab sound is off', () => {
    expect(pickVideoMimeType(() => true, false)).toBe('video/mp4;codecs=avc1')
    expect(pickVideoMimeType((t) => !t.startsWith('video/mp4'), false)).toBe(
      'video/webm;codecs=vp9',
    )
  })

  it('returns null when the browser records none of them', () => {
    expect(pickVideoMimeType(() => false, true)).toBeNull()
  })
})
