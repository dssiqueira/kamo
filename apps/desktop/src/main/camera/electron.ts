// Electron wiring for the desktop camera (A-03): the hidden recorder window, its IPC and the
// OS camera prompt. The permission policy is installed with the audio one (audio/electron.ts).
import { app, ipcMain, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/api.ts'
import type { CameraAccess } from '../../shared/camera.ts'
import { CAMERA_TEMP_FOLDER } from '../media-takes.ts'
import { acceptRecorderSender } from '../recorder-sender.ts'
import { createAppWindow, isAppUrl, isPageUrl } from '../windows.ts'
import { parseCameraReport } from './model.ts'
import { CameraService, type CameraLogger } from './service.ts'
import { assertChunk } from '../ipc-limits.ts'

export interface DesktopCameraOptions {
  log(): CameraLogger
}

export function createCameraService(options: DesktopCameraOptions): CameraService {
  return new CameraService({
    tempDir: join(app.getPath('userData'), CAMERA_TEMP_FOLDER),
    log: {
      info: (event, data) => options.log().info(event, data),
      warn: (event, data) => options.log().warn(event, data),
      error: (event, data) => options.log().error(event, data),
    },
    createWindow: () =>
      createAppWindow('camera-recorder', {
        show: false,
        width: 320,
        height: 240,
        skipTaskbar: true,
        focusable: false,
      }),
  })
}

/** Pages that may open the camera: Home (its live preview) and the hidden recorder. */
export function isCameraPageUrl(url: string | undefined): boolean {
  if (url === undefined || url === '') return false
  return isPageUrl(url, 'index') || isPageUrl(url, 'camera-recorder')
}

/**
 * Asked only when the user turns the camera on (F-13: never in the onboarding). Mac shows its
 * prompt once; Windows only reads the privacy setting (getUserMedia then fails if it is off).
 */
async function cameraAccess(): Promise<CameraAccess> {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('camera')
    if (status === 'not-determined') {
      return (await systemPreferences.askForMediaAccess('camera')) ? 'granted' : 'denied'
    }
    return status
  }
  if (process.platform === 'win32') return systemPreferences.getMediaAccessStatus('camera')
  return 'granted'
}

/** IPC for Home (camera prompt) and for the recorder page. */
export function registerCameraIpc(service: CameraService): void {
  const fromApp = (event: IpcMainInvokeEvent) => {
    const url = event.senderFrame?.url
    if (url === undefined || !isAppUrl(url)) throw new Error('Untrusted IPC sender')
  }
  // The recorder page this service opened answers; one it opened before (destroyed or
  // replaced, its last messages still in flight) is ignored; anything else is rejected.
  const fromRecorder = (event: IpcMainInvokeEvent): boolean =>
    acceptRecorderSender(service.senderKind(event.sender))

  ipcMain.handle(IpcChannel.requestCameraAccess, (event) => {
    fromApp(event)
    return cameraAccess()
  })
  ipcMain.handle(IpcChannel.cameraReport, (event, value: unknown) => {
    if (!fromRecorder(event)) return
    const report = parseCameraReport(value)
    if (report) service.handleReport(report)
  })
  ipcMain.handle(IpcChannel.cameraChunk, (event, bytes: unknown) => {
    if (!fromRecorder(event)) return
    assertChunk(bytes, 'camera chunk')
    return service.writeChunk(bytes)
  })
}
