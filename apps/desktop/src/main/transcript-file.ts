// transcript.json from the editor (A-06): the captions read it, and caption edits write the
// corrected transcript back, so search and the local MCP see the fixed text too.
import { PROJECT_FILES, Transcript, serializeTranscript, type ProjectStore } from '@kamo/core'
import { ProjectActionError } from './projects.ts'

/** The raw text (the renderer parses it with core), or null when there is none. */
export async function loadTranscriptText(
  store: ProjectStore,
  projectId: string,
): Promise<string | null> {
  return store.readText(projectId, PROJECT_FILES.transcript)
}

/**
 * Writes a transcript corrected through the captions: validated with the core schema
 * (`invalid_transcript`), always marked `edited`, written atomically. Only over an existing
 * transcript of an existing project: a save arriving after a delete or before any
 * transcription must not create one (`transcript_not_found`).
 */
export async function saveEditedTranscript(
  store: ProjectStore,
  projectId: string,
  data: unknown,
): Promise<void> {
  const parsed = Transcript.safeParse(data)
  if (!parsed.success) throw new ProjectActionError('invalid_transcript')
  if ((await store.readText(projectId, PROJECT_FILES.project)) === null) {
    throw new ProjectActionError('project_not_found')
  }
  if ((await store.readText(projectId, PROJECT_FILES.transcript)) === null) {
    throw new ProjectActionError('transcript_not_found')
  }
  await store.writeText(
    projectId,
    PROJECT_FILES.transcript,
    serializeTranscript({ ...parsed.data, edited: true }),
  )
}
