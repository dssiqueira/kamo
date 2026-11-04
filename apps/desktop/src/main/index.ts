import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import { writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { ProjectError } from '@kamo/core'
import { tokens } from '@kamo/design-tokens'
import { createI18n, resolveLocale } from '@kamo/i18n'
import { createHelperBackend } from './capture/backend.ts'
import { resolveHelperPath } from './capture/helper-path.ts'
import { IPC_ERROR_PREFIX, IpcChannel } from '../shared/api.ts'
import { getScreenAccess, listDisplays, watchDisplays } from './displays.ts'
import { MEDIA_SCHEME, serveMedia } from './media.ts'
import {
  ProjectActionError,
  listProjectSummaries,
  loadProjectById,
  renameProject,
  saveProjectData,
} from './projects.ts'
import { RecordingController, type RecordingBackend } from './recording-controller.ts'
import { getServices, startServices } from './services.ts'
import { SettingsError, parseSettingsUpdate } from './settings.ts'
import { UnsafePathError, assertProjectId } from './storage/index.ts'
import { createAppWindow, isAppUrl, isDev, loadPage, pageExists } from './windows.ts'

// Must happen before `ready`: a standard, secure scheme that streams (video seeking) and
// works with fetch, but still obeys the page CSP (src/main/media.ts).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: false,
    },
  },
])

// DESIGN.md layout: minimum window 1024×680.
const MIN_WIDTH = 1024
const MIN_HEIGHT = 680

const SMOKE_TEST_TIMEOUT_MS = 60_000
const SMOKE_SCREENSHOT_DELAY_MS = 2000

const isSmokeTest = process.argv.includes('--smoke-test')

if (isSmokeTest) {
  setTimeout(() => {
    console.error('kamo: smoke test timed out before the window rendered')
    app.exit(1)
  }, SMOKE_TEST_TIMEOUT_MS).unref()
}

let mainWindow: BrowserWindow | undefined

// Set once the app is ready (project names need the locale). The Record button lives in a
// window created after that, so nothing can start a recording before.
let backend: RecordingBackend | undefined

const delegatingBackend: RecordingBackend = {
  start: (displayId) =>
    backend ? backend.start(displayId) : Promise.reject(new Error('app not ready')),
}

/** Home refreshes its project list (F-12). */
function notifyProjectsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.projectsChanged)
  }
}

const recording = new RecordingController(
  delegatingBackend,
  () => mainWindow,
  {
    info: (event, data) => getServices().log.info(event, data as Record<string, unknown>),
    error: (event, data) => getServices().log.error(event, data as Record<string, unknown>),
  },
  () => notifyProjectsChanged(),
)

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return url !== undefined && isAppUrl(url)
}

/** Stable code for errors the renderer can explain; null for unexpected ones. */
function ipcErrorCodeOf(error: unknown): string | null {
  if (
    error instanceof ProjectError ||
    error instanceof ProjectActionError ||
    error instanceof SettingsError
  ) {
    return error.code
  }
  if (error instanceof UnsafePathError) return 'invalid_project_id'
  return null
}

/** Registers an IPC handler that only answers the app's own pages. */
function handle(channel: string, listener: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    try {
      return await listener(...args)
    } catch (error) {
      const code = ipcErrorCodeOf(error)
      if (code) throw new Error(`${IPC_ERROR_PREFIX}${code}`, { cause: error })
      getServices().log.error('ipc.failed', { channel, error })
      throw error
    }
  })
}

/**
 * With KAMO_SMOKE_SCREENSHOT=<file.png>, saves a picture of the app window only (never the
 * user's screen) once data has had time to load, for visual checks.
 */
async function finishSmokeTest(window: BrowserWindow): Promise<void> {
  const screenshot = process.env['KAMO_SMOKE_SCREENSHOT']
  if (screenshot) {
    await new Promise((resolve) => setTimeout(resolve, SMOKE_SCREENSHOT_DELAY_MS))
    const image = await window.webContents.capturePage()
    await writeFile(screenshot, image.toPNG())
  }
  console.log('kamo: smoke test ok')
  app.exit(0)
}

