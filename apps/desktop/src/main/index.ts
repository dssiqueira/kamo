import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tokens } from '@kamo/design-tokens'
import { IpcChannel } from '../shared/api.ts'
import { getScreenAccess, listDisplays, watchDisplays } from './displays.ts'

// DESIGN.md layout: minimum window 1024×680.
const MIN_WIDTH = 1024
const MIN_HEIGHT = 680

const SMOKE_TEST_TIMEOUT_MS = 60_000
const SMOKE_SCREENSHOT_DELAY_MS = 2000

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const isSmokeTest = process.argv.includes('--smoke-test')

if (isSmokeTest) {
  setTimeout(() => {
    console.error('kamo: smoke test timed out before the window rendered')
    app.exit(1)
  }, SMOKE_TEST_TIMEOUT_MS).unref()
}
const rendererFile = join(import.meta.dirname, '../renderer/index.html')

/** True only for the app's own renderer page (dev server or bundled file). */
function isAppUrl(url: string): boolean {
  if (devServerUrl) return new URL(url).origin === new URL(devServerUrl).origin
  return url.split(/[?#]/)[0] === pathToFileURL(rendererFile).href
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return url !== undefined && isAppUrl(url)
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

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // Same cream as the page, so there is no white flash before the first paint.
    backgroundColor: tokens.colors.light.background,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  window.once('ready-to-show', () => {
    window.show()
    // CI opens the packaged app with this flag and expects a clean exit once it renders.
    if (isSmokeTest) void finishSmokeTest(window)
  })

  if (devServerUrl) void window.loadURL(devServerUrl)
  else void window.loadFile(rendererFile)
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
  if (devServerUrl) {
    contents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`)
    })
  }
})

ipcMain.handle(IpcChannel.getLocale, (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
  return [...app.getPreferredSystemLanguages(), app.getLocale()]
})

ipcMain.handle(IpcChannel.listDisplays, (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
  return listDisplays()
})

ipcMain.handle(IpcChannel.getScreenAccess, (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
  return getScreenAccess()
})

void app.whenReady().then(() => {
  // Nothing needs permissions yet; capture (step 2) will allow only what it uses.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  createWindow()
  watchDisplays(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannel.displaysChanged)
    }
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
