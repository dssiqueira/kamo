import { describe, expect, it } from 'vitest'
import {
  backgroundImageFile,
  backgroundImageName,
  isBackgroundImageFile,
  sniffImageType,
} from './background-image.ts'
import { DEFAULT_STYLE, Style } from './schema.ts'

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  )

describe('sniffImageType', () => {
  it('recognizes PNG, JPEG and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('jpg')
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('webp')
  })

  it('refuses anything else, whatever the name says', () => {
    expect(sniffImageType(bytes('GIF89a'))).toBeNull()
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull()
    expect(sniffImageType(bytes('<svg'))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull()
  })
})

describe('background image names', () => {
  it('builds a plain hashed name per type', () => {
    expect(backgroundImageName('webp', 'ABCDEF0123456789ffff')).toBe(
      'background-abcdef0123456789.webp',
    )
    expect(() => backgroundImageName('png', 'xyz')).toThrow()
  })

  it('accepts only its own names, never a path', () => {
    expect(isBackgroundImageFile('background-0123abcd.jpg')).toBe(true)
    for (const name of [
      'background.png',
      'background-0123abcd.jpeg',
      'background-0123abcd.gif',
      '../background-0123abcd.png',
      'frames/background-0123abcd.png',
      'background-0123ABCD.png',
      'screen.mp4',
      42,
    ]) {
      expect(isBackgroundImageFile(name)).toBe(false)
    }
  })

  it('reads the file of an image background only', () => {
    expect(backgroundImageFile({ kind: 'image', value: 'background-0123abcd.png' })).toBe(
      'background-0123abcd.png',
    )
    expect(backgroundImageFile({ kind: 'image', value: '../../secret.png' })).toBeNull()
    expect(backgroundImageFile(DEFAULT_STYLE.background)).toBeNull()
  })

  it('keeps older projects valid: an image style is still a plain kind + value', () => {
    expect(
      Style.safeParse({ ...DEFAULT_STYLE, background: { kind: 'image', value: 'wall.png' } })
        .success,
    ).toBe(true)
    expect(Style.safeParse(DEFAULT_STYLE).success).toBe(true)
  })
})
