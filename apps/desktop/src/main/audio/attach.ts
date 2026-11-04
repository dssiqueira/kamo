// After a recording is saved: moves the recorded audio into the project folder (`audio.m4a`,
// `system.m4a`, docs/data-model.md) and records each track and its sync offset in
// project.json. The video is never at risk: any failure here only costs the audio.
import { loadProject, saveProject, type ProjectStore } from '@kamo/core'
import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { errorCode, renameWithRetry } from '../storage/atomic.ts'
import type { AudioWarning } from '../../shared/audio.ts'
import { audioFileName, trackOffsetMs } from './model.ts'
import type { AudioLogger, AudioTake } from './service.ts'

export interface AttachTarget {
  store: ProjectStore
  /** Absolute folder of the project (FileProjectStore.projectDir). */
  projectDir: string
  projectId: string
  /** `Date.now()` when the capture helper confirmed its first frame. */
  videoStartedAt: number
  log: AudioLogger
}

/** Returns the warnings to show (the take's own plus any failure here). Never throws. */
export async function attachAudio(target: AttachTarget, take: AudioTake): Promise<AudioWarning[]> {
  const warnings = new Set(take.warnings)
  if (take.tracks.length === 0) {
    await take.discard()
    return [...warnings]
  }
  try {
    const project = await loadProject(target.store, target.projectId)
    for (const track of take.tracks) {
      const name = audioFileName(track.track, track.mimeType)
      await moveFile(track.path, join(target.projectDir, name))
      const offsetMs = trackOffsetMs(track.startedAt, target.videoStartedAt)
      project.audio[track.track] = {
        ...project.audio[track.track],
        enabled: true,
        offsetMs,
      }
      target.log.info('audio.track.attached', { track: track.track, offsetMs, bytes: track.bytes })
    }
    await saveProject(target.store, project)
  } catch (error) {
    target.log.error('audio.attach.failed', { error })
    warnings.add('audio_failed')
  }
  await take.discard()
  return [...warnings]
}

/** Rename, or copy + delete when the temp folder is on another volume. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    // Windows: antivirus or the indexer can hold a fresh file for a moment.
    await renameWithRetry(from, to)
  } catch (error) {
    if (errorCode(error) !== 'EXDEV') throw error
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}
