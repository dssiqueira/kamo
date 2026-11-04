import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { checkRecordedMedia, isMp4MimeType } from './recorded-media.ts'
import {
  fragmentedAudioMp4,
  fragmentedVideoMp4,
  headerOnly,
  mp4Boxes,
  opusWebm,
} from './testing/media-fixtures.ts'

let video: Uint8Array
let audio: Uint8Array
let webm: Uint8Array
let dir: string

beforeAll(async () => {
  video = await fragmentedVideoMp4(3)
  audio = await fragmentedAudioMp4(2)
  webm = await opusWebm(2)
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-media-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function file(name: string, bytes: Uint8Array): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, bytes)
  return path
}

describe('isMp4MimeType', () => {
  it('tells MediaRecorder MP4 from its WebM fallback', () => {
    expect(isMp4MimeType('video/mp4;codecs=avc1.42E01F')).toBe(true)
    expect(isMp4MimeType('audio/mp4')).toBe(true)
    expect(isMp4MimeType('video/webm;codecs=vp9')).toBe(false)
    expect(isMp4MimeType('audio/webm;codecs=opus')).toBe(false)
  })
})

describe('checkRecordedMedia', () => {
  it('accepts a complete camera file and an audio file', async () => {
    const camera = await checkRecordedMedia(await file('webcam.part', video), 'video/mp4', 'video')
    expect(camera?.bytes).toBe(video.length)
    expect(camera?.durationMs).toBeGreaterThan(2500)
    const mic = await checkRecordedMedia(await file('mic.part', audio), 'audio/mp4', 'audio')
    expect(mic?.durationMs).toBeGreaterThan(1500)
    const system = await checkRecordedMedia(
      await file('system.part', webm),
      'audio/webm;codecs=opus',
      'audio',
    )
    expect(system?.durationMs).toBeGreaterThan(1500)
  })

  it('rejects a header with no frames (the recorder page died before its first chunk)', async () => {
    const path = await file('webcam.part', headerOnly(video))
    expect(await checkRecordedMedia(path, 'video/mp4', 'video')).toBeNull()
  })

  it('rejects missing, tiny and garbage files', async () => {
    expect(await checkRecordedMedia(join(dir, 'nope.part'), 'video/mp4', 'video')).toBeNull()
    const tiny = await file('tiny.part', new Uint8Array(757))
    expect(await checkRecordedMedia(tiny, 'video/mp4', 'video')).toBeNull()
    const garbage = await file('garbage.part', new Uint8Array(8192).fill(7))
    expect(await checkRecordedMedia(garbage, 'audio/webm', 'audio')).toBeNull()
  })

  it('rejects a file without the asked kind of track', async () => {
    const path = await file('mic.part', audio)
    expect(await checkRecordedMedia(path, 'audio/mp4', 'video')).toBeNull()
  })

  it('cuts a file that ends inside a fragment back to the complete ones', async () => {
    const lastMoof = mp4Boxes(video)
      .filter(([type]) => type === 'moof')
      .at(-1)!
    // cut halfway through the last fragment's mdat
    const cut = video.slice(0, lastMoof[1] + lastMoof[2] + 20)
    const path = await file('webcam.part', cut)
    const result = await checkRecordedMedia(path, 'video/mp4', 'video')
    expect(result?.bytes).toBe(lastMoof[1])
    expect((await stat(path)).size).toBe(lastMoof[1])
    expect(result!.durationMs).toBeLessThan(3000)
    expect(result!.durationMs).toBeGreaterThan(0)
  })
})
