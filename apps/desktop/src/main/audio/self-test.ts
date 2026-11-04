// Development check of the audio pipeline without the capture helper:
// KAMO_AUDIO_SELF_TEST=<folder> records 3s of microphone (+ computer sound where supported)
// through the hidden recorder page, copies the files and a summary.json into <folder> and
// quits. Nothing is kept by the app itself; whoever runs it deletes the folder afterwards.
import { app } from 'electron'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { AUDIO_SUPPORT, getAudioService } from './index.ts'
import { audioFileName, trackOffsetMs } from './model.ts'

const DURATION_MS = 3000
const COUNTDOWN_MS = 3000

export async function runAudioSelfTest(outDir: string): Promise<void> {
  try {
    await mkdir(outDir, { recursive: true })
    const service = getAudioService()
    const sources = {
      mic: true,
      // Optional: a deviceId from summary.json of a previous run.
      micDeviceId: process.env['KAMO_AUDIO_SELF_TEST_MIC'] || null,
      system: AUDIO_SUPPORT.system,
    }
    // Same order as a real recording: devices open during the 3s countdown.
    await service.prepare(sources)
    await sleep(COUNTDOWN_MS)
    const requestedAt = Date.now()
    const session = await service.begin(sources)
    if (!session) throw new Error('nothing to record')
    // Stands in for the helper's `started`.
    const videoStartedAt = Date.now()
    await sleep(DURATION_MS / 2)
    await session.pause()
    await sleep(500)
    await session.resume()
    await sleep(DURATION_MS / 2)
    const take = await session.stop()
    const tracks = []
    for (const track of take.tracks) {
      const name = audioFileName(track.track, track.mimeType)
      await copyFile(track.path, join(outDir, name))
      tracks.push({
        track: track.track,
        file: name,
        mimeType: track.mimeType,
        bytes: track.bytes,
        startedAfterRequestMs: track.startedAt - requestedAt,
        offsetMs: trackOffsetMs(track.startedAt, videoStartedAt),
      })
    }
    await take.discard()
    const summary = { status: service.lastStatus, tracks, warnings: take.warnings }
    await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log('kamo: audio self-test ok')
    app.exit(0)
  } catch (error) {
    console.error('kamo: audio self-test failed', error)
    app.exit(1)
  }
}
