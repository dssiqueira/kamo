// Electron wiring for desktop audio (F-04, D-024): the hidden recorder window, its IPC, the
// permission policy and the loopback source for computer sound on Windows.
import {
  app,
  desktopCapturer,
  ipcMain,
  systemPreferences,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type Session,
  type WebContents,
} from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/api.ts'
import type { AudioSupport, MicrophoneAccess } from '../../shared/audio.ts'
import { isCameraPageUrl } from '../camera/electron.ts'
import { isCameraPermissionAllowed } from '../camera/model.ts'
import { AUDIO_TEMP_FOLDER } from '../media-takes.ts'
import { acceptRecorderSender } from '../recorder-sender.ts'
import { sendTo } from '../safe-send.ts'
import { createAppWindow, isAppUrl, isPageUrl } from '../windows.ts'
import {
  isAudioPermissionAllowed,
  parseAudioSources,
  parseRecorderReport,
  parseTrack,
} from './model.ts'
import { AudioService, type AudioLogger } from './service.ts'
import { assertChunk } from '../ipc-limits.ts'

/** Mac 13+: ScreenCaptureKit records the computer sound, in the capture helper (D-024). */
const macHelperAudio =
  process.platform === 'darwin' && Number(process.getSystemVersion().split('.')[0]) >= 13

/**
 * Computer sound: Chromium's WASAPI loopback in the recorder page on Windows (Electron 45
 * documents `audio: 'loopback'` as Windows-only); ScreenCaptureKit audio in the capture helper
 * on Mac 13+, recorded with the video (D-024).
 */
export const AUDIO_SUPPORT: AudioSupport = {
  system: process.platform === 'win32' || macHelperAudio,
  systemInHelper: macHelperAudio,
}

export interface DesktopAudioOptions {
  mainWindow(): BrowserWindow | undefined
  log(): AudioLogger
}

export function createAudioService(options: DesktopAudioOptions): AudioService {
  // Home may be closing (its page already gone): never throw from a status forwarder.
  const toMain = (channel: string, value: unknown) =>
    void sendTo(options.mainWindow(), channel, value)
  return new AudioService({
    support: AUDIO_SUPPORT,
    tempDir: join(app.getPath('userData'), AUDIO_TEMP_FOLDER),
    log: {
      info: (event, data) => options.log().info(event, data),
      warn: (event, data) => options.log().warn(event, data),
      error: (event, data) => options.log().error(event, data),
    },
    createWindow: () =>
      createAppWindow('audio-recorder', {
        show: false,
        width: 320,
        height: 120,
        skipTaskbar: true,
        focusable: false,
        // Kamo plays no sound of its own (F-04): this page never outputs audio either.
      }),
    onStatus: (status) => toMain(IpcChannel.audioStatus, status),
    onLevels: (levels) => toMain(IpcChannel.audioLevels, levels),
  })
}

const isRecorderUrl = (url: string | undefined): boolean =>
  url !== undefined && url !== '' && isPageUrl(url, 'audio-recorder')

/**
 * Session permission handlers: everything denied except audio for the audio recorder page and
 * the camera (video only) for Home's preview and the camera recorder page (A-03).
 */
export function installAudioPermissions(session: Session): void {
  const allowed = (permission: string, url: string | undefined, mediaTypes: string[]) =>
    isAudioPermissionAllowed({ permission, fromRecorder: isRecorderUrl(url), mediaTypes }) ||
    isCameraPermissionAllowed({ permission, fromCameraPage: isCameraPageUrl(url), mediaTypes })
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = 'requestingUrl' in details ? details.requestingUrl : contents.getURL()
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(allowed(permission, url, mediaTypes))
  })
  session.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const url = details.requestingUrl ?? contents?.getURL()
    const mediaTypes = details.mediaType ? [details.mediaType] : []
    return allowed(permission, url, mediaTypes)
  })
  // getDisplayMedia from the recorder page: a screen source plus loopback audio. The page
  // stops the video track at once; only the computer sound is recorded.
  session.setDisplayMediaRequestHandler((request, callback) => {
    const loopback = AUDIO_SUPPORT.system && !AUDIO_SUPPORT.systemInHelper
    if (!loopback || !isRecorderUrl(request.frame?.url)) {
      callback({})
      return
    }
    void desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const source = sources[0]
        callback(source ? { video: source, audio: 'loopback' } : {})
      })
      .catch(() => callback({}))
  })
}

/** Mac asks once (the OS shows its prompt); elsewhere the status is only read. */
async function microphoneAccess(): Promise<MicrophoneAccess> {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'not-determined') {
      return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
    }
    return status
  }
  if (process.platform === 'win32') return systemPreferences.getMediaAccessStatus('microphone')
  return 'granted'
}

/** IPC for Home (meters, devices, permission) and for the recorder page. */
export function registerAudioIpc(service: AudioService): void {
  const fromApp = (event: IpcMainInvokeEvent) => {
    const url = event.senderFrame?.url
    if (url === undefined || !isAppUrl(url)) throw new Error('Untrusted IPC sender')
  }
  // The recorder page this service opened answers; one it opened before (destroyed or
  // replaced, its last messages still in flight) is ignored; anything else is rejected.
  const fromRecorder = (event: IpcMainInvokeEvent): boolean =>
    acceptRecorderSender(service.senderKind(event.sender))
  // The monitor follows the page that asked: navigating away or closing turns it off.
  let monitorOwner: WebContents | undefined
  const releaseOwner = () => {
    monitorOwner = undefined
    void service.setMonitor(null).catch(() => {})
  }

  ipcMain.handle(IpcChannel.getAudioSupport, (event) => {
    fromApp(event)
    return AUDIO_SUPPORT
  })
  ipcMain.handle(IpcChannel.requestMicrophoneAccess, (event) => {
    fromApp(event)
    return microphoneAccess()
  })
  ipcMain.handle(IpcChannel.setAudioMonitor, async (event, value: unknown) => {
    fromApp(event)
    const sources = parseAudioSources(value)
    if (sources && monitorOwner !== event.sender) {
      monitorOwner = event.sender
      const owner = event.sender
      owner.once('did-start-navigation', () => monitorOwner === owner && releaseOwner())
      owner.once('destroyed', () => monitorOwner === owner && releaseOwner())
    }
    // Home gets the current state at once; the page sends updates as devices open.
    event.sender.send(IpcChannel.audioStatus, service.lastStatus)
    await service.setMonitor(sources)
  })
  ipcMain.handle(IpcChannel.audioReport, (event, value: unknown) => {
    if (!fromRecorder(event)) return
    const report = parseRecorderReport(value)
    if (report) service.handleReport(report)
  })
  ipcMain.handle(IpcChannel.audioChunk, (event, track: unknown, bytes: unknown) => {
    if (!fromRecorder(event)) return
    assertChunk(bytes, 'audio chunk')
    return service.writeChunk(parseTrack(track), bytes)
  })
}
