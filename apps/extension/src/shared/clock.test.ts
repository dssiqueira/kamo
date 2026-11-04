import { describe, expect, it } from 'vitest'
import { RecordingTimer, frameFileName, nextFrameAt } from './clock.ts'

describe('RecordingTimer', () => {
  it('counts recorded time and leaves pauses out', () => {
    let now = 1000
    const timer = new RecordingTimer(30, () => now)
    timer.start()
    now = 4000
    timer.pause()
    now = 10_000
    expect(timer.elapsedMs()).toBe(3000)
    expect(timer.snapshot()).toEqual({ state: 'paused', elapsedMs: 3000, at: 10_000, fps: 30 })
    timer.resume()
    now = 12_500
    expect(timer.elapsedMs()).toBe(5500)
    expect(timer.snapshot().state).toBe('recording')
  })

  it('ignores a repeated pause or resume', () => {
    let now = 0
    const timer = new RecordingTimer(30, () => now)
    timer.start()
    now = 1000
    timer.pause()
    timer.pause()
    timer.resume()
    now = 2000
    timer.resume()
    expect(timer.elapsedMs()).toBe(2000)
  })
})

describe('reference frames', () => {
  it('names thumbnails by video second, like the desktop', () => {
    expect(frameFileName(0)).toBe('0000.jpg')
    expect(frameFileName(5020)).toBe('0005.jpg')
    expect(frameFileName(125_000)).toBe('0125.jpg')
  })

  it('schedules one every 5s of recorded time', () => {
    expect(nextFrameAt(0)).toBe(5000)
    expect(nextFrameAt(5040)).toBe(10_000)
    expect(nextFrameAt(9999)).toBe(10_000)
  })
})
