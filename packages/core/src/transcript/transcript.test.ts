import { describe, expect, it } from 'vitest'
import type { PcmChunk } from '../export/audio-mix.ts'
import {
  SPEECH_SAMPLE_RATE,
  isSpeech,
  parseTranscript,
  serializeTranscript,
  speechFrameCount,
  streamSpeechPcm,
  transcriptFromWhisper,
  wavHeader,
} from './index.ts'

const CREATED = '2026-11-04T12:00:00.000Z'

function token(text: string, from: number, to: number) {
  return { text, offsets: { from, to }, id: 1, p: 0.9 }
}

/** The shape whisper.cpp writes with `-oj -ojf` (trimmed). */
const whisperJson = {
  systeminfo: 'AVX = 1',
  params: { model: 'models/ggml-base.bin', language: 'auto', translate: false },
  result: { language: 'pt' },
  transcription: [
    {
      timestamps: { from: '00:00:01,000', to: '00:00:03,000' },
      offsets: { from: 1000, to: 3000 },
      text: ' Olá,  mundo.',
      tokens: [
        token('[_BEG_]', 1000, 1000),
        token(' Ol', 1000, 1400),
        token('á', 1400, 1600),
        token(',', 1600, 1700),
        token(' mundo', 1700, 2600),
        token('.', 2600, 3000),
        token('[_TT_150]', 3000, 3000),
      ],
    },
    {
      timestamps: { from: '00:00:03,000', to: '00:00:05,000' },
      offsets: { from: 3000, to: 5000 },
      text: ' [BLANK_AUDIO]',
    },
    {
      offsets: { from: 5000, to: 6000 },
      text: ' (música)',
    },
    {
      offsets: { from: 9000, to: 12000 },
      text: ' Fim',
    },
    {
      offsets: { from: 12500, to: 14000 },
      text: ' depois do fim',
    },
  ],
}

describe('transcriptFromWhisper', () => {
  const transcript = transcriptFromWhisper(whisperJson, {
    model: 'whisper-base',
    createdAt: CREATED,
    durationMs: 11_000,
  })

  it('keeps speech, in video time, clamped to the video', () => {
    expect(transcript.language).toBe('pt')
    expect(transcript.model).toBe('whisper-base')
    expect(transcript.edited).toBe(false)
    expect(transcript.segments.map((s) => [s.startMs, s.endMs, s.text])).toEqual([
      [1000, 3000, 'Olá, mundo.'],
      [9000, 11_000, 'Fim'],
    ])
  })

  it('joins tokens into words with punctuation attached', () => {
    expect(transcript.segments[0]?.words).toEqual([
      { startMs: 1000, endMs: 1700, text: 'Olá,' },
      { startMs: 1700, endMs: 3000, text: 'mundo.' },
    ])
    expect(transcript.segments[1]?.words).toBeUndefined()
  })

  it('keeps words inside a segment cut at the end of the video', () => {
    const cut = transcriptFromWhisper(
      {
        result: { language: 'en' },
        transcription: [
          {
            offsets: { from: 900, to: 2000 },
            text: ' one two three',
            tokens: [
              token(' one', 900, 1000),
              token(' two', 1000, 1500),
              token(' three', 1500, 2000),
            ],
          },
        ],
      },
      { model: 'whisper-base', createdAt: CREATED, durationMs: 1200 },
    )
    expect(cut.segments[0]?.words).toEqual([
      { startMs: 900, endMs: 1000, text: 'one' },
      { startMs: 1000, endMs: 1200, text: 'two' },
    ])
  })

  it('round-trips through transcript.json', () => {
    const text = serializeTranscript(transcript)
    expect(parseTranscript(text)).toEqual(transcript)
    expect(parseTranscript('{')).toBeNull()
    expect(parseTranscript('{"segments": []}')).toBeNull()
  })

  it('uses one word per token in languages without spaces, and drops broken tokens', () => {
    const ja = transcriptFromWhisper(
      {
        result: { language: 'ja' },
        transcription: [
          {
            offsets: { from: 0, to: 1000 },
            text: 'こんにちは。',
            tokens: [token('こん', 0, 400), token('にちは', 400, 900), token('。', 900, 1000)],
          },
          {
            offsets: { from: 1000, to: 2000 },
            text: '世界',
            tokens: [token('�', 1000, 1500), token('界', 1500, 2000)],
          },
        ],
      },
      { model: 'whisper-small', createdAt: CREATED, durationMs: 5000 },
    )
    expect(ja.segments[0]?.words?.map((w) => w.text)).toEqual(['こん', 'にちは。'])
    expect(ja.segments[1]?.text).toBe('世界')
    expect(ja.segments[1]?.words).toBeUndefined()
  })

  it('falls back when whisper names no language, and rejects other JSON', () => {
    const t = transcriptFromWhisper(
      { params: { language: 'auto' }, transcription: [] },
      { model: 'whisper-base', createdAt: CREATED, durationMs: 1000, fallbackLanguage: 'en' },
    )
    expect(t.language).toBe('en')
    expect(t.segments).toEqual([])
    expect(() =>
      transcriptFromWhisper({ nope: true }, { model: 'm', createdAt: CREATED, durationMs: 1 }),
    ).toThrow()
  })
})

