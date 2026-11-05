// "We found an interrupted recording" (F-02 edge case): Home lists the recordings a crash or a
// forced quit left behind, and the user recovers or discards each one.
//
// What a crash leaves (storage/recovery.ts): the marker, `screen.mp4.partial` (fragmented MP4
// streamed by the native helper, so every complete fragment is playable), `events.jsonl.partial`,
// `frames/` and no project.json. Recovery keeps the complete fragments, finalizes the files the
// way a clean stop does (capture/recording.ts) and writes project.json. Each step can be run
// again: a recovery interrupted halfway is picked up where it stopped.
//
// Audio and the webcam: the microphone, computer-sound and camera takes live in temp folders of
// their own (userData/recording-audio/ and recording-camera/<id>/). The marker links them
// (media-takes.ts), so recovery attaches each one that plays, with the same sync offsets as a
// clean stop, and warns about the others. Older markers have no link: video only.
import {
  PROJECT_FILES,
  ProjectError,
  createProject,
  formatEvents,
  parseEvents,
  parseProject,
  saveProject,
  type CursorSettings,
  type Fps,
  type Project,
  type Style,
} from '@kamo/core'
import { open, rm, stat, truncate } from 'node:fs/promises'
import { join } from 'node:path'
import type { AudioTrackName, AudioWarning } from '../shared/audio.ts'
import type { CameraWarning } from '../shared/camera.ts'
import { attachAudio } from './audio/attach.ts'
import type { RecordedTrack } from './audio/service.ts'
import { attachWebcam } from './camera/attach.ts'
import {
  parseMediaLink,
  readAudioTakeInfo,
  readCameraTakeInfo,
  takeDir,
  type MediaLink,
} from './media-takes.ts'
import { playableMp4Length } from './recorded-media.ts'
import { MIN_DURATION_MS, SCREEN_FILE } from './capture/recording.ts'
import { renameWithRetry } from './storage/atomic.ts'
import { PARTIAL_SUFFIX, type FileProjectStore } from './storage/file-store.ts'
import { assertProjectId, isValidProjectId } from './storage/paths.ts'
import {
  RECORDING_MARKER,
  clearRecordingMarker,
  findInterruptedRecordings,
  type RecordingMarker,
} from './storage/recovery.ts'

export type RecoveryErrorCode =
  /** Not an interrupted recording (already recovered, a normal project, or still recording). */
  | 'not_interrupted'
  /** No playable video in what was left. */
  | 'unrecoverable'

/** Error with a stable code for the renderer (see `IPC_ERROR_PREFIX` in shared/api.ts). */
export class RecoveryError extends Error {
  constructor(
    readonly code: RecoveryErrorCode,
    message: string = code,
  ) {
    super(message)
    this.name = 'RecoveryError'
  }
}

export interface InterruptedRecording {
  projectId: string
  /** ISO date the recording started (the marker's, else the video file's). */
  startedAt: string
  /** Size of the recorded video so far. */
  sizeBytes: number
}

export interface RecoveryOptions {
  /**
   * Recordings started at or after this instant belong to the running app (one may be in
   * progress right now) and are left alone. Main passes its own start time.
   */
  sessionStartedAt: Date
  /** The default project name, translated ("Recording {date}"), for the recording's start. */
  projectName: (startedAt: Date) => string
  /** Last style and cursor used (F-08), like any new recording. */
  defaults?: () => Promise<{ style?: Style; cursor?: CursorSettings }>
  /** Where the audio and camera takes live (userData/recording-audio, recording-camera). */
  mediaTemp?: MediaTempDirs
  log?: RecoveryLogger
}

export interface MediaTempDirs {
  audio: string
  camera: string
}

export interface RecoveryLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

/** A recovered project, and what of its audio and camera could not come back. */
export interface RecoveredRecording {
  project: Project
  audioWarnings: AudioWarning[]
  cameraWarnings: CameraWarning[]
}

const quiet: RecoveryLogger = { info: () => {}, warn: () => {}, error: () => {} }

