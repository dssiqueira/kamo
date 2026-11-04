// "We found an interrupted recording" in the extension (E-01: browser closed midway → offer to
// recover on the next launch). What a closed browser leaves: the marker, `screen.webm` with
// every chunk flushed so far (WebM plays up to the last complete cluster), maybe `audio.webm`
// and `frames/`, and no project.json. Recovery turns that into a normal project. Loaded only
// when the user clicks Recover, so the engine never weighs on the popup.
import {
  PROJECT_FILES,
  createProject,
  serializeProject,
  type Project,
  type ProjectStore,
} from '@kamo/core'
import { parseMarker } from './marker.ts'
import { MICROPHONE_FILE, RECORDING_MARKER, SCREEN_FILE } from './paths.ts'

export type RecoveryStore = Pick<ProjectStore, 'readText' | 'writeText' | 'deleteProject'> & {
  removeFile(projectId: string, path: string): Promise<void>
  fileSize(projectId: string, path: string): Promise<number | null>
}

export type RecoveryErrorCode = 'not_interrupted' | 'unrecoverable'

export class RecoveryError extends Error {
  constructor(readonly code: RecoveryErrorCode) {
    super(code)
    this.name = 'RecoveryError'
  }
}

/** Shortest take worth keeping, as on the desktop (F-02). */
export const MIN_RECORDING_MS = 1000

export async function recoverRecording(store: RecoveryStore, projectId: string): Promise<Project> {
  if ((await store.readText(projectId, PROJECT_FILES.project)) !== null) {
    throw new RecoveryError('not_interrupted')
  }
  const text = await store.readText(projectId, RECORDING_MARKER)
  const marker = text === null ? null : parseMarker(text)
  if (!marker) throw new RecoveryError('not_interrupted')
  const videoBytes = (await store.fileSize(projectId, SCREEN_FILE)) ?? 0
  if (videoBytes === 0 || marker.durationMs < MIN_RECORDING_MS) {
    throw new RecoveryError('unrecoverable')
  }
  const micBytes = (await store.fileSize(projectId, MICROPHONE_FILE)) ?? 0
  const project = createProject({
    id: projectId,
    name: marker.name,
    source: marker.source,
    durationMs: marker.durationMs,
    createdAt: new Date(marker.startedAt),
    audio: { mic: marker.audio.mic && micBytes > 0, system: marker.audio.system },
  })
  if (project.audio.mic.enabled && marker.audio.micOffsetMs !== undefined) {
    project.audio.mic.offsetMs = marker.audio.micOffsetMs
  }
  await store.writeText(projectId, PROJECT_FILES.project, serializeProject(project))
  await store.removeFile(projectId, RECORDING_MARKER)
  return project
}

/** Discard deletes for good: the extension has no trash. */
export async function discardRecording(store: RecoveryStore, projectId: string): Promise<void> {
  if ((await store.readText(projectId, PROJECT_FILES.project)) !== null) {
    throw new RecoveryError('not_interrupted')
  }
  await store.deleteProject(projectId)
}
