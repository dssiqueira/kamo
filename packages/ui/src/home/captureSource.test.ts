import { describe, expect, it } from 'vitest'
import {
  filterWindows,
  pickWindow,
  recordTarget,
  shortTitle,
  type WindowOption,
} from './captureSource.ts'
import type { DisplayOption } from './pickDisplay.ts'

const window = (id: string, title: string, app = ''): WindowOption => ({
  id,
  title,
  app,
  thumbnail: null,
})

const windows = [
  window('1', 'Report.docx - Word', 'WINWORD'),
  window('2', 'Café menu - Google Chrome', 'chrome'),
  window('3', 'Untitled - Notepad', 'notepad'),
]

const displays: DisplayOption[] = [
  { id: 'a', label: '', width: 1920, height: 1080, primary: true, thumbnail: null },
  { id: 'b', label: 'DELL U2720Q', width: 3840, height: 2160, primary: false, thumbnail: null },
]

const base = {
  displays,
  selectedDisplayId: 'b',
  displayName: (d: DisplayOption, i: number) => d.label || `Display ${i + 1}`,
  windows,
  selectedWindowId: '3',
  region: { displayId: 'b', width: 1280, height: 720 },
}

describe('filterWindows', () => {
  it('matches every word in the title or the app, ignoring case and accents', () => {
    expect(filterWindows(windows, '').map((w) => w.id)).toEqual(['1', '2', '3'])
    expect(filterWindows(windows, 'cafe').map((w) => w.id)).toEqual(['2'])
    expect(filterWindows(windows, 'NOTEPAD untitled').map((w) => w.id)).toEqual(['3'])
    expect(filterWindows(windows, 'word chrome')).toEqual([])
  })
})

describe('pickWindow', () => {
  it('keeps the current window while it is open, then the remembered one, then the first', () => {
    expect(pickWindow(windows, '2')).toBe('2')
    expect(pickWindow(windows, 'gone', '3')).toBe('3')
    expect(pickWindow(windows, 'gone', 'also-gone')).toBe('1')
    expect(pickWindow([], '2')).toBeNull()
  })
})

describe('recordTarget', () => {
  it('names what the Record button records', () => {
    expect(recordTarget({ ...base, kind: 'display' })).toEqual({
      kind: 'display',
      name: 'DELL U2720Q',
    })
    expect(recordTarget({ ...base, kind: 'window' })).toEqual({
      kind: 'window',
      title: 'Untitled - Notepad',
    })
    expect(recordTarget({ ...base, kind: 'region' })).toEqual({
      kind: 'region',
      width: 1280,
      height: 720,
    })
  })

  it('is null until something is chosen', () => {
    expect(recordTarget({ ...base, kind: 'window', selectedWindowId: null })).toBeNull()
    expect(recordTarget({ ...base, kind: 'window', windows: null })).toBeNull()
    // a region dragged on another display does not count for this one
    expect(recordTarget({ ...base, kind: 'region', selectedDisplayId: 'a' })).toBeNull()
    expect(recordTarget({ ...base, kind: 'region', region: null })).toBeNull()
    expect(recordTarget({ ...base, kind: 'display', selectedDisplayId: null })).toBeNull()
  })
})

describe('shortTitle', () => {
  it('cuts long titles with an ellipsis', () => {
    expect(shortTitle('Short')).toBe('Short')
    expect(shortTitle('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
