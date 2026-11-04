// The app writes transcript.json with core (A-05); the MCP reads it with its own lenient schema.
// This keeps the two in step: what local transcription writes is what agents can read.
import { serializeTranscript, transcriptFromWhisper } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { Transcript } from '../src/library.ts'

describe('transcript.json written by the app', () => {
  it('parses in the MCP, words included', () => {
    const written = serializeTranscript(
      transcriptFromWhisper(
        {
          result: { language: 'pt' },
          transcription: [
            {
              offsets: { from: 0, to: 1500 },
              text: ' Olá mundo',
              tokens: [
                { text: ' Olá', offsets: { from: 0, to: 700 } },
                { text: ' mundo', offsets: { from: 700, to: 1500 } },
              ],
            },
          ],
        },
        { model: 'whisper-base', createdAt: '2026-11-04T10:00:00.000Z', durationMs: 5000 },
      ),
    )
    const read = Transcript.parse(JSON.parse(written))
    expect(read.language).toBe('pt')
    expect(read.model).toBe('whisper-base')
    expect(read.edited).toBe(false)
    expect(read.segments).toEqual([{ startMs: 0, endMs: 1500, text: 'Olá mundo' }])
  })
})
