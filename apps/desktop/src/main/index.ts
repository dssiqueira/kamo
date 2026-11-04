import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'node:fs/promises'
import { tokens } from '@kamo/design-tokens'
import { createI18n, resolveLocale } from '@kamo/i18n'
import { createHelperBackend } from './capture/backend.ts'
import { resolveHelperPath } from './capture/helper-path.ts'
import { IpcChannel } from '../shared/api.ts'
import { getScreenAccess, listDisplays, watchDisplays } from './displays.ts'
import { RecordingController, type RecordingBackend } from './recording-controller.ts'
import { getServices, startServices } from './services.ts'
import { createAppWindow, isAppUrl, isDev } from './windows.ts'

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

const recording = new RecordingController(delegatingBackend, () => mainWindow, {
  info: (event, data) => getServices().log.info(event, data as Record<string, unknown>),
  error: (event, data) => getServices().log.error(event, data as Record<string, unknown>),
})

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return url !== undefined && isAppUrl(url)
}

/** Registers an IPC handler that only answers the app's own pages. */
function handle(channel: string, listener: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    return listener(...args)
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
})
handle(IpcChannel.cancelCountdown, () => recording.cancelCountdown())
handle(IpcChannel.countdownDone, () => recording.countdownDone())
handle(IpcChannel.pauseRecording, () => recording.pause())
handle(IpcChannel.resumeRecording, () => recording.resume())
handle(IpcChannel.stopRecording, () => recording.stop())

/** Native helper backend (D-023), with project names in the user's language. */
async function createBackend(): Promise<RecordingBackend> {
  const locale = resolveLocale([...app.getPreferredSystemLanguages(), app.getLocale()])
  const i18n = await createI18n(locale)
  const { store, log } = getServices()
  return createHelperBackend({
    store,
    logger: log,
    appVersion: app.getVersion(),
    locale,
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
