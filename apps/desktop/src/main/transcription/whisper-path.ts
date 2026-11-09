// Where the bundled whisper-cli lives (D-042), like the capture helper (capture/helper-path.ts).
// Pure function with injected inputs so it is testable without Electron: main passes
// `app.isPackaged`, `process.resourcesPath` and `app.getAppPath()`.
//
// Packaged: `<resources>/whisper/whisper-cli(.exe)` (electron-builder extraResources), next to
// its ggml libraries on Windows. Development: what `node native/whisper/build.mjs` writes to
// `apps/desktop/native/whisper/build/<win|mac>/` (native/whisper/README.md).
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { helperPlatformDir } from '../capture/helper-path.ts'

export function whisperFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
}

/** Development hook (debug builds only, D-038): another program, e.g. the fake whisper script. */
export const WHISPER_PROGRAM_ENV = 'KAMO_WHISPER_CLI'

export interface WhisperPathOptions {
  packaged: boolean
  resourcesPath: string
  appPath: string
  platform?: NodeJS.Platform
  /** The dev hook's value, only passed when debug hooks are allowed. */
  override?: string | undefined
  isFile?: (path: string) => boolean
}

const defaultIsFile = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

export function whisperCandidates(options: WhisperPathOptions): string[] {
  const platform = options.platform ?? process.platform
  const override = options.override ? [options.override] : []
  const dir = helperPlatformDir(platform)
  if (!dir) return override
  const file = whisperFileName(platform)
  if (options.packaged) return [...override, join(options.resourcesPath, 'whisper', file)]
  return [...override, join(options.appPath, 'native', 'whisper', 'build', dir, file)]
}

/** Absolute path of whisper-cli, or null when this build has none. */
export function resolveWhisperPath(options: WhisperPathOptions): string | null {
  const isFile = options.isFile ?? defaultIsFile
  return whisperCandidates(options).find((path) => isFile(path)) ?? null
}
