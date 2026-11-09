// Export IPC (F-11): raw media reads for the renderer's decoder, the desktop FileSink
// (export-files.ts), "Show in folder", the "cancel the export?" question when the
// window closes mid-export, and exports through the compatibility pack (D-040).
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import { join } from 'node:path'
import { createI18n } from '@kamo/i18n'
import { COMPATIBILITY_PACK_ID } from '../shared/packs.ts'
import { IPC_ERROR_PREFIX, IpcChannel } from '../shared/api.ts'
import { registerBusyCheck } from './busy.ts'
import { CompatibilityError, CompatibilityExports } from './compat/service.ts'
import { ExportFileError, ExportFiles } from './export-files.ts'
import { mediaSize, readMedia, type MediaAllowance } from './export-media.ts'
import { getExportDir, uiLocale } from './preferences.ts'
import { getServices } from './services.ts'
import { UnsafePathError, assertProjectId } from './storage/index.ts'
import type { PackManager } from './packs/manager.ts'
import { whisperCommand } from './transcription/whisper.ts'
import { isAppUrl } from './windows.ts'

/** Smoke test only: exports go inside the project, where the check can read them back. */
export const SMOKE_EXPORT_FOLDER = '.smoke-export'
const SMOKE_EXPORT_FILE = /^\.smoke-export\/[^/\\]+\.mp4$/

export interface ExportService {
  files: ExportFiles
  /**
   * Asks before a window closes or reloads in the middle of an export. `onStay` runs when the
   * user keeps the export going (a quit that started it is cancelled).
   */
  guardWindow(window: BrowserWindow, onStay?: () => void): void
  /** Smoke test: send exports to `<project>/.smoke-export` instead of the export folder. */
  useSmokeProject(projectId: string | null): string | null
}

type Translate = (key: string) => string

export function registerExport(options: {
  /** The optional packs (made after the export wiring, so asked for when used). */
  packs(): PackManager
}): ExportService {
  const log = {
    info: (event: string, data?: Record<string, unknown>) => getServices().log.info(event, data),
    warn: (event: string, data?: Record<string, unknown>) => getServices().log.warn(event, data),
  }
  let smokeDir: string | null = null
  const files = new ExportFiles(() => smokeDir ?? getExportDir(), log)
  // D-040: FFmpeg from the compatibility pack, writing into the same export files.
  const compat = new CompatibilityExports({
    files,
    program: () => options.packs().program(COMPATIBILITY_PACK_ID),
    retain: () => options.packs().retain(COMPATIBILITY_PACK_ID),
    // Unpackaged builds also run the fake pack's script (packs/testing.ts) with Electron as Node.
    command: (entry) =>
      whisperCommand(entry, {
        allowScripts: !app.isPackaged,
        execPath: process.execPath,
        env: process.env,
      }),
    platform: process.platform,
    workDir: join(app.getPath('userData'), 'export-compat'),
    log,
  })
  void compat.clean()
  // F-14: never restart for an update in the middle of an export.
  registerBusyCheck(() => files.isExporting())

  // Text for the close dialog; loaded when an export starts (the dialog must be synchronous).
  let translate: Translate | null = null
  const loadTranslations = async () => {
    const i18n = await createI18n(await uiLocale())
    translate = (key) => i18n.t(key)
  }

  const watched = new Set<number>()
  const watchOwner = (sender: WebContents) => {
    if (watched.has(sender.id)) return
    watched.add(sender.id)
    const id = sender.id
    // A closed, reloaded or crashed page cannot finish its files: delete them.
    sender.once('destroyed', () => {
      watched.delete(id)
      void compat.abortAll(id)
      void files.abortAll(id)
    })
    sender.on('did-navigate', () => {
      void compat.abortAll(id)
      void files.abortAll(id)
    })
  }

  const allowSmoke: MediaAllowance = (name) => smokeDir !== null && SMOKE_EXPORT_FILE.test(name)

  const handle = (
    channel: string,
    listener: (sender: WebContents, ...args: unknown[]) => unknown,
  ): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const url = event.senderFrame?.url
      if (!url || !isAppUrl(url)) throw new Error('Untrusted IPC sender')
      try {
        return await listener(event.sender, ...args)
      } catch (error) {
        const code =
          error instanceof ExportFileError || error instanceof CompatibilityError
            ? error.code
            : error instanceof UnsafePathError
              ? 'invalid_project_id'
              : error instanceof TypeError
                ? 'invalid_argument'
                : null
        if (code) throw new Error(`${IPC_ERROR_PREFIX}${code}`, { cause: error })
        getServices().log.error('ipc.failed', { channel, error })
        throw error
      }
    })
  }

  handle(IpcChannel.getMediaSize, (_sender, projectId, file) => {
    assertProjectId(projectId as string)
    return mediaSize(getServices().projectsDir, projectId as string, file, allowSmoke)
  })
  handle(IpcChannel.readMedia, (_sender, projectId, file, start, end) => {
    assertProjectId(projectId as string)
    return readMedia(getServices().projectsDir, projectId as string, file, start, end, allowSmoke)
  })
  handle(IpcChannel.openExportFile, async (sender, fileName) => {
    watchOwner(sender)
    if (!translate) await loadTranslations().catch(() => {})
    return files.open(sender.id, fileName)
  })
  handle(IpcChannel.writeExportFile, (_sender, id, position, data) =>
    files.write(id, position, data),
  )
  handle(IpcChannel.commitExportFile, (_sender, id) => files.commit(id))
  handle(IpcChannel.abortExportFile, (_sender, id) => files.abort(id))
  handle(IpcChannel.compatOpen, async (sender, request) => {
    watchOwner(sender)
    if (!translate) await loadTranslations().catch(() => {})
    return compat.open(sender.id, request)
  })
  handle(IpcChannel.compatWriteAudio, (_sender, id, bytes) => compat.writeAudio(id, bytes))
  handle(IpcChannel.compatWriteFrame, (_sender, id, bytes) => compat.writeFrame(id, bytes))
  handle(IpcChannel.compatFinish, (_sender, id) => compat.finish(id))
  handle(IpcChannel.compatAbort, (_sender, id) => compat.abort(id))
  handle(IpcChannel.showExportedFile, (_sender, path) => {
    if (typeof path !== 'string' || !files.isCommitted(path)) {
      throw new ExportFileError('export_not_found')
    }
    shell.showItemInFolder(path)
  })

  return {
    files,
    guardWindow(window, onStay) {
      // The editor's beforeunload says no while exporting; Electron then asks us (F-11).
      window.webContents.on('will-prevent-unload', (event) => {
        if (!files.isExporting(window.webContents.id)) {
          event.preventDefault()
          return
        }
        const t = translate ?? ((key: string) => key)
        // Quitting from the tray while the window is hidden there: the question needs a window.
        if (!window.isVisible()) window.show()
        const choice = dialog.showMessageBoxSync(window, {
          type: 'question',
          buttons: [t('export.closeDialog.stop'), t('export.closeDialog.keep')],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
          title: t('export.closeDialog.title'),
          message: t('export.closeDialog.title'),
          detail: t('export.closeDialog.message'),
        })
        // preventDefault here means "ignore the page and unload anyway".
        if (choice === 0) event.preventDefault()
        else onStay?.()
      })
    },
    useSmokeProject(projectId) {
      smokeDir = projectId
        ? join(getServices().store.projectDir(projectId), SMOKE_EXPORT_FOLDER)
        : null
      return smokeDir
    },
  }
}
