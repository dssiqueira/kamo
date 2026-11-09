// Automatic updates via GitHub Releases (F-14, docs/integrations.md → electron-updater).
// - Packaged builds only: checks on launch and every 24h, downloads in the background.
// - When ready, the app shows "New version ready, restart now?"; it never restarts by itself,
//   and never while recording or exporting (busy.ts).
// - The check sends no user data: it reads the public release feed. Optional packs live in
//   app-data, outside the install folder, so an update neither ships nor deletes them.
//   The Microsoft Store build (MSIX, `process.windowsStore`) is updated by the Store, so
//   electron-updater stays off there (.github/workflows/store.yml).
import { app } from 'electron'
import type { AppUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/api.ts'
import { isBusy } from './busy.ts'
import { PreferenceError } from './preference-error.ts'
import { markQuitting } from './quitting.ts'

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

interface Log {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

export class Updater {
  private status: UpdateStatus = { state: 'idle' }
  private updater: AppUpdater | undefined
  private timer: NodeJS.Timeout | undefined
  private readonly listeners = new Set<(status: UpdateStatus) => void>()

  constructor(private readonly log: Log) {
    if (!app.isPackaged) this.status = { state: 'unsupported' }
    else if (process.windowsStore) this.status = { state: 'store' }
  }

  /** Packaged, and not from the Microsoft Store. */
  private enabled(): boolean {
    return app.isPackaged && process.windowsStore !== true
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  onChange(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Launch check plus one every 24h. No-op in development builds. */
  start(): void {
    if (!this.enabled() || this.timer) return
    void this.check()
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    this.timer.unref()
  }

  /** Also the "Check now" button. Never interrupts a download or a ready update. */
  async check(): Promise<UpdateStatus> {
    if (!this.enabled()) return this.status
    if (['checking', 'downloading', 'ready'].includes(this.status.state)) return this.status
    try {
      const updater = await this.load()
      this.set({ state: 'checking' })
      await updater.checkForUpdates()
    } catch (error) {
      this.fail(error)
    }
    return this.status
  }

  /** "Restart now". Refuses during a recording or an export (`busy`). */
  restart(): void {
    if (this.status.state !== 'ready' || !this.updater) return
    if (isBusy()) throw new PreferenceError('busy')
    this.log.info('update.restart', { version: this.status.version })
    // On Mac the installer closes the windows before before-quit: they must close, not hide.
    markQuitting()
    this.updater.quitAndInstall()
  }

  private async load(): Promise<AppUpdater> {
    if (this.updater) return this.updater
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
    // Quitting normally also installs it: that is the user closing the app, not a restart.
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = null
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 }),
    )
    autoUpdater.on('update-not-available', () =>
      this.set({ state: 'up-to-date', checkedAt: Date.now() }),
    )
    autoUpdater.on('download-progress', (progress) => {
      if (this.status.state !== 'downloading') return
      this.set({ ...this.status, percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.log.info('update.ready', { version: info.version })
      this.set({ state: 'ready', version: info.version })
    })
    autoUpdater.on('error', (error) => this.fail(error))
    this.updater = autoUpdater
    return autoUpdater
  }

  private fail(error: unknown): void {
    // Offline is the common case; a ready update stays ready.
    this.log.warn('update.failed', { error })
    if (this.status.state !== 'ready') this.set({ state: 'error' })
  }

  private set(status: UpdateStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}
