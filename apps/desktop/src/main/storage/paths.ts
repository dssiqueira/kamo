// Path safety for the on-disk ProjectStore. Project ids and relative paths arrive over IPC
// from the renderer, so they are untrusted: nothing may resolve outside the project folder.
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafePathError'
  }
}

// Ids are uuids in practice; allow a conservative superset so folders made by tests or
// older builds still list, but never anything a file system could interpret specially.
const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/

// Device names that Windows treats specially in any folder (CON, NUL, COM1...).
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

// Characters forbidden in file names on Windows, plus `\` so `/` is the only separator.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\\:*?"<>|\u0000-\u001f]/

export function isValidProjectId(projectId: string): boolean {
  return PROJECT_ID.test(projectId) && !WINDOWS_RESERVED.test(projectId)
}

export function assertProjectId(projectId: string): void {
  if (typeof projectId !== 'string' || !isValidProjectId(projectId)) {
    throw new UnsafePathError(`invalid project id`)
  }
}

/**
 * Splits a project-relative path (`frames/0005.webp`) into safe segments. An empty path
 * means the project folder itself and is only allowed when `allowEmpty` (listFiles).
 */
export function pathSegments(path: string, allowEmpty = false): string[] {
  if (typeof path !== 'string') throw new UnsafePathError('invalid path')
  const trimmed = allowEmpty ? path.replace(/\/$/, '') : path
  if (trimmed === '') {
    if (allowEmpty) return []
    throw new UnsafePathError('empty path')
  }
  if (isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
    throw new UnsafePathError('absolute paths are not allowed')
  }
  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new UnsafePathError('path segments must be plain names')
    }
    if (FORBIDDEN_CHARS.test(segment) || /[. ]$/.test(segment) || WINDOWS_RESERVED.test(segment)) {
      throw new UnsafePathError('path contains a forbidden name or character')
    }
  }
  return segments
}

/** Resolves `<root>/<projectId>/<path>` and double-checks it stays inside the project. */
export function resolveInProject(
  root: string,
  projectId: string,
  path: string,
  allowEmpty = false,
): string {
  assertProjectId(projectId)
  const projectDir = resolve(root, projectId)
  const target = resolve(join(projectDir, ...pathSegments(path, allowEmpty)))
  const rel = relative(projectDir, target)
  const inside = rel === '' ? allowEmpty : target.startsWith(projectDir + sep)
  if (!inside || rel.startsWith('..') || isAbsolute(rel)) {
    throw new UnsafePathError('path escapes the project folder')
  }
  return target
}
