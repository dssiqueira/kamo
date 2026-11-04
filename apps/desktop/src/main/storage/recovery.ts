// Crash recovery for F-02: "We found an interrupted recording".
//
// Recording marker: when a recording starts, the capture writes `recording.lock` (JSON:
// `{ startedAt, appVersion? }`) in the project folder, before any media file. A clean stop
// finalizes the media files (`.partial` -> final name), writes project.json and only then
// removes the marker. So, on the next launch, a project folder is interrupted when it has a
// marker or a leftover `.partial` and no project.json that parses. A crash after project.json
// was written leaves a stale marker on a valid project; that is not reported and the marker
// is cleared on the next clean stop or by recovery.
import { PROJECT_FILES, ProjectError, parseProject, type ProjectStore } from '@kamo/core'

export const RECORDING_MARKER = 'recording.lock'

export interface RecordingMarker {
  startedAt: string
  appVersion?: string
  /**
   * The microphone, computer-sound and camera takes of this recording, in their temp folders
   * (media-takes.ts), so recovery can attach them too. Added once the recording is under way.
   */
  media?: { videoStartedAt: number; audio?: string; camera?: string }
}

/** What recovery needs from the store; FileProjectStore implements all of it. */
export interface RecoverableStore extends Pick<ProjectStore, 'listProjectIds' | 'readText'> {
  writeText(projectId: string, path: string, text: string): Promise<void>
  listPartialFiles(projectId: string): Promise<string[]>
  removeFile(projectId: string, path: string): Promise<void>
}

export async function markRecordingStarted(
  store: RecoverableStore,
  projectId: string,
  marker: RecordingMarker,
): Promise<void> {
  await store.writeText(projectId, RECORDING_MARKER, JSON.stringify(marker))
}

/** Adds the media link to the marker of a recording in progress (keeps the rest of it). */
export async function linkRecordingMedia(
  store: RecoverableStore,
  projectId: string,
  media: NonNullable<RecordingMarker['media']>,
): Promise<void> {
  const text = await store.readText(projectId, RECORDING_MARKER)
  // no marker: the recording already ended cleanly, nothing to recover
  if (text === null) return
  const marker = JSON.parse(text) as RecordingMarker
  await store.writeText(projectId, RECORDING_MARKER, JSON.stringify({ ...marker, media }))
}

/** Call after project.json is saved on a clean stop. */
export async function clearRecordingMarker(
  store: RecoverableStore,
  projectId: string,
): Promise<void> {
  await store.removeFile(projectId, RECORDING_MARKER)
}

async function hasValidProject(store: RecoverableStore, projectId: string): Promise<boolean> {
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

/** Project ids with an interrupted recording, sorted. */
export async function findInterruptedRecordings(store: RecoverableStore): Promise<string[]> {
  const interrupted: string[] = []
  for (const projectId of await store.listProjectIds()) {
    const hasMarker = (await store.readText(projectId, RECORDING_MARKER)) !== null
    const hasPartial = !hasMarker && (await store.listPartialFiles(projectId)).length > 0
    if ((hasMarker || hasPartial) && !(await hasValidProject(store, projectId))) {
      interrupted.push(projectId)
    }
  }
  return interrupted.sort()
}
