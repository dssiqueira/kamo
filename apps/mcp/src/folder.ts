// Where the recordings are (docs/integrations.md → MCP): `--dir`, then the desktop app's
// settings.json (a local file), then ~/Kamo/projects. Only reads; never creates the folder.
import { readdir, readFile, stat } from 'node:fs/promises'
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

/**
 * The Microsoft Store build (MSIX) keeps its app data inside the package: Windows redirects
 * `%APPDATA%\Kamo` to `%LOCALAPPDATA%\Packages\<package family>\LocalCache\Roaming\Kamo`, and
 * only the app itself sees the redirect. The family name ends in a publisher hash, so every
 * package with "Kamo" in its name is tried.
 */
export async function storeSettingsFiles(env: NodeJS.ProcessEnv, home: string): Promise<string[]> {
  const packages = join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Packages')
  let names: string[]
  try {
    names = await readdir(packages)
  } catch {
    return []
  }
  return names
    .filter((name) => name.toLowerCase().includes(APP_NAME.toLowerCase()))
    .sort()
    .map((name) => join(packages, name, 'LocalCache', 'Roaming', APP_NAME, 'settings.json'))
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
  const files = [settingsFile(platform, env, home)]
  if (platform === 'win32') files.push(...(await storeSettingsFiles(env, home)))
  let fromSettings: string | null = null
  for (const file of files) {
    fromSettings = await readSettingsProjectsDir(file)
    if (fromSettings) break
  }
  if (fromSettings) return { dir: await normalizeProjectsDir(fromSettings), source: 'settings' }
  return { dir: join(home, 'Kamo', 'projects'), source: 'default' }
}
