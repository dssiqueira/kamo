// "Open raw video" for a project whose project.json is damaged (F-12): the recording itself is
// fine (editing never touches it, rule 8), so it opens in the system's video player. Nothing in
// the folder changes; rebuilding the edit is left to the user (or a later version).
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SCREEN_FILE } from './capture/recording.ts'
import { ProjectActionError } from './projects.ts'
import { PARTIAL_SUFFIX, type FileProjectStore } from './storage/file-store.ts'
import { assertProjectId } from './storage/paths.ts'

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isFile() && info.size > 0,
    () => false,
  )
}

/** The project's screen video (`screen.mp4`, else a leftover `.partial`); rejects when none. */
export async function rawVideoPath(store: FileProjectStore, projectId: unknown): Promise<string> {
  if (typeof projectId !== 'string') throw new ProjectActionError('project_not_found')
  assertProjectId(projectId)
  if (!(await store.listProjectIds()).includes(projectId)) {
    throw new ProjectActionError('project_not_found')
  }
  const dir = store.projectDir(projectId)
  for (const name of [SCREEN_FILE, SCREEN_FILE + PARTIAL_SUFFIX]) {
    const path = join(dir, name)
    if (await isFile(path)) return path
  }
  throw new ProjectActionError('project_not_found')
}
