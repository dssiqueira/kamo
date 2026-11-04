import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type DisplayInfo,
  type KamoApi,
  type RecordingClock,
  type RecordingStatus,
  type ScreenAccess,
} from '../shared/api.ts'

/** Subscribes to one fixed channel; the renderer never receives the IPC event object. */
function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

// Each method wraps one fixed channel; ipcRenderer itself is never exposed.
const api: KamoApi = {
  getLocale: () => invoke(IpcChannel.getLocale) as Promise<string[]>,
  listDisplays: () => invoke(IpcChannel.listDisplays) as Promise<DisplayInfo[]>,
  onDisplaysChanged: (listener) => subscribe(IpcChannel.displaysChanged, () => listener()),
  getScreenAccess: () => invoke(IpcChannel.getScreenAccess) as Promise<ScreenAccess>,
  startRecording: (displayId) => invoke(IpcChannel.startRecording, displayId) as Promise<void>,
  cancelCountdown: () => invoke(IpcChannel.cancelCountdown) as Promise<void>,
  countdownDone: () => invoke(IpcChannel.countdownDone) as Promise<void>,
  pauseRecording: () => invoke(IpcChannel.pauseRecording) as Promise<void>,
  resumeRecording: () => invoke(IpcChannel.resumeRecording) as Promise<void>,
  stopRecording: () => invoke(IpcChannel.stopRecording) as Promise<void>,
  onRecordingClock: (listener) => subscribe<RecordingClock>(IpcChannel.recordingClock, listener),
  onRecordingStatus: (listener) => subscribe<RecordingStatus>(IpcChannel.recordingStatus, listener),
}

contextBridge.exposeInMainWorld('kamo', api)
