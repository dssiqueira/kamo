import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Renderer pages, one per window kind (`src/renderer/<page>.html`). */
export type Page = 'index' | 'countdown' | 'recording-bar'
const PAGES: readonly Page[] = ['index', 'countdown', 'recording-bar']

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const rendererDir = join(import.meta.dirname, '../renderer')

export const isDev = devServerUrl !== undefined

/** True only for the app's own renderer pages (dev server or bundled files). */
export function isAppUrl(url: string): boolean {
  if (devServerUrl) return new URL(url).origin === new URL(devServerUrl).origin
  const path = url.split(/[?#]/)[0]
  return PAGES.some((page) => path === pathToFileURL(join(rendererDir, `${page}.html`)).href)
}

/** Every window gets the same hardened renderer: sandbox, isolation, no Node. */
export function createAppWindow(
  page: Page,
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  if (devServerUrl) void window.loadURL(new URL(`${page}.html`, devServerUrl).href)
  else void window.loadFile(join(rendererDir, `${page}.html`))
  return window
}
