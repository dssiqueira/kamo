import { describe, expect, it } from 'vitest'
import { Transcript, type TranscriptSegment } from '../transcript/transcript.ts'
import {
  captionCues,
  captionTokens,
  MIN_CUE_MS,
  srtTimestamp,
  toSrt,
  wrapCaption,
  type CueOptions,
} from './cues.ts'
import {
  deleteCaption,
  MIN_CAPTION_MS,
  moveCaption,
  resizeCaption,
  setCaptionText,
} from './edit.ts'

const WIDE: CueOptions = { maxUnits: 42, maxLines: 2 }

function transcript(segments: TranscriptSegment[], language = 'pt'): Transcript {
  return Transcript.parse({
    version: 1,
    language,
    model: 'whisper-base',
    createdAt: '2026-11-04T10:00:00.000Z',
    segments,
    edited: false,
  })
}

/** Words with timing from a sentence: each word 300ms, from `startMs`. */
function timedWords(text: string, startMs: number, stepMs = 300) {
  return text.split(' ').map((word, i) => ({
    startMs: startMs + i * stepMs,
    endMs: startMs + (i + 1) * stepMs - 20,
    text: word,
  }))
}

describe('captionTokens / wrapCaption', () => {
  it('breaks Latin text between words, balancing two lines', () => {
    const lines = wrapCaption('Agora eu vou clicar em configurações para mostrar o painel novo', 42)
    expect(lines).toHaveLength(2)
    expect(lines.join(' ')).toBe('Agora eu vou clicar em configurações para mostrar o painel novo')
    // Balanced: neither line is a stub.
    const [a, b] = lines.map((l) => l.length) as [number, number]
    expect(Math.abs(a - b)).toBeLessThan(12)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(42)
  })

  it('keeps a short text on one line', () => {
    expect(wrapCaption('Olá, pessoal!', 42)).toEqual(['Olá, pessoal!'])
  })

  it('breaks Chinese and Japanese between characters, counting them twice as wide', () => {
    const zh = '今天我们来看一下新的录屏功能，它会自动放大每一次点击'
    const lines = wrapCaption(zh, 30)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe(zh)
    for (const line of lines) expect(Array.from(line).length * 2).toBeLessThanOrEqual(30)
  })

  it('never starts a line with closing punctuation or ends one with opening punctuation', () => {
    const ja = '「設定」を開いて、新しいパネルを見てみましょう。とても簡単です。'
    for (const units of [8, 10, 12, 14, 16, 20]) {
      const lines = wrapCaption(ja, units)
      expect(lines.join('')).toBe(ja)
      for (const line of lines) {
        expect(line).not.toMatch(/^[、。」』）ー]/u)
        expect(line).not.toMatch(/[「『（]$/u)
      }
    }
  })

  it('keeps Latin words whole inside CJK text', () => {
    const tokens = captionTokens('打开Kamo录屏')
    expect(tokens.map((t) => t.text)).toEqual(['打', '开', 'Kamo', '录', '屏'])
    expect(tokens[0]?.units).toBe(2)
    expect(tokens[2]?.units).toBe(4)
  })

  it('keeps Korean words whole (Hangul has spaces)', () => {
    expect(captionTokens('설정을 열어 보세요').map((t) => t.text)).toEqual([
      '설정을',
      '열어',
      '보세요',
    ])
  })
})

