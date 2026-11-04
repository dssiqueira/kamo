// Main-process singletons. Created after `app.whenReady()`, when Electron paths are available.
import { app, shell } from 'electron'
import { Logger } from './log/index.ts'
import { SettingsStore } from './settings.ts'
import { FileProjectStore, defaultProjectsDir, findInterruptedRecordings } from './storage/index.ts'

export interface Services {
  log: Logger
  store: FileProjectStore
  projectsDir: string
  /** `settings.json` in Electron's userData folder (docs/data-model.md: app-data). */
  settings: SettingsStore
}

let services: Services | undefined

export function getServices(): Services {
  if (!services) {
    const projectsDir = defaultProjectsDir()
    services = {
      log: new Logger(app.getPath('logs')),
      store: new FileProjectStore(projectsDir, { trash: (path) => shell.trashItem(path) }),
      projectsDir,
      settings: new SettingsStore(app.getPath('userData')),
    }
  }
  return services
}

/** Startup bookkeeping: version line for diagnostics and interrupted recordings (F-02). */
export async function startServices(): Promise<{ interrupted: string[] }> {
  const { log, store } = getServices()
  log.info('app.start', {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
  })
  const interrupted = await findInterruptedRecordings(store)
  if (interrupted.length) log.warn('recording.interrupted', { count: interrupted.length })
  return { interrupted }
}
