import { describe, expect, it } from 'vitest'
import { quickRecordTarget, type QuickRecordInput } from './quick-record.ts'

const base: QuickRecordInput = {
  settings: {},
  displayIds: ['1', '2'],
  primaryDisplayId: '1',
  windows: null,
}

describe('quickRecordTarget (tray, jump list, Dock)', () => {
  it('records the primary display when nothing was chosen yet', () => {
    expect(quickRecordTarget(base)).toEqual({ kind: 'display', displayId: '1' })
  })

  it('records the last display when it is still connected, else the primary', () => {
    const last = { ...base, settings: { lastCaptureKind: 'display' as const, lastDisplayId: '2' } }
    expect(quickRecordTarget(last)).toEqual({ kind: 'display', displayId: '2' })
    expect(quickRecordTarget({ ...last, displayIds: ['1'] })).toEqual({
      kind: 'display',
      displayId: '1',
    })
  })

  it('records the last selection on its display', () => {
    const rect = { x: 10, y: 20, width: 1280, height: 720 }
    const input = {
      ...base,
      settings: {
        lastCaptureKind: 'region' as const,
        lastDisplayId: '2',
        lastRegion: { displayId: '2', rect },
      },
    }
    expect(quickRecordTarget(input)).toEqual({ kind: 'region', displayId: '2', rect })
    // Its display was unplugged: the whole primary display instead.
    expect(quickRecordTarget({ ...input, displayIds: ['1'] })).toEqual({
      kind: 'display',
      displayId: '1',
    })
  })

  it('records the last window while it is still open, else a display', () => {
    const input = {
      ...base,
      settings: { lastCaptureKind: 'window' as const, lastWindowId: '42', lastDisplayId: '2' },
      windows: [{ id: '42', displayId: '2' }],
    }
    expect(quickRecordTarget(input)).toEqual({ kind: 'window', windowId: '42', displayId: '2' })
    expect(quickRecordTarget({ ...input, windows: [] })).toEqual({
      kind: 'display',
      displayId: '2',
    })
  })

  it('has nothing to record without a display', () => {
    expect(quickRecordTarget({ ...base, displayIds: [] })).toBeNull()
  })
})