const SCREEN_PARTIAL = SCREEN_FILE + PARTIAL_SUFFIX
const EVENTS_PARTIAL = PROJECT_FILES.events + PARTIAL_SUFFIX

interface Leftovers {
  marker: RecordingMarker | null
  /** Absolute path of the video: the `.partial`, or `screen.mp4` if a recovery renamed it. */
  video: string
  videoSize: number
  videoModifiedAt: Date
}

async function fileInfo(path: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? { size: info.size, mtime: info.mtime } : null
  } catch {
    return null
  }
}

function parseMarker(text: string | null): RecordingMarker | null {
  if (text === null) return null
  try {
    const value = JSON.parse(text) as unknown
    if (value && typeof value === 'object' && 'startedAt' in value) {
      const startedAt = (value as { startedAt: unknown }).startedAt
      if (typeof startedAt === 'string' && !Number.isNaN(Date.parse(startedAt))) {
        return value as RecordingMarker
      }
    }
  } catch {
    // a marker cut short by the crash: the video file's date stands in
  }
  return null
}

function startedAtOf(leftovers: Leftovers): Date {
  return leftovers.marker ? new Date(leftovers.marker.startedAt) : leftovers.videoModifiedAt
}

async function hasValidProject(store: FileProjectStore, projectId: string): Promise<boolean> {
  const json = await store.readText(projectId, PROJECT_FILES.project)
  if (json === null) return false
  try {
    parseProject(json)
    return true
  } catch (error) {
    if (error instanceof ProjectError) return false
    throw error
  }
}

/**
 * What an interrupted recording left, or null when the folder is not one: it has a valid
 * project.json, no video at all, or belongs to the running session.
 */
async function leftoversOf(
  store: FileProjectStore,
  projectId: string,
  sessionStartedAt: Date,
): Promise<Leftovers | null> {
  if (!isValidProjectId(projectId)) return null
  if (!(await store.listProjectIds()).includes(projectId)) return null
  if (await hasValidProject(store, projectId)) return null
  const marker = parseMarker(await store.readText(projectId, RECORDING_MARKER))
  const dir = store.projectDir(projectId)
  const partial = join(dir, SCREEN_PARTIAL)
  const final = join(dir, SCREEN_FILE)
  const partialInfo = await fileInfo(partial)
  // `screen.mp4` without project.json: a recovery that stopped after the rename
  const finalInfo = partialInfo ? null : marker ? await fileInfo(final) : null
  const info = partialInfo ?? finalInfo
  if (!info) return null
  const leftovers: Leftovers = {
    marker,
    video: partialInfo ? partial : final,
    videoSize: info.size,
    videoModifiedAt: info.mtime,
  }
  // the running app's own recording (in progress, or failed a moment ago) is not "interrupted"
  if (startedAtOf(leftovers).getTime() >= sessionStartedAt.getTime()) return null
  if (!marker && info.mtime.getTime() >= sessionStartedAt.getTime()) return null
  return leftovers
}

/** Interrupted recordings with a video to recover, newest first, for Home's banner. */
export async function listInterruptedRecordings(
  store: FileProjectStore,
  options: Pick<RecoveryOptions, 'sessionStartedAt'>,
): Promise<InterruptedRecording[]> {
  const found: InterruptedRecording[] = []
  for (const projectId of await findInterruptedRecordings(store)) {
    const leftovers = await leftoversOf(store, projectId, options.sessionStartedAt)
    if (!leftovers) continue
    found.push({
      projectId,
      startedAt: startedAtOf(leftovers).toISOString(),
      sizeBytes: leftovers.videoSize,
    })
  }
  return found.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// Moved next to the camera and audio checks (recorded-media.ts); re-exported for callers.
export { playableMp4Length }

export interface VideoInfo {
  width: number
  height: number
  durationMs: number
  fps: Fps
}

/** Reads the first `length` bytes of the file as an MP4: size, duration and frame rate. */
export async function probeVideo(path: string, length: number): Promise<VideoInfo | null> {
  if (length <= 0) return null
  // Loaded on first use: mediabunny is most of the main bundle and startup never needs it.
  const { CustomSource, Input, MP4, QTFF } = await import('mediabunny')
  const handle = await open(path, 'r')
  const input = new Input({
    source: new CustomSource({
      getSize: () => length,
      read: async (start, end) => {
        const buffer = new Uint8Array(end - start)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
        return buffer.subarray(0, bytesRead)
      },
    }),
    formats: [MP4, QTFF],
  })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) return null
    const width = await video.getDisplayWidth()
    const height = await video.getDisplayHeight()
    const first = await video.getFirstTimestamp()
    const end = await video.computeDuration()
    const stats = await video.computePacketStats(100)
    const durationMs = Math.round((end - Math.max(0, first)) * 1000)
    if (!(width > 0 && height > 0 && durationMs > 0 && stats.packetCount > 0)) return null
    return { width, height, durationMs, fps: stats.averagePacketRate > 45 ? 60 : 30 }
  } catch {
    return null
  } finally {
    input.dispose()
    await handle.close()
  }
}