describe('isSpeech', () => {
  it.each(['[BLANK_AUDIO]', '(music)', '♪ ♪', '[Música] (risos)', '...', ''])(
    'rejects %j',
    (text) => expect(isSpeech(text)).toBe(false),
  )
  it.each(['Hello', '42', 'Olá (risos)', '你好'])('keeps %j', (text) =>
    expect(isSpeech(text)).toBe(true),
  )
})

/** A constant tone chunk: `value` on every sample, at `rate`. */
function constant(rate: number, timestamp: number, frames: number, value: number): PcmChunk {
  return { timestamp, sampleRate: rate, channels: [new Float32Array(frames).fill(value)] }
}

function feeder(chunks: PcmChunk[]) {
  let i = 0
  return async () => chunks[i++] ?? null
}

async function collect(chunks: PcmChunk[], offsetMs: number, durationMs: number) {
  const blocks: Int16Array[] = []
  const progress: number[] = []
  const frames = await streamSpeechPcm(feeder(chunks), {
    offsetMs,
    durationMs,
    blockFrames: 4000,
    onBlock(samples, done) {
      blocks.push(samples)
      progress.push(done)
    },
  })
  const all = new Int16Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const block of blocks) {
    all.set(block, at)
    at += block.length
  }
  return { frames, all, progress }
}

describe('streamSpeechPcm', () => {
  it('outputs exactly the video length at 16kHz mono, with steady progress', async () => {
    const { frames, all, progress } = await collect([constant(48_000, 0, 48_000, 0.5)], 0, 1000)
    expect(frames).toBe(SPEECH_SAMPLE_RATE)
    expect(all.length).toBe(SPEECH_SAMPLE_RATE)
    expect(all[100]).toBe(Math.round(0.5 * 0x7fff))
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })

  it('adds silence when the audio started after the video', async () => {
    // Audio starts 500ms into the video: the first 8000 output frames are silent.
    const { all } = await collect([constant(48_000, 0, 48_000, -0.25)], 500, 1000)
    expect(all[7990]).toBe(0)
    expect(all[8010]).toBe(Math.round(-0.25 * 0x8000))
  })

  it('skips the audio recorded before the first video frame', async () => {
    // 250ms of silence then a tone; the audio started 250ms before the video.
    const chunks = [constant(48_000, 0, 12_000, 0), constant(48_000, 0.25, 36_000, 0.5)]
    const { all } = await collect(chunks, -250, 500)
    expect(all[10]).toBe(Math.round(0.5 * 0x7fff))
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      streamSpeechPcm(feeder([constant(16_000, 0, 16_000, 0.1)]), {
        offsetMs: 0,
        durationMs: 1000,
        signal: controller.signal,
        onBlock() {},
      }),
    ).rejects.toThrow()
  })

  it('counts frames from the duration', () => {
    expect(speechFrameCount(2500)).toBe(40_000)
    expect(speechFrameCount(-1)).toBe(0)
  })
})

describe('wavHeader', () => {
  it('describes 16kHz mono 16-bit PCM', () => {
    const header = wavHeader(32_000)
    const view = new DataView(header.buffer)
    const text = (at: number) => String.fromCharCode(...header.slice(at, at + 4))
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(view.getUint32(4, true)).toBe(36 + 32_000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(28, true)).toBe(32_000)
    expect(view.getUint32(40, true)).toBe(32_000)
  })
})
