// IPC for what Home records (F-01, A-08): start a display, window or region; list windows;
// drag a region on the overlay. The choice is remembered in settings.json.
import { app } from 'electron'
import { IpcChannel, type StoredSettingsUpdate } from '../shared/api.ts'
import type { CaptureTarget } from '../shared/capture.ts'
import { resolveHelperPath } from './capture/helper-path.ts'
import { parseCaptureTarget } from './capture/targets.ts'
import { listCaptureWindows } from './capture/windows-list.ts'
import { RegionPicker, registerRegionPickerIpc } from './region-picker.ts'
import { getServices } from './services.ts'
import type { BrowserWindow } from 'electron'

/** The capture helper binary, or null when it is missing. */
export function captureHelperPath(): string | null {
  return resolveHelperPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  })
}

/** Titles from the last window list, for project.json (`source.windowTitle`). */
const windowTitles = new Map<string, string>()

export function windowTitle(windowId: string): string | undefined {
  return windowTitles.get(windowId)
}

function remember(update: StoredSettingsUpdate): void {
  void getServices()
    .settings.update(update)
    .catch((error: unknown) => getServices().log.warn('settings.save.failed', { error }))
}

/** What Home's choice is remembered as (F-01, A-08). */
export function rememberedTarget(target: CaptureTarget): StoredSettingsUpdate {
  switch (target.kind) {
    case 'display':
      return { lastCaptureKind: 'display', lastDisplayId: target.displayId }
    case 'window':
      return { lastCaptureKind: 'window', lastWindowId: target.windowId }
    case 'region':
      return {
        lastCaptureKind: 'region',
        lastDisplayId: target.displayId,
        lastRegion: { displayId: target.displayId, rect: target.rect },
      }
  }
}

export function registerCapture(
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void,
  options: { start(target: CaptureTarget): void; mainWindow(): BrowserWindow | undefined },
): void {
  handle(IpcChannel.startRecording, (value) => {
    const target = parseCaptureTarget(value)
    options.start(target)
    remember(rememberedTarget(target))
  })
  handle(IpcChannel.listWindows, async () => {
    const windows = await listCaptureWindows({
      helperPath: captureHelperPath,
      logger: getServices().log,
    })
    windowTitles.clear()
    for (const window of windows) windowTitles.set(window.id, window.title)
    return windows
  })
  const picker = new RegionPicker({
    mainWindow: options.mainWindow,
    onPicked: (displayId, rect) =>
      remember({ lastCaptureKind: 'region', lastRegion: { displayId, rect } }),
  })
  handle(IpcChannel.pickRegion, (displayId) => {
    if (typeof displayId !== 'string') throw new Error('displayId must be a string')
    return picker.pick(displayId)
  })
  registerRegionPickerIpc(picker)
}
