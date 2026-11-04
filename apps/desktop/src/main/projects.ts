// Project management for Home and the editor (F-12): list, load, autosave, rename, delete.
// Everything that arrives here came over IPC from the renderer, so it is validated again.
import {
  PROJECT_FILES,
  Project,
  ProjectError,
  listProjects,
  loadProject,
  saveProject,
  type ProjectStore,
  type TranscriptState,
} from '@kamo/core'
import { isDeepStrictEqual } from 'node:util'
import type { BrokenProject, ProjectListing, ProjectSummary } from '../shared/api.ts'
import { SCREEN_FILE } from './capture/recording.ts'
import { mediaUrl } from './media.ts'

export const MAX_PROJECT_NAME_LENGTH = 120
/** `frames/0000.jpg`: the reference thumbnail of second 0 (docs/data-model.md). */
export const THUMBNAIL_FILE = '0000.jpg'

export type ProjectActionCode =
  | 'invalid_name'
  | 'project_not_found'
  /** A-06: a caption save that is not a valid transcript, or with no transcript to correct. */
  | 'invalid_transcript'
  | 'transcript_not_found'

/** Error with a stable code for the renderer (see `IPC_ERROR_PREFIX` in shared/api.ts). */
export class ProjectActionError extends Error {
  constructor(readonly code: ProjectActionCode) {
    super(code)
    this.name = 'ProjectActionError'
  }
}

/** Rename input (F-12): trimmed, not empty, at most 120 characters. */
export function validateProjectName(name: unknown): string {
  if (typeof name !== 'string') throw new ProjectActionError('invalid_name')
  // Line breaks and other control characters make no sense in a one-line name.
  // eslint-disable-next-line no-control-regex
  const trimmed = name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  if (trimmed === '' || [...trimmed].length > MAX_PROJECT_NAME_LENGTH) {
    throw new ProjectActionError('invalid_name')
  }
  return trimmed
}

/** Visible duration: what is left after the trim (F-16). */
export function visibleDurationMs(project: Project): number {
  return Math.max(0, project.trim.endMs - project.trim.startMs)
}

async function hasFile(store: ProjectStore, projectId: string, dir: string, name: string) {
  return (await store.listFiles(projectId, dir)).includes(name)
}

export async function summarize(store: ProjectStore, project: Project): Promise<ProjectSummary> {
  const thumbnail = await hasFile(store, project.id, PROJECT_FILES.frames, THUMBNAIL_FILE)
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    durationMs: visibleDurationMs(project),
    thumbnailUrl: thumbnail
      ? mediaUrl(project.id, `${PROJECT_FILES.frames}/${THUMBNAIL_FILE}`)
      : null,
    width: project.source.width,
    height: project.source.height,
    transcript: project.transcript.status,
  }
}

/** Home list, newest first; corrupted projects come apart so Home can offer the raw video. */
export async function listProjectSummaries(store: ProjectStore): Promise<ProjectListing> {
  const { projects, broken } = await listProjects(store)
  return {
    projects: await Promise.all(projects.map((project) => summarize(store, project))),
    broken: await Promise.all(
      broken.map(async ({ projectId, error }): Promise<BrokenProject> => ({
        projectId,
        code: error.code,
        hasVideo: await hasFile(store, projectId, '', SCREEN_FILE),
      })),
    ),
  }
}

async function loadExisting(store: ProjectStore, projectId: string): Promise<Project> {
  if ((await store.readText(projectId, PROJECT_FILES.project)) === null) {
    throw new ProjectActionError('project_not_found')
  }
  return loadProject(store, projectId)
}

export async function loadProjectById(store: ProjectStore, projectId: unknown): Promise<Project> {
  if (typeof projectId !== 'string') throw new ProjectActionError('project_not_found')
  return loadExisting(store, projectId)
}

export interface SaveResult {
  project: Project
  /** What was on disk before, to tell which settings changed (F-08). */
  previous: Project | null
}

/**
 * Autosave target (F-12). Validates with the core schema and writes atomically. Only
 * existing projects: an autosave arriving after a delete must not bring the folder back.
 */
export async function saveProjectData(store: ProjectStore, data: unknown): Promise<SaveResult> {
  const parsed = Project.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ProjectError('invalid_project', 'project failed validation', issues)
  }
  const projectId = parsed.data.id
  return withProjectLock(projectId, async () => {
    const json = await store.readText(projectId, PROJECT_FILES.project)
    if (json === null) throw new ProjectActionError('project_not_found')
    let previous: Project | null = null
    try {
      previous = await loadProject(store, projectId)
    } catch {
      // A corrupted project.json is replaced by the valid one.
    }
    // A-05: main owns the transcription state. An editor that loaded the project before a
    // transcription finished must not put the old state back.
    const project = previous ? { ...parsed.data, transcript: previous.transcript } : parsed.data
    await saveProject(store, project)
    return { project, previous }
  })
}

const projectLocks = new Map<string, Promise<unknown>>()

/**
 * Runs read-modify-write steps on one project.json one at a time (autosave, rename and the
 * transcription state, A-05), so none of them writes a stale copy over another.
 */
export function withProjectLock<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const before = projectLocks.get(projectId) ?? Promise.resolve()
  const run = before.then(task, task)
  const settled = run.catch(() => {})
  projectLocks.set(projectId, settled)
  void settled.then(() => {
    if (projectLocks.get(projectId) === settled) projectLocks.delete(projectId)
  })
  return run
}

/** A-05: the transcription state in project.json; a project deleted meanwhile is left alone. */
export async function setTranscriptState(
  store: ProjectStore,
  projectId: string,
  state: TranscriptState,
): Promise<void> {
  await withProjectLock(projectId, async () => {
    if ((await store.readText(projectId, PROJECT_FILES.project)) === null) return
    const project = await loadProject(store, projectId)
    if (isDeepStrictEqual(project.transcript, state)) return
    await saveProject(store, { ...project, transcript: state })
  })
}

export async function renameProject(
  store: ProjectStore,
  projectId: unknown,
  name: unknown,
): Promise<ProjectSummary> {
  const trimmed = validateProjectName(name)
  if (typeof projectId !== 'string') throw new ProjectActionError('project_not_found')
  const renamed = await withProjectLock(projectId, async () => {
    const project = await loadProjectById(store, projectId)
    const next = { ...project, name: trimmed }
    if (project.name !== trimmed) await saveProject(store, next)
    return next
  })
  return summarize(store, renamed)
}
