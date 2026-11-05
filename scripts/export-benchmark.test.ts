import { describe, expect, it } from 'vitest'
import { parseExportSmoke } from './export-benchmark-parse.ts'

const result = {
  ok: false,
  checks: [
    { name: '16:9: plays in Chromium', pass: true },
    {
      name: '16:9: speed (1 min of video in < 60 s)',
      pass: true,
      elapsedMs: 9500,
      videoMs: 19000,
      framesPerSecond: 60,
      secondsPerMinuteOfVideo: 30,
      encoder: { codec: 'avc1.640028', hardware: false },
    },
    {
      name: '1:1: speed (1 min of video in < 60 s)',
      pass: false,
      elapsedMs: 21000,
      videoMs: 19000,
      framesPerSecond: 27,
      secondsPerMinuteOfVideo: 66.3,
      encoder: { codec: 'avc1.640028', hardware: true },
    },
  ],
  files: [],
}

describe('parseExportSmoke', () => {
  it('reads the speed checks from the pretty-printed result among other log lines', () => {
    const log = [
      'kamo: starting',
      `kamo: export smoke ${JSON.stringify(result, null, 2)}`,
      'kamo: bye',
    ].join('\r\n')
    expect(parseExportSmoke(log)).toEqual({
      ok: false,
      speeds: [
        {
          aspect: '16:9',
          elapsedMs: 9500,
          videoMs: 19000,
          framesPerSecond: 60,
          secondsPerMinuteOfVideo: 30,
          encoder: 'avc1.640028 (software)',
        },
        {
          aspect: '1:1',
          elapsedMs: 21000,
          videoMs: 19000,
          framesPerSecond: 27,
          secondsPerMinuteOfVideo: 66.3,
          encoder: 'avc1.640028 (hardware)',
        },
      ],
    })
  })

  it('is null without a result or with a truncated one', () => {
    expect(parseExportSmoke('kamo: smoke test ok')).toBeNull()
    expect(parseExportSmoke('kamo: export smoke {\n  "ok": tr')).toBeNull()
  })
})
