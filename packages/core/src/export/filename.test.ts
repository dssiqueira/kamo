import { describe, expect, it } from 'vitest'
import {
  aspectFileLabel,
  exportFileName,
  MAX_FILE_BASE_LENGTH,
  numberedFileName,
  sanitizeFileName,
} from './filename.ts'

describe('exportFileName', () => {
  it('follows `<project name> <format> <resolution><fps>.mp4` (F-11)', () => {
    expect(
      exportFileName({ projectName: 'Demo', aspect: '16:9', resolution: '1080p', fps: 30 }),
    ).toBe('Demo 16x9 1080p30.mp4')
    expect(
      exportFileName({ projectName: 'Demo', aspect: '1:1', resolution: '1080p', fps: 30 }),
    ).toBe('Demo 1x1 1080p30.mp4')
    expect(exportFileName({ projectName: 'Demo', aspect: '9:16', resolution: '4k', fps: 60 })).toBe(
      'Demo 9x16 4k60.mp4',
    )
  })

  it('uses x instead of the colon, which Windows does not allow', () => {
    expect(aspectFileLabel('16:9')).toBe('16x9')
  })

  it('keeps accents and non-Latin names', () => {
    expect(
      exportFileName({
        projectName: 'Gravação 4 de nov',
        aspect: '16:9',
        resolution: '1080p',
        fps: 30,
      }),
    ).toBe('Gravação 4 de nov 16x9 1080p30.mp4')
    expect(sanitizeFileName('録画 デモ')).toBe('録画 デモ')
  })
})

describe('sanitizeFileName', () => {
  it('replaces characters invalid on Windows or macOS', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a b c d e f g h i j')
  })

  it('drops control characters and collapses spaces', () => {
    expect(sanitizeFileName('a\u0000b\tc\n  d')).toBe('a b c d')
  })

  it('removes trailing dots and spaces and leading dots', () => {
    expect(sanitizeFileName('..hidden. . ')).toBe('hidden')
  })

  it('never returns an empty name', () => {
    expect(sanitizeFileName('???')).toBe('Kamo')
    expect(sanitizeFileName('   ')).toBe('Kamo')
    expect(sanitizeFileName('', 'Recording')).toBe('Recording')
  })

  it('escapes Windows reserved device names', () => {
    expect(sanitizeFileName('CON')).toBe('CON_')
    expect(sanitizeFileName('nul')).toBe('nul_')
    expect(sanitizeFileName('com1')).toBe('com1_')
    expect(sanitizeFileName('Console')).toBe('Console')
  })

  it('caps very long names without splitting a character', () => {
    const clean = sanitizeFileName('😀'.repeat(200))
    expect(Array.from(clean)).toHaveLength(MAX_FILE_BASE_LENGTH)
    expect(clean.endsWith('😀')).toBe(true)
  })
})

describe('numberedFileName', () => {
  it('appends " (n)" before the extension (F-11)', () => {
    expect(numberedFileName('Demo 16x9 1080p30.mp4', 1)).toBe('Demo 16x9 1080p30.mp4')
    expect(numberedFileName('Demo 16x9 1080p30.mp4', 2)).toBe('Demo 16x9 1080p30 (2).mp4')
    expect(numberedFileName('Demo 16x9 1080p30.mp4', 12)).toBe('Demo 16x9 1080p30 (12).mp4')
    expect(numberedFileName('noext', 3)).toBe('noext (3)')
  })
})
