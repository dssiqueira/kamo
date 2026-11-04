// Where projects live. core never touches a file system directly (rule 1): the desktop
// implements ProjectStore on disk (~/Kamo/projects/<id>/), the extension on OPFS.
import { ProjectError, parseProject, serializeProject } from '../project/project.ts'
import type { Project } from '../project/schema.ts'

/** File names inside a project folder (docs/data-model.md). */
export const PROJECT_FILES = {
  project: 'project.json',
  events: 'events.jsonl',
  transcript: 'transcript.json',
  frames: 'frames',
} as const

/** Paths are relative to the project folder and always use `/`, e.g. `frames/0005.webp`. */
export interface ProjectStore {
  listProjectIds(): Promise<string[]>
  /** `null` when the file does not exist. */
  readText(projectId: string, path: string): Promise<string | null>
  /** Replaces the file atomically: a crash never leaves it half written. */
  writeText(projectId: string, path: string, text: string): Promise<void>
  /** `null` when the file does not exist. */
  readBlob(projectId: string, path: string): Promise<Blob | null>
  /** For long writes (recording chunks); the file only appears complete after `close()`. */
  openWritable(projectId: string, path: string): Promise<WritableStream<Uint8Array>>
  listFiles(projectId: string, directory: string): Promise<string[]>
  /** Desktop moves the folder to the system trash (F-12); the extension deletes it. */
  deleteProject(projectId: string): Promise<void>
}

export async function loadProject(store: ProjectStore, projectId: string): Promise<Project> {
  const json = await store.readText(projectId, PROJECT_FILES.project)
  if (json === null) throw new ProjectError('invalid_project', `project ${projectId} not found`)
  return parseProject(json)
}

/** Autosave target: every edit goes straight to project.json (F-12, no Save button). */
export async function saveProject(store: ProjectStore, project: Project): Promise<void> {
  await store.writeText(project.id, PROJECT_FILES.project, serializeProject(project))
}

export interface ProjectList {
  /** newest first */
  projects: Project[]
  /** projects that exist but could not be opened; the UI offers to recover the raw video */
  broken: { projectId: string; error: ProjectError }[]
}

/**
 * Lists every project. A folder deleted from outside simply disappears; a corrupted one
 * is reported in `broken` instead of failing the whole list (F-12, M-01).
 */
export async function listProjects(store: ProjectStore): Promise<ProjectList> {
  const projects: Project[] = []
  const broken: ProjectList['broken'] = []
  for (const projectId of await store.listProjectIds()) {
    const json = await store.readText(projectId, PROJECT_FILES.project)
    if (json === null) continue
    try {
      projects.push(parseProject(json))
    } catch (error) {
      if (!(error instanceof ProjectError)) throw error
      broken.push({ projectId, error })
    }
  }
  projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { projects, broken }
}