// Recoveries and discards of one project run one after the other: the second of a double
// click then finds the folder already recovered (or gone) and says so.
const queues = new Map<string, Promise<unknown>>()

function serialized<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(task)
  queues.set(projectId, next)
  void next
    .catch(() => {})
    .finally(() => {
      if (queues.get(projectId) === next) queues.delete(projectId)
    })
  return next
}

function checkedId(projectId: unknown): string {
  if (typeof projectId !== 'string') throw new RecoveryError('not_interrupted')
  // UnsafePathError for anything that is not a plain folder name (`invalid_project_id`)
  assertProjectId(projectId)
  return projectId
}

/** The temp take folders the marker links to (absent ones are skipped). */
function linkedTakeDirs(link: MediaLink | null, temp: MediaTempDirs | undefined) {
  if (!link || !temp) return {}
  return {
    ...(link.audio ? { audio: takeDir(temp.audio, link.audio) } : {}),
    ...(link.camera ? { camera: takeDir(temp.camera, link.camera) } : {}),
  }
}

async function partFile(path: string): Promise<number> {
  return (await fileInfo(path))?.size ?? 0
}

/**
 * Attaches the linked microphone, computer-sound and camera takes that play, like a clean stop
 * (audio/attach.ts, camera/attach.ts: same checks and offsets). The project is already saved,
 * so a failure here only costs that track. Never throws.
 */
async function recoverMedia(
  store: FileProjectStore,
  projectId: string,
  link: MediaLink,
  temp: MediaTempDirs,
  log: RecoveryLogger,
): Promise<Pick<RecoveredRecording, 'audioWarnings' | 'cameraWarnings'>> {
  const dirs = linkedTakeDirs(link, temp)
  const target = {
    store,
    projectDir: store.projectDir(projectId),
    projectId,
    videoStartedAt: link.videoStartedAt,
    log,
  }
  const discard = (dir: string) => () => rm(dir, { recursive: true, force: true }).catch(() => {})
  let audioWarnings: AudioWarning[] = []
  if (dirs.audio) {
    const info = await readAudioTakeInfo(dirs.audio)
    const tracks: RecordedTrack[] = []
    for (const track of ['mic', 'system'] as const satisfies readonly AudioTrackName[]) {
      const started = info?.tracks[track]
      const path = join(dirs.audio, `${track}.part`)
      const bytes = await partFile(path)
      if (started && bytes > 0) tracks.push({ track, path, bytes, ...started })
    }
    audioWarnings = tracks.length
      ? await attachAudio(target, { tracks, warnings: [], discard: discard(dirs.audio) })
      : ['audio_failed']
    if (!tracks.length) await discard(dirs.audio)()
  }
  let cameraWarnings: CameraWarning[] = []
  if (dirs.camera) {
    const info = await readCameraTakeInfo(dirs.camera)
    const path = join(dirs.camera, 'webcam.part')
    const bytes = await partFile(path)
    if (info && bytes > 0) {
      cameraWarnings = await attachWebcam(target, {
        video: { path, bytes, ...info },
        warnings: [],
        discard: discard(dirs.camera),
      })
    } else {
      cameraWarnings = ['camera_failed']
      await discard(dirs.camera)()
    }
  }
  log.info('recording.recovered.media', { audioWarnings, cameraWarnings })
  return { audioWarnings, cameraWarnings }
}

