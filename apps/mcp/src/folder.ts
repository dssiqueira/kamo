// Where the recordings are (docs/integrations.md → MCP): `--dir`, then the desktop app's
// settings.json (a local file), then ~/Kamo/projects. Only reads; never creates the folder.
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export type FolderSource = 'argument' | 'settings' | 'default'

export interface ResolvedFolder {
  dir: string
  source: FolderSource
}

export interface ResolveOptions {
  /** Value of `--dir`, if given. */
  dir?: string | undefined
  /** Defaults to the real environment; injectable for tests. */
  env?: NodeJS.ProcessEnv
  home?: string
  platform?: NodeJS.Platform
}

/** Desktop app product name: Electron's userData folder is named after it. */
const APP_NAME = 'Kamo'

/** Electron's `app.getPath('userData')` for the Kamo desktop app, per OS. */
export function appDataDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  if (platform === 'win32') {
    return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), APP_NAME)
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', APP_NAME)
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), APP_NAME)
}

export function settingsFile(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string) {
  return join(appDataDir(platform, env, home), 'settings.json')
}

/** `projectsDir` from the app's settings.json; `null` when missing, unreadable or invalid. */
export async function readSettingsProjectsDir(file: string): Promise<string | null> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }
  try {
    const settings: unknown = JSON.parse(text)
    if (typeof settings !== 'object' || settings === null) return null
    const dir = (settings as { projectsDir?: unknown }).projectsDir
    return typeof dir === 'string' && dir.length > 0 && isAbsolute(dir) ? dir : null
  } catch {
    return null
  }
}

function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * `~/Kamo` and `~/Kamo/projects` both work (plan.md I-1): when the folder has a `projects/`
 * subfolder and is not itself a project, the recordings are in there.
 */
export async function normalizeProjectsDir(dir: string): Promise<string> {
  const nested = join(dir, 'projects')
  if (await isDirectory(nested)) {
    const isProject = await stat(join(dir, 'project.json')).then(
      () => true,
      () => false,
    )
    if (!isProject) return nested
  }
  return dir
}

export async function resolveProjectsDir(options: ResolveOptions = {}): Promise<ResolvedFolder> {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const platform = options.platform ?? process.platform

  if (options.dir !== undefined && options.dir.trim() !== '') {
    const dir = resolve(expandHome(options.dir.trim(), home))
    return { dir: await normalizeProjectsDir(dir), source: 'argument' }
  }
  const fromSettings = await readSettingsProjectsDir(settingsFile(platform, env, home))
  if (fromSettings) return { dir: await normalizeProjectsDir(fromSettings), source: 'settings' }
  return { dir: join(home, 'Kamo', 'projects'), source: 'default' }
}