describe('captionCues', () => {
  it('returns nothing for an empty transcript', () => {
    expect(captionCues(transcript([]), WIDE)).toEqual([])
  })

  it('makes one cue per short segment, in video time', () => {
    const cues = captionCues(
      transcript([
        { startMs: 500, endMs: 2000, text: 'Olá, pessoal!' },
        { startMs: 2400, endMs: 4000, text: 'Hoje vamos ver o Kamo.' },
      ]),
      WIDE,
    )
    expect(cues).toEqual([
      { startMs: 500, endMs: 2000, lines: ['Olá, pessoal!'], segment: 0 },
      { startMs: 2400, endMs: 4000, lines: ['Hoje vamos ver o Kamo.'], segment: 1 },
    ])
  })

  it('splits a long segment into cues that start when their first word is spoken', () => {
    const text =
      'Primeiro abrimos as configurações do projeto, depois escolhemos o formato vertical e por fim exportamos o vídeo com as legendas gravadas'
    const words = timedWords(text, 1000)
    const end = words[words.length - 1]!.endMs
    const cues = captionCues(transcript([{ startMs: 1000, endMs: end, text, words }]), {
      maxUnits: 30,
      maxLines: 2,
    })
    expect(cues.length).toBeGreaterThan(1)
    // Same text, in order, nothing lost.
    expect(cues.map((c) => c.lines.join(' ')).join(' ')).toBe(text)
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2)
      for (const line of cue.lines) expect(line.length).toBeLessThanOrEqual(30)
    }
    // Back to back, covering the segment, each starting on its first word.
    expect(cues[0]?.startMs).toBe(1000)
    expect(cues[cues.length - 1]?.endMs).toBe(end)
    for (let i = 1; i < cues.length; i++) {
      const cue = cues[i]!
      expect(cue.startMs).toBe(cues[i - 1]!.endMs)
      const firstWord = cue.lines[0]!.split(' ')[0]!
      expect(words.some((w) => w.text === firstWord && w.startMs === cue.startMs)).toBe(true)
    }
  })

  it('shares the time out by width when there are no word timings', () => {
    const text = 'um dois três quatro cinco seis sete oito nove dez onze doze treze catorze'
    const cues = captionCues(transcript([{ startMs: 0, endMs: 8000, text }]), {
      maxUnits: 20,
      maxLines: 1,
    })
    expect(cues.length).toBeGreaterThan(2)
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.startMs).toBe(cues[i - 1]!.endMs)
    expect(cues[cues.length - 1]?.endMs).toBe(8000)
  })

  it('splits CJK segments without spaces', () => {
    const zh = '今天我们来看一下新的录屏功能，它会自动放大每一次点击，然后导出一个已经剪辑好的视频'
    const cues = captionCues(transcript([{ startMs: 0, endMs: 6000, text: zh }], 'zh'), {
      maxUnits: 24,
      maxLines: 2,
    })
    expect(cues.length).toBeGreaterThan(1)
    expect(cues.flatMap((c) => c.lines).join('')).toBe(zh)
  })

  it('clips to the trim and drops what falls outside', () => {
    const cues = captionCues(
      transcript([
        { startMs: 0, endMs: 1000, text: 'antes' },
        { startMs: 1500, endMs: 3500, text: 'no meio' },
        { startMs: 5000, endMs: 6000, text: 'depois' },
        { startMs: 4000 - MIN_CUE_MS / 2, endMs: 4500, text: 'quase fora' },
      ]),
      { ...WIDE, trim: { startMs: 2000, endMs: 4000 } },
    )
    expect(cues).toEqual([{ startMs: 2000, endMs: 3500, lines: ['no meio'], segment: 1 }])
  })

  it('never lets cues overlap', () => {
    const cues = captionCues(
      transcript([
        { startMs: 0, endMs: 2500, text: 'primeira frase' },
        { startMs: 2000, endMs: 4000, text: 'segunda frase' },
      ]),
      WIDE,
    )
    expect(cues[0]?.endMs).toBe(2000)
  })
})

