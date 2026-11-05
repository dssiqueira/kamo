import { CAPTION_PRESETS, type TranscriptSegment } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { captionSample, thumbnailCrop, thumbnailFonts } from './caption-gallery.ts'

const segment = (startMs: number, endMs: number, text: string) =>
  ({ startMs, endMs, text }) as TranscriptSegment

const transcript = {
  segments: [
    segment(1000, 3000, 'Olá, pessoal! Hoje vamos ver o Kamo.'),
    segment(5000, 7000, 'Agora clique em exportar'),
  ],
}

describe('captionSample', () => {
  it('takes the start of what is said at the playhead, cut between words', () => {
    expect(captionSample(transcript, 2000, 'x')).toBe('Olá, pessoal!')
    expect(captionSample(transcript, 6000, 'x')).toBe('Agora clique')
  })

  it('uses the next caption between captions and the last one after them', () => {
    expect(captionSample(transcript, 0, 'x')).toBe('Olá, pessoal!')
    expect(captionSample(transcript, 4000, 'x')).toBe('Agora clique')
    expect(captionSample(transcript, 9000, 'x')).toBe('Agora clique')
  })

  it('keeps at least one word, even a long one, and drops a dangling comma', () => {
    expect(captionSample({ segments: [segment(0, 1, 'Extraordinariamente bom')] }, 0, 'x')).toBe(
      'Extraordinariamente',
    )
    expect(captionSample({ segments: [segment(0, 1, 'Sim, claro que sim')] }, 0, 'x', 6)).toBe(
      'Sim',
    )
  })

  it('cuts CJK text between characters (2 units each)', () => {
    const ja = { segments: [segment(0, 1000, '今日はKamoの使い方を説明します')] }
    const sample = captionSample(ja, 500, 'x')
    expect(sample.startsWith('今日は')).toBe(true)
    expect(sample.length).toBeLessThan('今日はKamoの使い方を説明します'.length)
  })

  it('falls back to the sample sentence without speech', () => {
    expect(captionSample(null, 0, 'Your words here')).toBe('Your words here')
    expect(captionSample({ segments: [segment(0, 1, '  ')] }, 0, 'Fallback')).toBe('Fallback')
  })
})

describe('thumbnailCrop', () => {
  it('shows the part of the video where the captions sit, with the thumbnail aspect', () => {
    const bottom = thumbnailCrop({ width: 1920, height: 1080 }, 1.6, 'bottom')
    expect(bottom.width / bottom.height).toBeCloseTo(1.6)
    expect(bottom.x + bottom.width / 2).toBeCloseTo(960)
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(1080)
    expect(bottom.y + bottom.height / 2).toBeGreaterThan(780)
    const middle = thumbnailCrop({ width: 1920, height: 1080 }, 1.6, 'middle')
    expect(middle.y + middle.height / 2).toBeCloseTo(540)
    // A tall video: the crop never leaves it.
    const tall = thumbnailCrop({ width: 400, height: 200 }, 0.5, 'bottom')
    expect(tall.height).toBeLessThanOrEqual(200)
    expect(tall.y).toBeGreaterThanOrEqual(0)
  })
})

describe('thumbnailFonts', () => {
  it('loads each family and weight once', () => {
    const fonts = thumbnailFonts(CAPTION_PRESETS, 'pt')
    expect(fonts).toContain('600 48px "Inter", sans-serif')
    expect(fonts).toContain('400 48px "Instrument Serif", serif')
    expect(fonts).toContain('500 48px "JetBrains Mono", monospace')
    expect(new Set(fonts).size).toBe(fonts.length)
  })
})
