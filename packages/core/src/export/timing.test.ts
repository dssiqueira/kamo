import { describe, expect, it } from 'vitest'
import {
  createFramePicker,
  exportFrameCount,
  exportFrameTimeMs,
  exportFrameTimestamp,
  type TimedFrame,
} from './timing.ts'

describe('export frame timing', () => {
  it('covers the trimmed duration with whole frames', () => {
    expect(exportFrameCount({ startMs: 0, endMs: 1000 }, 30)).toBe(30)
    expect(exportFrameCount({ startMs: 0, endMs: 60_000 }, 30)).toBe(1800)
    expect(exportFrameCount({ startMs: 500, endMs: 1500 }, 30)).toBe(30)
    // 19.01s → 571 frames (the last one starts at 19.0s, inside the trim)
    expect(exportFrameCount({ startMs: 0, endMs: 19_010 }, 30)).toBe(571)
    expect(exportFrameCount({ startMs: 0, endMs: 1001 }, 60)).toBe(61)
  })

  it('never exports zero frames', () => {
    expect(exportFrameCount({ startMs: 100, endMs: 100 }, 30)).toBe(1)
  })

  it('maps output frames to raw video time from the trim start', () => {
    const trim = { startMs: 2000, endMs: 5000 }
    expect(exportFrameTimeMs(trim, 0, 30)).toBe(2000)
    expect(exportFrameTimeMs(trim, 30, 30)).toBe(3000)
    expect(exportFrameTimeMs(trim, 1, 30)).toBeCloseTo(2033.333, 3)
  })

  it('stamps the file from zero', () => {
    expect(exportFrameTimestamp(0, 30)).toBe(0)
    expect(exportFrameTimestamp(45, 30)).toBe(1.5)
  })
})

class Frame implements TimedFrame {
  closed = false
  constructor(readonly timestamp: number) {}
  close() {
    this.closed = true
  }
}

async function* source(frames: Frame[]) {
  for (const frame of frames) yield frame
}

const pickerOf = (frames: Frame[]) => createFramePicker(source(frames)[Symbol.asyncIterator]())

describe('createFramePicker', () => {
  it('picks the frame on screen at each time, like a seeked <video>', async () => {
    const frames = [0, 1 / 30, 2 / 30, 3 / 30].map((t) => new Frame(t))
    const picker = pickerOf(frames)
    expect(await picker.at(0)).toBe(frames[0])
    expect(await picker.at(0.02)).toBe(frames[0])
    expect(await picker.at(1 / 30)).toBe(frames[1])
    expect(await picker.at(2.5 / 30)).toBe(frames[2])
    expect(frames[0]?.closed).toBe(true)
    expect(frames[1]?.closed).toBe(true)
    expect(frames[2]?.closed).toBe(false)
  })

  it('tolerates container timestamps a hair late', async () => {
    const frames = [new Frame(0), new Frame(0.0334)]
    expect(await pickerOf(frames).at(1 / 30)).toBe(frames[1])
  })

  it('repeats a frame when the output is faster than the source', async () => {
    const picker = pickerOf([new Frame(0), new Frame(0.1)])
    const a = await picker.at(0)
    const b = await picker.at(1 / 30)
    expect(a).toBe(b)
    expect(a?.closed).toBe(false)
  })

  it('holds the first frame before it and the last one after the end', async () => {
    const frames = [new Frame(0.5), new Frame(0.6)]
    const picker = pickerOf(frames)
    expect(await picker.at(0.1)).toBe(frames[0])
    expect(await picker.at(5)).toBe(frames[1])
    expect(await picker.at(6)).toBe(frames[1])
  })

  it('returns null when there are no frames and releases what it holds', async () => {
    expect(await pickerOf([]).at(0)).toBeNull()
    const frames = [new Frame(0), new Frame(1)]
    const picker = pickerOf(frames)
    await picker.at(0)
    picker.release()
    expect(frames.every((f) => f.closed)).toBe(true)
  })
})
