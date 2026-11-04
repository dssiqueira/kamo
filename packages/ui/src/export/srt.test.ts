import { createProject, Transcript } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { srtFor, srtName } from './useExportRun.ts'

const transcript = Transcript.parse({
  version: 1,
  language: 'pt',
  model: 'whisper-base',
  createdAt: '2026-11-04T10:00:00.000Z',
  segments: [
    { startMs: 500, endMs: 1500, text: 'Cortado fora.' },
    { startMs: 2500, endMs: 4000, text: 'Olá, pessoal!' },
  ],
  edited: true,
})

describe('.srt next to the export (A-06)', () => {
  it('is named like the video, collision number included', () => {
    expect(srtName('Demo 16x9 1080p30 (2).mp4')).toBe('Demo 16x9 1080p30 (2).srt')
  })

  it('is timed to the trim and leaves out what was cut', () => {
    const project = {
      ...createProject({
        name: 'Demo',
        durationMs: 10_000,
        source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
      }),
      trim: { startMs: 2000, endMs: 9000 },
    }
    expect(srtFor(project, transcript, '16:9')).toBe(
      '1\n00:00:00,500 --> 00:00:02,000\nOlá, pessoal!\n',
    )
    expect(srtFor({ ...project, trim: { startMs: 5000, endMs: 9000 } }, transcript, '16:9')).toBe(
      null,
    )
  })
})