describe('toSrt', () => {
  it('formats SubRip timestamps', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000')
    expect(srtTimestamp(3_723_456)).toBe('01:02:03,456')
    expect(srtTimestamp(-5)).toBe('00:00:00,000')
  })

  it('numbers the cues and measures times from the trim start', () => {
    const cues = captionCues(
      transcript([
        { startMs: 2500, endMs: 4000, text: 'Olá, pessoal!' },
        {
          startMs: 4500,
          endMs: 7250,
          text: 'Hoje vamos ver como o Kamo faz zoom em cada clique',
        },
      ]),
      { maxUnits: 30, maxLines: 2, trim: { startMs: 2000, endMs: 10000 } },
    )
    expect(toSrt(cues, 2000)).toBe(
      [
        '1',
        '00:00:00,500 --> 00:00:02,000',
        'Olá, pessoal!',
        '',
        '2',
        '00:00:02,500 --> 00:00:05,250',
        'Hoje vamos ver como o Kamo',
        'faz zoom em cada clique',
        '',
      ].join('\n'),
    )
  })

  it('is empty without cues', () => {
    expect(toSrt([])).toBe('')
  })
})

describe('caption edits (they correct transcript.json)', () => {
  const base = () =>
    transcript([
      { startMs: 1000, endMs: 2000, text: 'Ola pesoal', words: timedWords('Ola pesoal', 1000) },
      { startMs: 3000, endMs: 4000, text: 'segunda' },
      { startMs: 5000, endMs: 6000, text: 'terceira' },
    ])

  it('fixes the text, marks the transcript edited and drops the stale word timings', () => {
    const next = setCaptionText(base(), 0, '  Olá,   pessoal! ')
    expect(next.edited).toBe(true)
    expect(next.segments[0]).toEqual({ startMs: 1000, endMs: 2000, text: 'Olá, pessoal!' })
    expect(Transcript.safeParse(next).success).toBe(true)
  })

  it('returns the same transcript when nothing changes', () => {
    const t = base()
    expect(setCaptionText(t, 1, 'segunda')).toBe(t)
    expect(setCaptionText(t, 9, 'x')).toBe(t)
    expect(moveCaption(t, 1, 0, 10_000)).toBe(t)
  })

  it('deletes a caption whose text is cleared', () => {
    const next = setCaptionText(base(), 1, '   ')
    expect(next.segments.map((s) => s.text)).toEqual(['Ola pesoal', 'terceira'])
    expect(deleteCaption(base(), 2).segments).toHaveLength(2)
  })

  it('moves between the neighbours, words included', () => {
    const t = base()
    expect(moveCaption(t, 1, 5000, 10_000).segments[1]).toMatchObject({
      startMs: 4000,
      endMs: 5000,
    })
    expect(moveCaption(t, 1, -5000, 10_000).segments[1]).toMatchObject({
      startMs: 2000,
      endMs: 3000,
    })
    const moved = moveCaption(t, 0, -400, 10_000).segments[0]!
    expect(moved.startMs).toBe(600)
    expect(moved.words?.[0]?.startMs).toBe(600)
  })

  it('resizes an edge, keeps the minimum length and stays between the neighbours', () => {
    const t = base()
    expect(resizeCaption(t, 1, 'end', 5000, 10_000).segments[1]?.endMs).toBe(5000)
    expect(resizeCaption(t, 1, 'start', -5000, 10_000).segments[1]?.startMs).toBe(2000)
    expect(resizeCaption(t, 1, 'end', -5000, 10_000).segments[1]?.endMs).toBe(3000 + MIN_CAPTION_MS)
    const last = resizeCaption(t, 2, 'end', 99_000, 8000)
    expect(last.segments[2]?.endMs).toBe(8000)
    // Word timings stretch with the segment and stay inside it.
    const stretched = resizeCaption(t, 0, 'end', 1000, 10_000).segments[0]!
    expect(stretched.endMs).toBe(3000)
    for (const word of stretched.words ?? []) {
      expect(word.startMs).toBeGreaterThanOrEqual(1000)
      expect(word.endMs).toBeLessThanOrEqual(3000)
    }
    expect(Transcript.safeParse(resizeCaption(t, 0, 'end', 1000, 10_000)).success).toBe(true)
  })
})
