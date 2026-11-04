// Where the native capture helper lives (layout documented in PROTOCOL.md → "Where the
// helper lives"). Pure function with injected inputs so it is testable without Electron:
// main passes `app.isPackaged`, `process.resourcesPath` and `app.getAppPath()`.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const HELPER_NAME = 'kamo-capture'

/** Folder name per OS; matches electron-builder's `${os}` macro (`win`, `mac`). */
export function helperPlatformDir(platform: NodeJS.Platform): 'win' | 'mac' | null {
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  return null
}

export function helperFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${HELPER_NAME}.exe` : HELPER_NAME
}

export interface HelperPathOptions {
  packaged: boolean
  /** `process.resourcesPath` (packaged builds). */
  resourcesPath: string
  /** `app.getAppPath()`: `apps/desktop` in development. */
  appPath: string
  platform?: NodeJS.Platform
  /** Overridable for tests. */
  isFile?: (path: string) => boolean
}

const defaultIsFile = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

/** Candidate paths, most specific first. */
export function helperCandidates(options: HelperPathOptions): string[] {
  const platform = options.platform ?? process.platform
  const dir = helperPlatformDir(platform)
  if (!dir) return []
  const file = helperFileName(platform)
  if (options.packaged) return [join(options.resourcesPath, 'helpers', dir, file)]
  const nativeDir = join(options.appPath, 'native', dir, 'build')
  // cargo (`--target-dir build`) and SwiftPM (`--scratch-path build`) both use build/<profile>/
  return [join(nativeDir, 'release', file), join(nativeDir, 'debug', file)]
}

/**
 * Absolute path of the helper, or null when it is not there (not built yet in development,
 * or an unsupported OS), so the UI can show a clear error instead of a spawn failure.
 */
export function resolveHelperPath(options: HelperPathOptions): string | null {
  const isFile = options.isFile ?? defaultIsFile
  return helperCandidates(options).find((path) => isFile(path)) ?? null
}
