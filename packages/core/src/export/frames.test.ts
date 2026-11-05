import { describe, expect, it } from 'vitest'
import { colorSpaceCorrection } from './frames.ts'

describe('colorSpaceCorrection', () => {
  const webm = {
    primaries: 'bt709',
    transfer: 'iec61966-2-1',
    matrix: 'bt709',
    fullRange: true,
  } as const

  it("retags MediaRecorder VP8/VP9 frames with the container's full range", () => {
    // What Chromium's VP9 decoder reports for a MediaRecorder screen.webm.
    const decoded = {
      primaries: 'bt709',
      transfer: 'bt709',
      matrix: 'bt709',
      fullRange: false,
    } as const
    expect(colorSpaceCorrection(decoded, webm)).toEqual(webm)
  })

  it('leaves frames alone when they agree with the track (H.264 screen.mp4)', () => {
    expect(colorSpaceCorrection(webm, webm)).toBeNull()
  })

  it('only fills what the track knows', () => {
    expect(
      colorSpaceCorrection(
        { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
        { fullRange: undefined, matrix: null },
      ),
    ).toBeNull()
    expect(colorSpaceCorrection({ matrix: 'bt709', fullRange: null }, { fullRange: true })).toEqual(
      { matrix: 'bt709', fullRange: true },
    )
  })
})
