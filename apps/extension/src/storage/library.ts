// What the popup lists: the latest projects and the interrupted recordings (flows.md → Popup).
// Reads project.json loosely, without the engine, to keep the popup light (≤ 150KB, no core);
// the editor validates the project for real when it opens it.
import type { ProjectStore } from '@kamo/core'
import { RECORDING_MARKER } from './paths.ts'
import { parseMarker } from './marker.ts'

export type LibraryStore = Pick<ProjectStore, 'listProjectIds' | 'readText' | 'readBlob'>

export interface ProjectSummary {
  id: string
  name: string
  /** ISO date */
  createdAt: string
  durationMs: number
  /** `frames/0000.jpg`, the reference thumbnail of second 0, when there is one. */
  thumbnail: Blob | null
}

export interface InterruptedSummary {
  projectId: string
  /** ISO date */
  startedAt: string
}

export interface Library {
  /** newest first */
  recent: ProjectSummary[]
  /** newest first */
  interrupted: InterruptedSummary[]
}

const PROJECT_JSON = 'project.json'
const FIRST_FRAME = 'frames/0000.jpg'

function summarize(id: string, json: string): Omit<ProjectSummary, 'thumbnail'> | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    const { name, createdAt, durationMs } = raw
    if (typeof name !== 'string' || typeof createdAt !== 'string') return null
    if (typeof durationMs !== 'number') return null
    return { id, name, createdAt, durationMs }
  } catch {
    return null
  }
}

/**
 * Latest `limit` projects and every interrupted recording (marker, no project.json). The
 * recording in progress (`activeProjectId`) is neither.
 */
export async function readLibrary(
  store: LibraryStore,
  { limit, activeProjectId }: { limit: number; activeProjectId?: string | undefined },
): Promise<Library> {
  const projects: Omit<ProjectSummary, 'thumbnail'>[] = []
  const interrupted: InterruptedSummary[] = []
  for (const id of await store.listProjectIds()) {
    if (id === activeProjectId) continue
    const json = await store.readText(id, PROJECT_JSON)
    const summary = json === null ? null : summarize(id, json)
    if (summary) {
      projects.push(summary)
      continue
    }
    if (json !== null) continue // a damaged project.json is the editor's to report (E-03)
    const marker = await store.readText(id, RECORDING_MARKER)
    const parsed = marker === null ? null : parseMarker(marker)
    if (parsed) interrupted.push({ projectId: id, startedAt: parsed.startedAt })
  }
  projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  interrupted.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const recent = await Promise.all(
    projects
      .slice(0, limit)
      .map(async (p) => ({ ...p, thumbnail: await store.readBlob(p.id, FIRST_FRAME) })),
  )
  return { recent, interrupted }
}
