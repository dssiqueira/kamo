import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Renderer pages, one per window kind (`src/renderer/<page>.html`). */
export type Page = 'index' | 'countdown' | 'recording-bar' | 'editor'
const PAGES: readonly Page[] = ['index', 'countdown', 'recording-bar', 'editor']

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const rendererDir = join(import.meta.dirname, '../renderer')

export const isDev = devServerUrl !== undefined

/** True only for the app's own renderer pages (dev server or bundled files). */
export function isAppUrl(url: string): boolean {
  if (devServerUrl) return new URL(url).origin === new URL(devServerUrl).origin
  const path = url.split(/[?#]/)[0]
  return PAGES.some((page) => path === pathToFileURL(join(rendererDir, `${page}.html`)).href)
}

/**
 * Whether a page was built. The editor page arrives in a later step; until then, opening a
 * project is a no-op. Dev checks the source page, production the bundled one.
 */
export function pageExists(page: Page): boolean {
  return existsSync(
    devServerUrl
      ? join(app.getAppPath(), 'src/renderer', `${page}.html`)
      : join(rendererDir, `${page}.html`),
  )
}

/** Loads a page in an existing window, with an optional query (e.g. `?project=<id>`). */
export function loadPage(
  window: BrowserWindow,
  page: Page,
  query: Record<string, string> = {},
): Promise<void> {
  if (devServerUrl) {
    const url = new URL(`${page}.html`, devServerUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    return window.loadURL(url.href)
  }
  return window.loadFile(join(rendererDir, `${page}.html`), { query })
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
  void loadPage(window, page)
  return window
}
