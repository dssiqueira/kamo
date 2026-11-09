import { contextBridge, ipcRenderer } from 'electron'
import type { Project } from '@kamo/core'
import {
  IpcChannel,
  type AppSettings,
  type DisplayInfo,
  type InterruptedRecording,
  type KamoApi,
  type PlaylistInfo,
  type ProjectListing,
  type ProjectSummary,
  type RecordingClock,
  type RecoveredRecording,
  type RecordingStatus,
  type ScreenAccess,
  type SelectionInfo,
} from '../shared/api.ts'
import type {
  AudioLevels,
  AudioStatus,
  AudioSupport,
  MicrophoneAccess,
  RecorderCommand,
} from '../shared/audio.ts'
import type { CameraAccess, CameraCommand } from '../shared/camera.ts'
import type { CaptureRect, WindowInfo } from '../shared/capture.ts'

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
  startRecording: (target) => invoke(IpcChannel.startRecording, target) as Promise<void>,
  listWindows: () => invoke(IpcChannel.listWindows) as Promise<WindowInfo[]>,
  openSelection: (displayId) =>
    invoke(IpcChannel.openSelection, displayId) as Promise<CaptureRect | null>,
  getSelection: () => invoke(IpcChannel.getSelection) as Promise<SelectionInfo | null>,
  setSelectionHitAreas: (areas, holding) =>
    invoke(IpcChannel.setSelectionHitAreas, areas, holding) as Promise<void>,
  closeSelection: (rect) => invoke(IpcChannel.closeSelection, rect) as Promise<void>,
  recordSelection: (rect) => invoke(IpcChannel.recordSelection, rect) as Promise<void>,
  cancelCountdown: () => invoke(IpcChannel.cancelCountdown) as Promise<void>,
  countdownDone: () => invoke(IpcChannel.countdownDone) as Promise<void>,
  pauseRecording: () => invoke(IpcChannel.pauseRecording) as Promise<void>,
  resumeRecording: () => invoke(IpcChannel.resumeRecording) as Promise<void>,
  stopRecording: () => invoke(IpcChannel.stopRecording) as Promise<void>,
  onRecordingClock: (listener) => subscribe<RecordingClock>(IpcChannel.recordingClock, listener),
  getRecordingClock: () => invoke(IpcChannel.getRecordingClock) as Promise<RecordingClock | null>,
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
  openRawVideo: (projectId) => invoke(IpcChannel.openRawVideo, projectId) as Promise<void>,
  loadEvents: (projectId) => invoke(IpcChannel.loadEvents, projectId) as Promise<string>,
  loadTranscript: (projectId) =>
    invoke(IpcChannel.loadTranscript, projectId) as Promise<string | null>,
  saveTranscript: (projectId, transcript) =>
    invoke(IpcChannel.saveTranscript, projectId, transcript),
  openHome: () => invoke(IpcChannel.openHome) as Promise<void>,
  pickBackgroundImage: (projectId) =>
    invoke(IpcChannel.pickBackgroundImage, projectId) as Promise<string | null>,
  onProjectsChanged: (listener) => subscribe(IpcChannel.projectsChanged, () => listener()),
  // Local playlists
  listPlaylists: () => invoke(IpcChannel.listPlaylists) as Promise<PlaylistInfo[]>,
  createPlaylist: (name, projectIds) =>
    invoke(IpcChannel.createPlaylist, name, projectIds ?? []) as Promise<PlaylistInfo>,
  renamePlaylist: (playlistId, name) =>
    invoke(IpcChannel.renamePlaylist, playlistId, name) as Promise<void>,
  deletePlaylist: (playlistId) => invoke(IpcChannel.deletePlaylist, playlistId) as Promise<void>,
  addToPlaylist: (playlistId, projectIds) =>
    invoke(IpcChannel.addToPlaylist, playlistId, projectIds) as Promise<void>,
  removeFromPlaylist: (playlistId, projectIds) =>
    invoke(IpcChannel.removeFromPlaylist, playlistId, projectIds) as Promise<void>,
  reorderPlaylist: (playlistId, projectIds) =>
    invoke(IpcChannel.reorderPlaylist, playlistId, projectIds) as Promise<void>,
  onPlaylistsChanged: (listener) => subscribe(IpcChannel.playlistsChanged, () => listener()),
  listInterruptedRecordings: () =>
    invoke(IpcChannel.listInterruptedRecordings) as Promise<InterruptedRecording[]>,
  recoverRecording: (projectId) =>
    invoke(IpcChannel.recoverRecording, projectId) as Promise<RecoveredRecording>,
  discardRecording: (projectId) => invoke(IpcChannel.discardRecording, projectId) as Promise<void>,
  // Export (F-11): typed by KamoApi, so `invoke`'s results are cast only here.
  getMediaSize: (projectId, file) =>
    invoke(IpcChannel.getMediaSize, projectId, file) as Promise<number | null>,
  readMedia: (projectId, file, start, end) =>
    invoke(IpcChannel.readMedia, projectId, file, start, end) as Promise<Uint8Array>,
  openExportFile: (fileName) =>
    invoke(IpcChannel.openExportFile, fileName) as Promise<{ id: string; name: string }>,
  writeExportFile: (id, position, data) =>
    invoke(IpcChannel.writeExportFile, id, position, data) as Promise<void>,
  commitExportFile: (id) => invoke(IpcChannel.commitExportFile, id) as Promise<string>,
  abortExportFile: (id) => invoke(IpcChannel.abortExportFile, id) as Promise<void>,
  showExportedFile: (path) => invoke(IpcChannel.showExportedFile, path) as Promise<void>,
  getSettings: () => invoke(IpcChannel.getSettings) as Promise<AppSettings>,
  updateSettings: (update) => invoke(IpcChannel.updateSettings, update) as Promise<AppSettings>,
  onSettingsChanged: (listener) => subscribe<AppSettings>(IpcChannel.settingsChanged, listener),
  // Settings window, onboarding, help and updates (F-13, F-14, F-15, F-17). `invoke` returns
  // Promise<any>; KamoApi types each one.
  openSettings: () => invoke(IpcChannel.openSettings),
  getAppInfo: () => invoke(IpcChannel.getAppInfo),
  getFolders: () => invoke(IpcChannel.getFolders),
  chooseFolder: (kind) => invoke(IpcChannel.chooseFolder, kind),
  showFolder: (kind) => invoke(IpcChannel.showFolder, kind),
  setStopShortcut: (accelerator) => invoke(IpcChannel.setStopShortcut, accelerator),
  getPermissions: () => invoke(IpcChannel.getPermissions),
  requestPermission: (kind) => invoke(IpcChannel.requestPermission, kind),
  openPermissionSettings: (kind) => invoke(IpcChannel.openPermissionSettings, kind),
  openOnboarding: (options) => invoke(IpcChannel.openOnboarding, options),
  relaunch: () => invoke(IpcChannel.relaunch),
  getDiagnostics: (probe) => invoke(IpcChannel.getDiagnostics, probe),
  copyText: (text) => invoke(IpcChannel.copyText, text),
  openIssue: (diagnostics) => invoke(IpcChannel.openIssue, diagnostics),
  getThirdPartyNotices: () => invoke(IpcChannel.getThirdPartyNotices),
  getAgentSetup: () => invoke(IpcChannel.getAgentSetup),
  openAgentDocs: () => invoke(IpcChannel.openAgentDocs),
  getUpdateStatus: () => invoke(IpcChannel.getUpdateStatus),
  checkForUpdates: () => invoke(IpcChannel.checkForUpdates),
  restartToUpdate: () => invoke(IpcChannel.restartToUpdate),
  onUpdateStatus: (listener) => subscribe(IpcChannel.updateStatus, listener),
  setExportInProgress: (active) => invoke(IpcChannel.setExportInProgress, active),
  // Audio (F-04)
  getAudioSupport: () => invoke(IpcChannel.getAudioSupport) as Promise<AudioSupport>,
  setAudioMonitor: (sources) => invoke(IpcChannel.setAudioMonitor, sources) as Promise<void>,
  onAudioStatus: (listener) => subscribe<AudioStatus>(IpcChannel.audioStatus, listener),
  onAudioLevels: (listener) => subscribe<AudioLevels>(IpcChannel.audioLevels, listener),
  requestMicrophoneAccess: () =>
    invoke(IpcChannel.requestMicrophoneAccess) as Promise<MicrophoneAccess>,
  onAudioCommand: (listener) => subscribe<RecorderCommand>(IpcChannel.audioCommand, listener),
  reportAudio: (report) => invoke(IpcChannel.audioReport, report) as Promise<void>,
  writeAudioChunk: (track, bytes) => invoke(IpcChannel.audioChunk, track, bytes) as Promise<void>,
  // Webcam (A-03)
  requestCameraAccess: () => invoke(IpcChannel.requestCameraAccess) as Promise<CameraAccess>,
  onCameraCommand: (listener) => subscribe<CameraCommand>(IpcChannel.cameraCommand, listener),
  reportCamera: (report) => invoke(IpcChannel.cameraReport, report) as Promise<void>,
  writeCameraChunk: (bytes) => invoke(IpcChannel.cameraChunk, bytes) as Promise<void>,
  // Optional packs (A-07) and local transcription (A-05). `invoke` returns Promise<any>;
  // KamoApi types each one.
  getPacks: () => invoke(IpcChannel.getPacks),
  installPack: (id) => invoke(IpcChannel.installPack, id),
  pausePack: (id) => invoke(IpcChannel.pausePack, id),
  cancelPack: (id) => invoke(IpcChannel.cancelPack, id),
  removePack: (id) => invoke(IpcChannel.removePack, id),
  onPacksChanged: (listener) => subscribe(IpcChannel.packsChanged, listener),
  transcribeProject: (projectId, options) =>
    invoke(IpcChannel.transcribeProject, projectId, options ?? {}),
  cancelTranscription: (projectId) => invoke(IpcChannel.cancelTranscription, projectId),
  getTranscriptionJobs: () => invoke(IpcChannel.getTranscriptionJobs),
  onTranscriptionChanged: (listener) => subscribe(IpcChannel.transcriptionChanged, listener),
  takeTranscribeAudioJob: () => invoke(IpcChannel.takeTranscribeAudioJob),
  writeTranscribeAudio: (bytes, progress) =>
    invoke(IpcChannel.writeTranscribeAudio, bytes, progress),
  finishTranscribeAudio: (result) => invoke(IpcChannel.finishTranscribeAudio, result),
}

contextBridge.exposeInMainWorld('kamo', api)
