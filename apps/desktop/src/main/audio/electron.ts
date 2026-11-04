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
import { createAppWindow, isAppUrl, isPageUrl } from '../windows.ts'
import {
  isAudioPermissionAllowed,
  parseAudioSources,
  parseRecorderReport,
  parseTrack,
} from './model.ts'
import { AudioService, type AudioLogger } from './service.ts'

/**
 * Computer sound: Chromium's WASAPI loopback, Windows only. Electron 45 documents
 * `audio: 'loopback'` as Windows-only; Mac needs ScreenCaptureKit audio (TODO, D-024).
 */
export const AUDIO_SUPPORT: AudioSupport = { system: process.platform === 'win32' }

export interface DesktopAudioOptions {
  mainWindow(): BrowserWindow | undefined
  log(): AudioLogger
}

export function createAudioService(options: DesktopAudioOptions): AudioService {
  const toMain = (channel: string, value: unknown) => {
    const window = options.mainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, value)
  }
  return new AudioService({
    support: AUDIO_SUPPORT,
    tempDir: join(app.getPath('userData'), 'recording-audio'),
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

/** Session permission handlers: everything denied except audio for the recorder page. */
export function installAudioPermissions(session: Session): void {
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = 'requestingUrl' in details ? details.requestingUrl : contents.getURL()
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(isAudioPermissionAllowed({ permission, fromRecorder: isRecorderUrl(url), mediaTypes }))
  })
  session.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const url = details.requestingUrl ?? contents?.getURL()
    const mediaTypes = details.mediaType ? [details.mediaType] : []
    return isAudioPermissionAllowed({ permission, fromRecorder: isRecorderUrl(url), mediaTypes })
  })
  // getDisplayMedia from the recorder page: a screen source plus loopback audio. The page
  // stops the video track at once; only the computer sound is recorded.
  session.setDisplayMediaRequestHandler((request, callback) => {
    if (!AUDIO_SUPPORT.system || !isRecorderUrl(request.frame?.url)) {
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
  const fromRecorder = (event: IpcMainInvokeEvent) => {
    if (!service.isRecorder(event.sender)) throw new Error('Untrusted IPC sender')
  }
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
    fromRecorder(event)
    const report = parseRecorderReport(value)
    if (report) service.handleReport(report)
  })
  ipcMain.handle(IpcChannel.audioChunk, (event, track: unknown, bytes: unknown) => {
    fromRecorder(event)
    if (!(bytes instanceof Uint8Array)) throw new Error('audio chunk must be bytes')
    return service.writeChunk(parseTrack(track), bytes)
  })
}
