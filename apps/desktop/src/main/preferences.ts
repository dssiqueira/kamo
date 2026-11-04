// Main side of Settings (F-15), the permissions onboarding (F-13), "Copy diagnostics" (F-17)
// and automatic updates (F-14). index.ts registers it with its trusted `handle` wrapper.
import { resolveLocale, type Locale } from '@kamo/i18n'
import { tokens } from '@kamo/design-tokens'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type WebContents,
} from 'electron'
import { existsSync } from 'node:fs'
import { access, constants, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppInfo,
  AppSettings,
  FolderKind,
  Folders,
  StoredSettingsUpdate,
} from '../shared/api.ts'
import { IpcChannel } from '../shared/api.ts'
import { DEFAULT_STOP_SHORTCUT } from './accelerator.ts'
import { isBusy, registerBusyCheck } from './busy.ts'
import { closeToTrayDefault } from './close-to-tray.ts'
import { collectDiagnostics } from './diagnostics-collect.ts'
import { buildIssueUrl, isIssueUrl } from './diagnostics.ts'
import {
  isPermissionKind,
  listPermissions,
  openPermissionSettings,
  requestPermission,
} from './permissions.ts'
import { PreferenceError } from './preference-error.ts'
import { getServices, setProjectsDir } from './services.ts'
import { checkStopShortcut } from './shortcut.ts'
import { defaultProjectsDir } from './storage/index.ts'
import { Updater } from './updater.ts'
import { createAppWindow, isAppUrl, isDev, loadPage } from './windows.ts'

const SETTINGS_WIDTH = 820
const SETTINGS_HEIGHT = 760
const SETTINGS_MIN_WIDTH = 640
const SETTINGS_MIN_HEIGHT = 520
/** Diagnostics and copied text: generous, but bounded. */
const MAX_TEXT_LENGTH = 1_000_000

type Handle = (channel: string, listener: (...args: unknown[]) => unknown) => void

export interface PreferencesDeps {
  handle: Handle
  mainWindow(): BrowserWindow | undefined
  recording: { isRecording(): boolean; activeStopShortcut(): string | null }
  /** Re-creates whatever captured the project store or the locale (the recording backend). */
  rebuildBackend(): Promise<void>
  notifyProjectsChanged(): void
  /** Smoke tests never touch the network. */
  smokeTest: boolean
}

// Cached so the recording controller can read it synchronously (it registers it on start).
let stopShortcut = DEFAULT_STOP_SHORTCUT

/** The global stop shortcut in use (F-15: editable in Settings). */
export function currentStopShortcut(): string {
  return stopShortcut
}

/** UI language for main-side text (project names): the setting, or the OS language. */
export async function uiLocale(): Promise<Locale> {
  const { language } = await getServices().settings.get()
  if (language && language !== 'system') return language
  return resolveLocale([...app.getPreferredSystemLanguages(), app.getLocale()])
}

/** Videos folder unless the user picked another one (F-11 export, F-15). */
export async function getExportDir(): Promise<string> {
  return (await getServices().settings.get()).exportDir ?? app.getPath('videos')
}

/** Window background before the first paint, so dark mode has no cream flash. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors
    ? tokens.colors.dark.background
    : tokens.colors.light.background
}

function platformName(): AppInfo['platform'] {
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

function folders(settings: AppSettings): Folders {
  return {
    projectsDir: getServices().projectsDir,
    exportDir: settings.exportDir ?? app.getPath('videos'),
  }
}

function assertFolderKind(kind: unknown): asserts kind is FolderKind {
  if (kind !== 'projects' && kind !== 'export') throw new PreferenceError('invalid_argument')
}

function assertText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
    throw new PreferenceError('invalid_argument')
  }
}

async function assertWritable(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
  } catch {
    throw new PreferenceError('folder_not_writable')
  }
}

function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, value)
  }
}

function noticesPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'THIRD_PARTY_NOTICES')
    : join(app.getAppPath(), '..', '..', 'THIRD_PARTY_NOTICES')
}

export interface Preferences {
  /** Before the first window: theme, shortcut and the projects folder from settings.json. */
  init(): Promise<void>
  /** Page for the main window: the onboarding until it was finished once (F-13). */
  firstPage(): Promise<'index' | 'onboarding'>
  /** Update checks (packaged builds only, never in smoke tests). */
  startUpdates(): void
  /** Opens or focuses the Settings window. */
  openSettings(): Promise<BrowserWindow>
}

