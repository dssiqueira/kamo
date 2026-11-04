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
} from '@kamo/core'
import type { BrokenProject, ProjectListing, ProjectSummary } from '../shared/api.ts'
import { SCREEN_FILE } from './capture/recording.ts'
import { mediaUrl } from './media.ts'

export const MAX_PROJECT_NAME_LENGTH = 120
/** `frames/0000.jpg`: the reference thumbnail of second 0 (docs/data-model.md). */
export const THUMBNAIL_FILE = '0000.jpg'

export type ProjectActionCode = 'invalid_name' | 'project_not_found'

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
  const project = parsed.data
  const json = await store.readText(project.id, PROJECT_FILES.project)
  if (json === null) throw new ProjectActionError('project_not_found')
  let previous: Project | null = null
  try {
    previous = await loadProject(store, project.id)
  } catch {
    // A corrupted project.json is replaced by the valid one.
  }
  await saveProject(store, project)
  return { project, previous }
}

export async function renameProject(
  store: ProjectStore,
  projectId: unknown,
  name: unknown,
): Promise<ProjectSummary> {
  const trimmed = validateProjectName(name)
  const project = await loadProjectById(store, projectId)
  const renamed = { ...project, name: trimmed }
  if (project.name !== trimmed) await saveProject(store, renamed)
  return summarize(store, renamed)
}
