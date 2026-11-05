import { describe, expect, it } from 'vitest'
import {
  capturerWindowId,
  clipRegion,
  joinWindows,
  parseCaptureTarget,
  regionPixels,
} from './targets.ts'

describe('parseCaptureTarget', () => {
  it('accepts a display id, a display, a window and a region', () => {
    expect(parseCaptureTarget('42')).toEqual({ kind: 'display', displayId: '42' })
    expect(parseCaptureTarget({ kind: 'window', windowId: '1234', displayId: '42' })).toEqual({
      kind: 'window',
      windowId: '1234',
      displayId: '42',
    })
    const region = {
      kind: 'region',
      displayId: '42',
      rect: { x: 0, y: 10, width: 640, height: 480 },
    }
    expect(parseCaptureTarget(region)).toEqual(region)
  })

  it.each([
    [''],
    [42],
    [null],
    [{ kind: 'window', windowId: 'abc' }],
    [{ kind: 'region', displayId: '1', rect: { x: 0, y: 0, width: -1, height: 1 } }],
    [{ kind: 'display', displayId: '1', extra: true }],
    [{ kind: 'tab', displayId: '1' }],
  ])('refuses %j', (value) => {
    expect(() => parseCaptureTarget(value)).toThrow()
  })
})

describe('regions', () => {
  it('measures a region in pixels of the recording', () => {
    expect(regionPixels({ x: 0, y: 0, width: 213.4, height: 160 }, 1.5)).toEqual({
      width: 320,
      height: 240,
    })
    expect(regionPixels({ x: 0, y: 0, width: 100, height: 100 }, Number.NaN)).toEqual({
      width: 100,
      height: 100,
    })
  })

  it('clips to the display and refuses less than 320×240 pixels', () => {
    const display = { width: 1920, height: 1080, scaleFactor: 1 }
    expect(clipRegion({ x: -50.2, y: 100, width: 700.4, height: 500 }, display)).toEqual({
      x: 0,
      y: 100,
      width: 650,
      height: 500,
    })
    expect(clipRegion({ x: 1700, y: 0, width: 400, height: 400 }, display)).toBeNull()
    expect(clipRegion({ x: 0, y: 0, width: 319, height: 400 }, display)).toBeNull()
    // 200% display: 160×120 DIP is 320×240 pixels
    expect(
      clipRegion({ x: 0, y: 0, width: 160, height: 120 }, { ...display, scaleFactor: 2 }),
    ).toEqual({ x: 0, y: 0, width: 160, height: 120 })
    expect(clipRegion({ x: 3000, y: 0, width: 400, height: 400 }, display)).toBeNull()
  })
})

describe('window list', () => {
  it('reads desktopCapturer ids', () => {
    expect(capturerWindowId('window:132456:0')).toBe('132456')
    expect(capturerWindowId('screen:0:0')).toBeNull()
  })

  it('joins the helper list with displays and thumbnails', () => {
    const joined = joinWindows(
      [
        { id: '1', title: 'Notes', app: 'notepad', x: 150, y: 150, width: 1200, height: 900 },
        { id: '2', title: 'Web', app: 'chrome', x: -1000, y: 0, width: 1000, height: 800 },
      ],
      (w) => ({ width: w.width / 1.5, height: w.height / 1.5, displayId: w.x < 0 ? 'b' : 'a' }),
      new Map([['1', 'data:image/jpeg;base64,AA']]),
    )
    expect(joined).toEqual([
      {
        id: '1',
        title: 'Notes',
        app: 'notepad',
        displayId: 'a',
        width: 800,
        height: 600,
        thumbnail: 'data:image/jpeg;base64,AA',
      },
      {
        id: '2',
        title: 'Web',
        app: 'chrome',
        displayId: 'b',
        width: 667,
        height: 533,
        thumbnail: null,
      },
    ])
  })
})
