import { contextBridge, ipcRenderer } from 'electron'
import type { Project } from '@kamo/core'
import {
  IpcChannel,
  type AppSettings,
  type DisplayInfo,
  type KamoApi,
  type ProjectListing,
  type ProjectSummary,
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
  listProjects: () => invoke(IpcChannel.listProjects) as Promise<ProjectListing>,
  loadProject: (projectId) => invoke(IpcChannel.loadProject, projectId) as Promise<Project>,
  saveProject: (project) => invoke(IpcChannel.saveProject, project) as Promise<void>,
  renameProject: (projectId, name) =>
    invoke(IpcChannel.renameProject, projectId, name) as Promise<ProjectSummary>,
  deleteProject: (projectId) => invoke(IpcChannel.deleteProject, projectId) as Promise<void>,
  showProjectInFolder: (projectId) =>
    invoke(IpcChannel.showProjectInFolder, projectId) as Promise<void>,
  openEditor: (projectId) => invoke(IpcChannel.openEditor, projectId) as Promise<void>,
  onProjectsChanged: (listener) => subscribe(IpcChannel.projectsChanged, () => listener()),
  getSettings: () => invoke(IpcChannel.getSettings) as Promise<AppSettings>,
  updateSettings: (update) => invoke(IpcChannel.updateSettings, update) as Promise<AppSettings>,
}

contextBridge.exposeInMainWorld('kamo', api)