function createMainWindow(): void {
  const window = createAppWindow('index', {
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // Same cream as the page, so there is no white flash before the first paint.
    backgroundColor: tokens.colors.light.background,
  })
  window.once('ready-to-show', () => {
    window.show()
    // CI opens the packaged app with this flag and expects a clean exit once it renders.
    if (isSmokeTest) void finishSmokeTest(window)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
}

// Every renderer is sandboxed, including any created later.
app.enableSandbox()

// No navigation away from the app, no new windows, no webviews (the app makes no network calls).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // In dev, mirror the renderer console in the terminal.
  if (isDev) {
    contents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`)
    })
  }
})

handle(IpcChannel.getLocale, () => [...app.getPreferredSystemLanguages(), app.getLocale()])
handle(IpcChannel.listDisplays, () => listDisplays())
handle(IpcChannel.getScreenAccess, () => getScreenAccess())
handle(IpcChannel.startRecording, (displayId) => {
  if (typeof displayId !== 'string') throw new Error('displayId must be a string')
  recording.start(displayId)
  // F-01: the chosen display is remembered for the next recording.
  void getServices()
    .settings.update({ lastDisplayId: displayId })
    .catch((error: unknown) => getServices().log.warn('settings.save.failed', { error }))
})

// Projects (F-12). Ids and data come from the renderer: the store and the schema check them.
handle(IpcChannel.listProjects, () => listProjectSummaries(getServices().store))
handle(IpcChannel.loadProject, (projectId) => loadProjectById(getServices().store, projectId))
handle(IpcChannel.saveProject, async (data) => {
  const { store, settings } = getServices()
  const { project, previous } = await saveProjectData(store, data)
  notifyProjectsChanged()
  // F-08: the last style and cursor the user set become the defaults of new recordings.
  // Only real changes count, so merely opening an old project does not change the default.
  const update = {
    ...(previous && !isDeepStrictEqual(previous.style, project.style)
      ? { lastStyle: project.style }
      : {}),
    ...(previous && !isDeepStrictEqual(previous.cursor, project.cursor)
      ? { lastCursor: project.cursor }
      : {}),
  }
  if (Object.keys(update).length) await settings.update(update)
})
handle(IpcChannel.renameProject, async (projectId, name) => {
  const summary = await renameProject(getServices().store, projectId, name)
  notifyProjectsChanged()
  return summary
})
handle(IpcChannel.deleteProject, async (projectId) => {
  assertProjectId(projectId as string)
  await getServices().store.deleteProject(projectId as string)
  getServices().log.info('project.deleted')
  notifyProjectsChanged()
})
handle(IpcChannel.showProjectInFolder, async (projectId) => {
  const dir = getServices().store.projectDir(projectId as string)
  const error = await shell.openPath(dir)
  if (error) {
    getServices().log.warn('project.show.failed', { error })
    throw new ProjectActionError('project_not_found')
  }
})
handle(IpcChannel.openEditor, async (projectId) => {
  // Only checks the folder: a damaged project also opens, so the editor can offer the raw
  // video and recreate the edit (F-12).
  assertProjectId(projectId as string)
  const ids = await getServices().store.listProjectIds()
  if (!ids.includes(projectId as string)) throw new ProjectActionError('project_not_found')
  if (!mainWindow) return
  if (!pageExists('editor')) {
    // The editor page is built in the next step; until then Home stays where it is.
    getServices().log.warn('editor.missing')
    return
  }
  await loadPage(mainWindow, 'editor', { project: projectId as string })
})

// Settings (F-01, F-08).
handle(IpcChannel.getSettings, () => getServices().settings.get())
handle(IpcChannel.updateSettings, (update) =>
  getServices().settings.update(parseSettingsUpdate(update)),
)
handle(IpcChannel.cancelCountdown, () => recording.cancelCountdown())
handle(IpcChannel.countdownDone, () => recording.countdownDone())
handle(IpcChannel.pauseRecording, () => recording.pause())
handle(IpcChannel.resumeRecording, () => recording.resume())
handle(IpcChannel.stopRecording, () => recording.stop())

/** Native helper backend (D-023), with project names in the user's language. */
async function createBackend(): Promise<RecordingBackend> {
  const locale = resolveLocale([...app.getPreferredSystemLanguages(), app.getLocale()])
  const i18n = await createI18n(locale)
  const { store, log, settings } = getServices()
  return createHelperBackend({
    store,
    logger: log,
    appVersion: app.getVersion(),
    locale,
    defaults: async () => {
      const { lastStyle, lastCursor } = await settings.get()
      return {
        ...(lastStyle ? { style: lastStyle } : {}),
        ...(lastCursor ? { cursor: lastCursor } : {}),
      }
    },
    projectName: (date) => i18n.t('project.defaultName', { date }),
    helperPath: () =>
      resolveHelperPath({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
      }),
  })
}

// Quitting mid-recording stops and saves it first (F-02: nothing recorded is lost).
app.on('before-quit', (event) => {
  if (!recording.isRecording()) return
  event.preventDefault()
  void recording.stop().finally(() => app.quit())
})

void app.whenReady().then(async () => {
  backend = await createBackend()
  // Nothing needs renderer permissions: capture runs in the native helper (D-023).
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
  protocol.handle(MEDIA_SCHEME, (request) => serveMedia(request, getServices().projectsDir))

  createMainWindow()
  void startServices().catch((error: unknown) =>
    getServices().log.error('app.start.failed', { error }),
  )
  watchDisplays(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannel.displaysChanged)
    }
  })
  app.on('activate', () => {
    if (!mainWindow) createMainWindow()
  })
})

// Logged for 'Copy diagnostics' (F-17); a broken main process must not keep running.
process.on('uncaughtException', (error) => {
  getServices().log.error('main.uncaught', { error })
  app.exit(1)
})
process.on('unhandledRejection', (error) => getServices().log.error('main.unhandled', { error }))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
