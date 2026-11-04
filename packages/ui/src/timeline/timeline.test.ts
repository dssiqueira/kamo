import { describe, expect, it } from 'vitest'
import {
  createTimeScale,
  dragTrim,
  frameMs,
  nudgeMs,
  rulerTicks,
  snapToFrame,
  tickStep,
} from './scale.ts'
import { historyShortcut, isTextEditingTarget, type ShortcutKeys } from './shortcuts.ts'

describe('createTimeScale', () => {
  const scale = createTimeScale(60_000, 600)

  it('maps time to px and back', () => {
    expect(scale.msPerPx).toBe(100)
    expect(scale.toPx(30_000)).toBe(300)
    expect(scale.toMs(300)).toBe(30_000)
    expect(scale.deltaToMs(-25)).toBe(-2500)
  })

  it('clamps positions to the video', () => {
    expect(scale.toMs(-50)).toBe(0)
    expect(scale.toMs(900)).toBe(60_000)
  })

  it('is inert without width or duration', () => {
    const empty = createTimeScale(60_000, 0)
    expect(empty.toPx(1000)).toBe(0)
    expect(empty.toMs(100)).toBe(0)
    expect(createTimeScale(0, 600).toPx(10)).toBe(0)
  })
})

describe('frames', () => {
  it('snaps to the nearest frame', () => {
    expect(frameMs(30)).toBeCloseTo(33.333, 3)
    expect(snapToFrame(50, 30)).toBeCloseTo(66.667, 3)
    expect(snapToFrame(1000, 30)).toBe(1000)
    expect(snapToFrame(-40, 60)).toBeCloseTo(-33.333, 3)
  })

  it('nudges by a frame, or a second with Shift', () => {
    expect(nudgeMs('ArrowRight', false, 30)).toBeCloseTo(33.333, 3)
    expect(nudgeMs('ArrowLeft', true, 30)).toBe(-1000)
    expect(nudgeMs('ArrowUp', false, 30)).toBeNull()
  })
})

describe('ruler ticks', () => {
  it('picks the smallest step whose labels fit', () => {
    expect(tickStep(createTimeScale(60_000, 600))).toEqual({ majorMs: 10_000, minorMs: 2000 })
    expect(tickStep(createTimeScale(10_000, 1000))).toEqual({ majorMs: 1000, minorMs: 250 })
    expect(tickStep(createTimeScale(4 * 3_600_000, 100)).majorMs).toBe(3_600_000)
  })

  it('lists major and minor ticks up to the end', () => {
    const ticks = rulerTicks(createTimeScale(4000, 400))
    expect(ticks[0]).toEqual({ ms: 0, major: true })
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.ms)).toEqual([
      0, 1000, 2000, 3000, 4000,
    ])
    expect(ticks).toHaveLength(17)
    expect(rulerTicks(createTimeScale(4000, 0))).toEqual([])
  })
})

describe('dragTrim', () => {
  const trim = { startMs: 1000, endMs: 9000 }

  it('moves only the dragged edge', () => {
    expect(dragTrim('start', trim, 10_000, 500)).toEqual({
      startMs: 1500,
      endMs: 9000,
      limited: false,
    })
    expect(dragTrim('end', trim, 10_000, -500)).toEqual({
      startMs: 1000,
      endMs: 8500,
      limited: false,
    })
  })

  it('clamps to the video', () => {
    expect(dragTrim('start', trim, 10_000, -5000).startMs).toBe(0)
    expect(dragTrim('end', trim, 10_000, 5000).endMs).toBe(10_000)
  })

  it('keeps at least 1s and reports the limit', () => {
    expect(dragTrim('start', trim, 10_000, 9000)).toEqual({
      startMs: 8000,
      endMs: 9000,
      limited: true,
    })
    expect(dragTrim('end', trim, 10_000, -9000)).toEqual({
      startMs: 1000,
      endMs: 2000,
      limited: true,
    })
  })

  it('keeps the whole video when it is shorter than 1s', () => {
    expect(dragTrim('start', { startMs: 0, endMs: 700 }, 700, 300)).toEqual({
      startMs: 0,
      endMs: 700,
      limited: true,
    })
  })
})

describe('historyShortcut', () => {
  const keys = (overrides: Partial<ShortcutKeys>): ShortcutKeys => ({
    key: 'z',
    code: 'KeyZ',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  })

  it('handles the Mac shortcuts', () => {
    expect(historyShortcut(keys({ metaKey: true }))).toBe('undo')
    expect(historyShortcut(keys({ metaKey: true, shiftKey: true, key: 'Z' }))).toBe('redo')
  })

  it('handles the Windows and Linux shortcuts', () => {
    expect(historyShortcut(keys({ ctrlKey: true }))).toBe('undo')
    expect(historyShortcut(keys({ ctrlKey: true, key: 'y', code: 'KeyY' }))).toBe('redo')
    expect(historyShortcut(keys({ ctrlKey: true, shiftKey: true, key: 'Z' }))).toBe('redo')
  })

  it('falls back to the physical key on non-Latin layouts', () => {
    expect(historyShortcut(keys({ ctrlKey: true, key: 'я', code: 'KeyZ' }))).toBe('undo')
  })

  it('ignores everything else', () => {
    expect(historyShortcut(keys({}))).toBeNull()
    expect(historyShortcut(keys({ ctrlKey: true, altKey: true }))).toBeNull()
    expect(historyShortcut(keys({ ctrlKey: true, key: 'x', code: 'KeyX' }))).toBeNull()
    expect(historyShortcut(keys({ metaKey: true, key: 'y', code: 'KeyY' }))).toBeNull()
  })
})

describe('isTextEditingTarget', () => {
  it('lets text fields keep their native undo', () => {
    expect(isTextEditingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTextEditingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEditingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('does not treat sliders, buttons or the timeline as text', () => {
    expect(isTextEditingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(isTextEditingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEditingTarget(null)).toBe(false)
  })
})
