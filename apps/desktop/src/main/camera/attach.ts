// After a recording is saved: moves the recorded camera into the project folder (`webcam.mp4`,
// docs/data-model.md) and turns the bubble on in project.json with its sync offset (A-03). The
// video is never at risk: any failure here only costs the camera.
import { DEFAULT_WEBCAM, loadProject, saveProject, type ProjectStore } from '@kamo/core'
import {
  ALL_FORMATS,
  Conversion,
  FilePathSource,
  FilePathTarget,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { CameraWarning } from '../../shared/camera.ts'
import { trackOffsetMs } from '../audio/model.ts'
import { checkRecordedMedia } from '../recorded-media.ts'
import { errorCode, renameWithRetry } from '../storage/atomic.ts'
import { WEBCAM_FILE, isWebm } from './model.ts'
import type { CameraLogger, CameraTake } from './service.ts'

export interface WebcamTarget {
  store: ProjectStore
  /** Absolute folder of the project (FileProjectStore.projectDir). */
  projectDir: string
  projectId: string
  /** `Date.now()` when the capture helper confirmed its first frame. */
  videoStartedAt: number
  log: CameraLogger
}

/** Returns the warnings to show (the take's own plus any failure here). Never throws. */
export async function attachWebcam(
  target: WebcamTarget,
  take: CameraTake,
): Promise<CameraWarning[]> {
  const warnings = new Set(take.warnings)
  const video = take.video
  if (!video) {
    await take.discard()
    return [...warnings]
  }
  // Never a camera that does not play (a recorder page that died before its first complete
  // fragment leaves only the header): the project keeps no bubble and Home warns.
  const playable = await checkRecordedMedia(video.path, video.mimeType, 'video').catch(() => null)
  if (!playable) {
    target.log.warn('camera.unplayable', { bytes: video.bytes })
    warnings.delete('camera_lost')
    warnings.add('camera_failed')
    await take.discard()
    return [...warnings]
  }
  const destination = join(target.projectDir, WEBCAM_FILE)
  try {
    if (isWebm(video.mimeType)) await remuxToMp4(video.path, destination)
    else await moveFile(video.path, destination)
    // Same convention as the audio tracks (F-04): where the camera's first frame sits on the
    // video timeline; negative when the camera started first.
    const offsetMs = trackOffsetMs(video.startedAt, target.videoStartedAt)
    const project = await loadProject(target.store, target.projectId)
    project.webcam = { ...structuredClone(DEFAULT_WEBCAM), offsetMs }
    await saveProject(target.store, project)
    target.log.info('camera.attached', {
      offsetMs,
      bytes: playable.bytes,
      durationMs: playable.durationMs,
      width: video.width,
      height: video.height,
      remuxed: isWebm(video.mimeType),
    })
  } catch (error) {
    target.log.error('camera.attach.failed', { error })
    warnings.add('camera_failed')
    // project.json was not changed, so the file would only take space.
    await rm(destination, { force: true }).catch(() => {})
  }
  await take.discard()
  return [...warnings]
}

/**
 * The VP9/WebM fallback (no H.264 encoder in this Chromium) becomes MP4 without re-encoding:
 * VP9 is valid in MP4, so the project always has `webcam.mp4`.
 */
async function remuxToMp4(from: string, to: string): Promise<void> {
  const input = new Input({ source: new FilePathSource(from), formats: ALL_FORMATS })
  try {
    const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(to) })
    const conversion = await Conversion.init({ input, output, audio: { discard: true } })
    if (!conversion.isValid) throw new Error('webcam remux is not possible')
    await conversion.execute()
  } finally {
    input.dispose()
  }
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