export function registerPreferences(deps: PreferencesDeps): Preferences {
  const { handle } = deps
  // Services exist only after `ready`; this runs before, so they are read on use.
  const log = {
    info: (event: string, data?: Record<string, unknown>) => getServices().log.info(event, data),
    warn: (event: string, data?: Record<string, unknown>) => getServices().log.warn(event, data),
    error: (event: string, data?: Record<string, unknown>) => getServices().log.error(event, data),
  }
  const settings = {
    get: () => getServices().settings.get(),
    update: (update: StoredSettingsUpdate) => getServices().settings.update(update),
  }
  const updater = new Updater(log)
  let settingsWindow: BrowserWindow | undefined
  let language: AppSettings['language']

  registerBusyCheck(() => deps.recording.isRecording())

  // Exports run in a renderer; each one says when it starts and ends (F-14 busy check).
  const exporting = new Set<WebContents>()
  registerBusyCheck(() => exporting.size > 0)
  ipcMain.handle(IpcChannel.setExportInProgress, (event, active: unknown) => {
    const url = event.senderFrame?.url
    if (!url || !isAppUrl(url)) throw new Error('Untrusted IPC sender')
    const sender = event.sender
    if (active === true && !exporting.has(sender)) {
      exporting.add(sender)
      // A closed or crashed window is not exporting any more.
      sender.once('destroyed', () => exporting.delete(sender))
    } else if (active === false) {
      exporting.delete(sender)
    }
  })

  const apply = (next: AppSettings) => {
    nativeTheme.themeSource = next.theme ?? 'light'
    stopShortcut = next.stopShortcut ?? DEFAULT_STOP_SHORTCUT
    const languageChanged = language !== undefined && language !== (next.language ?? 'system')
    language = next.language ?? 'system'
    // Project names follow the UI language.
    if (languageChanged) {
      void deps.rebuildBackend().catch((error: unknown) => log.warn('backend.rebuild', { error }))
    }
  }

  updater.onChange((status) => broadcast(IpcChannel.updateStatus, status))

  const openSettings = async (): Promise<BrowserWindow> => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore()
      settingsWindow.focus()
      return settingsWindow
    }
    const window = createAppWindow('settings', {
      width: SETTINGS_WIDTH,
      height: SETTINGS_HEIGHT,
      minWidth: SETTINGS_MIN_WIDTH,
      minHeight: SETTINGS_MIN_HEIGHT,
      show: false,
      backgroundColor: windowBackground(),
      autoHideMenuBar: true,
      ...(isDev ? { icon: join(app.getAppPath(), 'build', 'icon.png') } : {}),
    })
    window.once('ready-to-show', () => window.show())
    window.on('closed', () => {
      if (settingsWindow === window) settingsWindow = undefined
    })
    settingsWindow = window
    return window
  }

  const dialogParent = () =>
    settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : deps.mainWindow()

  // Settings
  handle(IpcChannel.openSettings, async () => {
    await openSettings()
  })
  handle(IpcChannel.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: platformName(),
    defaultStopShortcut: DEFAULT_STOP_SHORTCUT,
    closeToTrayDefault: closeToTrayDefault(process.platform),
  }))
  handle(IpcChannel.getFolders, async () => folders(await settings.get()))
  handle(IpcChannel.chooseFolder, async (kind) => {
    assertFolderKind(kind)
    // The recording is writing into the projects folder.
    if (kind === 'projects' && deps.recording.isRecording()) throw new PreferenceError('busy')
    const current = folders(await settings.get())
    const parent = dialogParent()
    const options = {
      defaultPath: kind === 'projects' ? current.projectsDir : current.exportDir,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'] as Array<
        'openDirectory' | 'createDirectory' | 'promptToCreate'
      >,
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const dir = result.filePaths[0]
    if (result.canceled || !dir) return null
    await assertWritable(dir)
    if (kind === 'export') {
      await settings.update({ exportDir: dir === app.getPath('videos') ? null : dir })
    } else if (dir !== current.projectsDir) {
      await settings.update({ projectsDir: dir === defaultProjectsDir() ? null : dir })
      setProjectsDir(dir)
      await deps.rebuildBackend()
      deps.notifyProjectsChanged()
      log.info('settings.projects_dir.changed')
    }
    return folders(await settings.get())
  })
  handle(IpcChannel.showFolder, async (kind) => {
    assertFolderKind(kind)
    const current = folders(await settings.get())
    const dir = kind === 'projects' ? current.projectsDir : current.exportDir
    await mkdir(dir, { recursive: true }).catch(() => {})
    const error = await shell.openPath(dir)
    if (error) log.warn('settings.show_folder.failed', { error })
  })
  handle(IpcChannel.setStopShortcut, async (accelerator) => {
    if (accelerator === null) return settings.update({ stopShortcut: null })
    if (typeof accelerator !== 'string') throw new PreferenceError('invalid_shortcut')
    const check = checkStopShortcut(accelerator, deps.recording.activeStopShortcut())
    if (check !== 'ok') throw new PreferenceError(check)
    return settings.update({
      stopShortcut: accelerator === DEFAULT_STOP_SHORTCUT ? null : accelerator,
    })
  })

  // Permissions
  handle(IpcChannel.getPermissions, () => listPermissions())
  handle(IpcChannel.requestPermission, async (kind) => {
    if (!isPermissionKind(kind)) throw new PreferenceError('invalid_argument')
    await requestPermission(kind)
    return listPermissions()
  })
  handle(IpcChannel.openPermissionSettings, async (kind) => {
    if (!isPermissionKind(kind)) throw new PreferenceError('invalid_argument')
    await openPermissionSettings(kind)
  })
  handle(IpcChannel.openOnboarding, async () => {
    const main = deps.mainWindow()
    if (main) await loadPage(main, 'onboarding')
  })
  handle(IpcChannel.relaunch, () => {
    if (isBusy()) throw new PreferenceError('busy')
    log.info('app.relaunch')
    app.relaunch()
    app.quit()
  })

  // Help (F-17): built on request, shown first, sent nowhere.
  handle(IpcChannel.getDiagnostics, async (probe) => {
    const value =
      typeof probe === 'object' && probe !== null && 'hardwareH264' in probe
        ? probe.hardwareH264
        : null
    return collectDiagnostics(typeof value === 'boolean' ? value : null)
  })
  handle(IpcChannel.copyText, (text) => {
    assertText(text)
    clipboard.writeText(text)
  })
  handle(IpcChannel.openIssue, async (text) => {
    assertText(text)
    const url = buildIssueUrl(text)
    if (!isIssueUrl(url)) throw new PreferenceError('invalid_argument')
    await shell.openExternal(url)
  })
  handle(IpcChannel.getThirdPartyNotices, async () => {
    try {
      return await readFile(noticesPath(), 'utf8')
    } catch {
      throw new PreferenceError('notices_missing')
    }
  })

  // Updates (F-14)
  handle(IpcChannel.getUpdateStatus, () => updater.getStatus())
  handle(IpcChannel.checkForUpdates, () => updater.check())
  handle(IpcChannel.restartToUpdate, () => updater.restart())

  return {
    async init() {
      getServices().settings.onChange((next) => {
        apply(next)
        broadcast(IpcChannel.settingsChanged, next)
      })
      const current = await settings.get()
      apply(current)
      if (current.projectsDir) {
        // A folder on a drive that is gone: use the default for now, keep the setting.
        if (existsSync(current.projectsDir)) setProjectsDir(current.projectsDir)
        else log.warn('settings.projects_dir.missing')
      }
    },
    async firstPage() {
      return (await settings.get()).onboardingDone ? 'index' : 'onboarding'
    },
    startUpdates() {
      if (!deps.smokeTest) updater.start()
    },
    openSettings,
  }
}
