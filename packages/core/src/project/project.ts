import {
  DEFAULT_CURSOR,
  DEFAULT_STYLE,
  PROJECT_VERSION,
  Project,
  type CursorSettings,
  type Source,
  type Style,
} from './schema.ts'

export type ProjectErrorCode = 'invalid_json' | 'invalid_project' | 'newer_version'

/** Error with a stable code; the UI translates it through packages/i18n. */
export class ProjectError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message)
    this.name = 'ProjectError'
  }
}

export interface NewProject {
  name: string
  source: Source
  durationMs: number
  id?: string
  createdAt?: Date
  /** Last style and cursor used become the defaults of new recordings (F-08). */
  style?: Style
  cursor?: CursorSettings
  audio?: { mic: boolean; system: boolean }
}

export function createProject(input: NewProject): Project {
  return Project.parse({
    version: PROJECT_VERSION,
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    durationMs: input.durationMs,
    source: input.source,
    style: structuredClone(input.style ?? DEFAULT_STYLE),
    zooms: [],
    cursor: structuredClone(input.cursor ?? DEFAULT_CURSOR),
    webcam: null,
    captions: null,
    transcript: { status: 'none' },
    cloud: [],
    trim: { startMs: 0, endMs: input.durationMs },
    audio: {
      mic: { enabled: input.audio?.mic ?? false, volume: 1 },
      system: { enabled: input.audio?.system ?? false, volume: 1 },
    },
    exports: [],
    pendingUpload: null,
  })
}

type Migration = (project: Record<string, unknown>) => Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. Each one returns the project at
 * `from + 1`. Version 1 is the first, so the list is empty until the format changes.
 */
export const MIGRATIONS: Record<number, Migration> = {}

export function migrateProject(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target = PROJECT_VERSION,
): Project {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectError('invalid_project', 'project.json is not an object')
  }
  let project = raw as Record<string, unknown>
  let version = typeof project.version === 'number' ? project.version : NaN
  if (!Number.isInteger(version) || version < 1) {
    throw new ProjectError('invalid_project', 'project.json has no valid version')
  }
  if (version > target) {
    throw new ProjectError('newer_version', `project version ${version} is newer than ${target}`)
  }
  while (version < target) {
    const migrate = migrations[version]
    if (!migrate) throw new ProjectError('invalid_project', `no migration from version ${version}`)
    project = { ...migrate(project), version: version + 1 }
    version++
  }
  const result = Project.safeParse(project)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ProjectError('invalid_project', 'project.json failed validation', issues)
  }
  return result.data
}

export function parseProject(json: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ProjectError('invalid_json', 'project.json is not valid JSON')
  }
  return migrateProject(raw)
}

export function serializeProject(project: Project): string {
  return `${JSON.stringify(Project.parse(project), null, 2)}\n`
}