/**
 * Turns an interrupted recording into a normal project: complete fragments only, mouse
 * events within the video, project.json written atomically, the linked audio and camera takes
 * that play, marker cleared. Rejects with `not_interrupted` or `unrecoverable` (nothing on
 * disk changes then).
 */
export async function recoverRecording(
  store: FileProjectStore,
  projectId: unknown,
  options: RecoveryOptions,
): Promise<RecoveredRecording> {
  const id = checkedId(projectId)
  return serialized(id, async () => {
    const leftovers = await leftoversOf(store, id, options.sessionStartedAt)
    if (!leftovers) throw new RecoveryError('not_interrupted')

    const playable = await playableMp4Length(leftovers.video)
    const video = await probeVideo(leftovers.video, playable)
    if (!video || video.durationMs < MIN_DURATION_MS) {
      throw new RecoveryError('unrecoverable', 'no playable video in the recording')
    }

    // Video: drop the cut-off fragment, then `.partial` → screen.mp4, as a clean stop does.
    if (playable < leftovers.videoSize) await truncate(leftovers.video, playable)
    const dir = store.projectDir(id)
    if (leftovers.video.endsWith(PARTIAL_SUFFIX)) {
      await renameWithRetry(leftovers.video, join(dir, SCREEN_FILE))
    }

    // Events: tolerant parse (the last line may be cut), only what the video covers.
    const eventsText =
      (await store.readText(id, EVENTS_PARTIAL)) ??
      (await store.readText(id, PROJECT_FILES.events)) ??
      ''
    const { events } = parseEvents(eventsText)
    const kept = events.filter((event) => event.t <= video.durationMs)
    await store.writeText(id, PROJECT_FILES.events, formatEvents(kept))
    await store.removeFile(id, EVENTS_PARTIAL)

    const startedAt = startedAtOf(leftovers)
    const defaults = (await options.defaults?.().catch(() => undefined)) ?? {}
    const project = createProject({
      id,
      name: options.projectName(startedAt),
      source: {
        kind: 'display',
        width: video.width,
        height: video.height,
        // the helper's `started` event had it; the crash took it along
        scaleFactor: 1,
        fps: video.fps,
      },
      durationMs: video.durationMs,
      createdAt: startedAt,
      ...(defaults.style ? { style: defaults.style } : {}),
      ...(defaults.cursor ? { cursor: defaults.cursor } : {}),
    })
    await saveProject(store, project)
    const link = parseMediaLink(leftovers.marker)
    const media =
      link && options.mediaTemp
        ? await recoverMedia(store, id, link, options.mediaTemp, options.log ?? quiet)
        : { audioWarnings: [], cameraWarnings: [] }
    await clearRecordingMarker(store, id)
    // attach rewrote project.json with the tracks: return what is on disk
    const saved = (await store.readText(id, PROJECT_FILES.project)) ?? ''
    return { project: parseProject(saved), ...media }
  })
}

/** Moves an interrupted recording to the system trash. Only interrupted ones. */
export async function discardRecording(
  store: FileProjectStore,
  projectId: unknown,
  options: Pick<RecoveryOptions, 'sessionStartedAt' | 'mediaTemp'>,
): Promise<void> {
  const id = checkedId(projectId)
  return serialized(id, async () => {
    const leftovers = await leftoversOf(store, id, options.sessionStartedAt)
    if (!leftovers) throw new RecoveryError('not_interrupted')
    await store.deleteProject(id)
    // its audio and camera takes go too (they are temp files, never in the trash)
    const dirs = linkedTakeDirs(parseMediaLink(leftovers.marker), options.mediaTemp)
    for (const dir of [dirs.audio, dirs.camera]) {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })
}
