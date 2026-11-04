import type { CursorSettings, Project, Style } from '@kamo/core'
import type {
  AudioLevels,
  AudioSources,
  AudioStatus,
  AudioSupport,
  AudioTrackName,
  AudioWarning,
  MicrophoneAccess,
  RecorderCommand,
  RecorderReport,
} from './audio.ts'
import type { CameraAccess, CameraCommand, CameraReport, CameraWarning } from './camera.ts'

/**
 * The only API the renderer gets from the preload (`window.kamo`). Keep it small and typed:
 * the renderer never sees `ipcRenderer` or any Node/Electron object.
 */
export interface KamoApi {
  /** The user's preferred languages (BCP 47), most preferred first. */
  getLocale(): Promise<string[]>
  /** Connected displays with a fresh thumbnail each call (F-01). */
  listDisplays(): Promise<DisplayInfo[]>
  /** Called when a display is connected, removed or changes resolution. Returns unsubscribe. */
  onDisplaysChanged(listener: () => void): () => void
  /** Screen recording permission (only ever not `granted` on Mac). */
  getScreenAccess(): Promise<ScreenAccess>

  // Recording (F-01, F-02). Home starts it; the countdown and the floating bar drive it.
  startRecording(displayId: string): Promise<void>
  cancelCountdown(): Promise<void>
  countdownDone(): Promise<void>
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
  stopRecording(): Promise<void>
  /** Floating bar: clock snapshots on every state change. Returns unsubscribe. */
  onRecordingClock(listener: (clock: RecordingClock) => void): () => void
  /** Floating bar: the current clock, or null when not recording. Read once on mount, since
   * the bar can finish booting after the first push. */
  getRecordingClock(): Promise<RecordingClock | null>
  /** Home: how the last recording ended. Returns unsubscribe. */
  onRecordingStatus(listener: (status: RecordingStatus) => void): () => void

  // Projects (F-12). Errors reject with a stable code: read it with `ipcErrorCode(error)`.
  /** Every project, newest first, plus the ones whose project.json could not be read. */
  listProjects(): Promise<ProjectListing>
  loadProject(projectId: string): Promise<Project>
  /** Autosave: validated with the core schema and written atomically (`invalid_project`). */
  saveProject(project: Project): Promise<void>
  /** Trimmed, 1–120 characters (`invalid_name`). */
  renameProject(projectId: string, name: string): Promise<ProjectSummary>
  /** Moves the folder to the system trash. Home asks for confirmation first. */
  deleteProject(projectId: string): Promise<void>
  showProjectInFolder(projectId: string): Promise<void>
  /** Opens the editor on this project (the main window navigates to it). */
  openEditor(projectId: string): Promise<void>
  /** Raw mouse events (events.jsonl text; '' when the project has none). Parse with core. */
  loadEvents(projectId: string): Promise<string>
  /** Back from the editor to Home. */
  openHome(): Promise<void>
  /**
   * A-04: native picker for PNG, JPEG or WebP; the image is copied into the project and its
   * project-relative name returned (`background-<hash>.<ext>`), or null when cancelled.
   * Rejects with `image_unsupported`, `image_too_big` or `image_unreadable`.
   */
  pickBackgroundImage(projectId: string): Promise<string | null>
  /** A project was saved, renamed, deleted or recorded. Returns unsubscribe. */
  onProjectsChanged(listener: () => void): () => void

  // Interrupted recordings (F-02): what a crash or a forced quit left, from earlier sessions.
  /** Newest first; only the ones with a video to recover. */
  listInterruptedRecordings(): Promise<InterruptedRecording[]>
  /** Makes it a normal project and returns it (`not_interrupted`, `unrecoverable`). */
  recoverRecording(projectId: string): Promise<Project>
  /** Moves it to the system trash (`not_interrupted`). */
  discardRecording(projectId: string): Promise<void>

  // Export (F-11). The renderer decodes, renders and encodes; main only reads the raw files
  // and writes the output. Errors reject with a code (`disk_full`, `write_failed`…).
  /** Size of screen.mp4 / audio.m4a / system.m4a, or null when the project has none. */
  getMediaSize(projectId: string, file: ExportMediaName): Promise<number | null>
  /** Bytes [start, end) of one of those files. */
  readMedia(
    projectId: string,
    file: ExportMediaName,
    start: number,
    end: number,
  ): Promise<Uint8Array>
  /** Creates `<name>.partial` in the export folder; the name gets " (2)" when taken. */
  openExportFile(fileName: string): Promise<{ id: string; name: string }>
  writeExportFile(id: string, position: number, data: Uint8Array): Promise<void>
  /** Renames to the final name; returns the final path. */
  commitExportFile(id: string): Promise<string>
  /** Deletes the incomplete file. */
  abortExportFile(id: string): Promise<void>
  /** Reveals a file exported in this session. */
  showExportedFile(path: string): Promise<void>

  // Settings (F-01 remembered display, F-08 last style as the default).
  getSettings(): Promise<AppSettings>
  updateSettings(update: SettingsUpdate): Promise<AppSettings>
  /** Any saved settings change, from any window (theme and language apply live). */
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void

  // Settings window (F-15). Errors reject with a code (`ipcErrorCode`).
  /** Opens the Settings window, or focuses it when already open. */
  openSettings(): Promise<void>
  getAppInfo(): Promise<AppInfo>
  /** The folders in use (defaults when never changed). */
  getFolders(): Promise<Folders>
  /** Native folder picker; null when cancelled. `busy` while recording, `folder_not_writable`. */
  chooseFolder(kind: FolderKind): Promise<Folders | null>
  showFolder(kind: FolderKind): Promise<void>
  /** Checks it with the OS and saves it; null resets the default (`invalid_shortcut`, `shortcut_taken`). */
  setStopShortcut(accelerator: string | null): Promise<AppSettings>

  // Permissions (F-13 onboarding, F-15 Settings).
  getPermissions(): Promise<PermissionInfo[]>
  /** Mac, not decided yet: shows the OS prompt. Returns the fresh statuses. */
  requestPermission(kind: PermissionKind): Promise<PermissionInfo[]>
  openPermissionSettings(kind: PermissionKind): Promise<void>
  /** Shows the onboarding in the main window (e.g. from Home's missing-permission notice). */
  openOnboarding(): Promise<void>
  /** Restarts Kamo (macOS may need it after Screen Recording is granted). `busy` while recording. */
  relaunch(): Promise<void>

  // Help (F-17). Nothing is sent anywhere: the user sees the text first and decides.
  /** Plain-text report; the renderer passes its hardware encoder probe. */
  getDiagnostics(probe: { hardwareH264: boolean | null }): Promise<string>
  copyText(text: string): Promise<void>
  /** Opens the browser on a new GitHub issue with this text in the body (truncated if long). */
  openIssue(diagnostics: string): Promise<void>
  /** The THIRD_PARTY_NOTICES bundled with the app. */
  getThirdPartyNotices(): Promise<string>

  // Updates (F-14).
  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  /** Installs the downloaded update and restarts. `busy` during a recording or an export. */
  restartToUpdate(): Promise<void>
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void
  /** The export tells main it is running, so an update never restarts in the middle of it. */
  setExportInProgress(active: boolean): Promise<void>

  // Audio (F-04). Home: meters, devices and permission. Main records with the toggles saved
  // in settings (micEnabled, micDeviceId, systemAudioEnabled).
  getAudioSupport(): Promise<AudioSupport>
  /** Opens these sources for the Home meters; null closes them. */
  setAudioMonitor(sources: AudioSources | null): Promise<void>
  onAudioStatus(listener: (status: AudioStatus) => void): () => void
  onAudioLevels(listener: (levels: AudioLevels) => void): () => void
  /** Mac asks the OS (once); elsewhere returns the current status. */
  requestMicrophoneAccess(): Promise<MicrophoneAccess>
  // Hidden audio recorder page only (main refuses any other sender).
  onAudioCommand(listener: (command: RecorderCommand) => void): () => void
  reportAudio(report: RecorderReport): Promise<void>
  writeAudioChunk(track: AudioTrackName, bytes: Uint8Array): Promise<void>

  // Webcam (A-03). Home shows its own preview (getUserMedia) and saves the toggle in settings
  // (cameraEnabled, cameraDeviceId); main records with them.
  /** Mac asks the OS (once); elsewhere returns the current status. */
  requestCameraAccess(): Promise<CameraAccess>
  // Hidden camera recorder page only (main refuses any other sender).
  onCameraCommand(listener: (command: CameraCommand) => void): () => void
  reportCamera(report: CameraReport): Promise<void>
  writeCameraChunk(bytes: Uint8Array): Promise<void>
}

export interface ProjectSummary {
  id: string
  name: string
  /** ISO 8601. */
  createdAt: string
  /** Visible duration (after the trim). */
  durationMs: number
  /** `kamo-media://project/<id>/frames/0000.jpg`, or null when there is no thumbnail. */
  thumbnailUrl: string | null
  /** Recorded size in physical pixels. */
  width: number
  height: number
}

export interface BrokenProject {
  projectId: string
  /** Core `ProjectError` code: `invalid_json`, `invalid_project` or `newer_version`. */
  code: string
  /** Whether `screen.mp4` is there, so the raw video can still be opened. */
  hasVideo: boolean
}

export interface ProjectListing {
  projects: ProjectSummary[]
  broken: BrokenProject[]
}

/** A recording a crash left without project.json (F-02). */
export interface InterruptedRecording {
  projectId: string
  /** ISO date the recording started. */
  startedAt: string
  /** Size of the recorded video. */
  sizeBytes: number
}

/** `app-data/settings.json` (docs/data-model.md). */
export interface AppSettings {
  version: 1
  /** Display picked last time (F-01). */
  lastDisplayId?: string
  /** Style and cursor used last: defaults for new recordings (F-08). */
  lastStyle?: Style
  lastCursor?: CursorSettings
  /** Home audio toggles and microphone (F-01 toggles remembered, F-04). */
  micEnabled?: boolean
  /** Absent or '': the system default microphone. */
  micDeviceId?: string
  systemAudioEnabled?: boolean
  /** Home webcam toggle (A-03). Off by default. */
  cameraEnabled?: boolean
  /** Absent or '': the system default camera. */
  cameraDeviceId?: string
  /** F-15. Absent: light (DESIGN.md). */
  theme?: Theme
  /** F-15. Absent or 'system': the OS language. */
  language?: LanguageSetting
  /** F-15. Absent: the defaults (`~/Kamo/projects`, the Videos folder). Set by main only. */
  projectsDir?: string
  exportDir?: string
  /** F-15. Electron accelerator; absent: DEFAULT_STOP_SHORTCUT. Set by main only. */
  stopShortcut?: string
  /** F-13. Set when the permissions onboarding was finished. */
  onboardingDone?: boolean
  /**
   * F-15. Closing the main window hides it to the tray (menu bar on Mac) instead of quitting.
   * Absent: AppInfo.closeToTrayDefault (on everywhere but Mac).
   */
  closeToTray?: boolean
  /** Set by main once the "Kamo is still running in the tray" notice was shown. */
  trayNoticeShown?: boolean
}

export type Theme = 'light' | 'dark' | 'system'
export type LanguageSetting = 'system' | 'en' | 'pt-BR' | 'es' | 'zh-CN' | 'ja'

/** What the renderer may change with `updateSettings` (folders and shortcut have their own calls). */
export type SettingsUpdate = Partial<
  Omit<AppSettings, 'version' | 'projectsDir' | 'exportDir' | 'stopShortcut' | 'trayNoticeShown'>
>

/** Main-side writes; `null` resets a field to its default. */
export type StoredSettingsUpdate = {
  [K in Exclude<keyof AppSettings, 'version'>]?: AppSettings[K] | null
}

// Settings window (F-15), onboarding (F-13), diagnostics (F-17), updates (F-14).
export type FolderKind = 'projects' | 'export'

export interface Folders {
  projectsDir: string
  exportDir: string
}

export interface AppInfo {
  version: string
  platform: 'mac' | 'windows' | 'linux'
  defaultStopShortcut: string
  /** F-15: closeToTray when the user never changed it. */
  closeToTrayDefault: boolean
}

export type PermissionKind = 'screen' | 'microphone' | 'camera' | 'inputMonitoring'
export type PermissionStatus = 'granted' | 'denied' | 'pending' | 'unknown'

export interface PermissionInfo {
  kind: PermissionKind
  status: PermissionStatus
  /** Screen Recording: onboarding cannot be skipped without it. */
  required: boolean
}

export type UpdateStatus =
  | { state: 'unsupported' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; checkedAt: number }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error' }

/**
 * Main rejects IPC calls with `Error('kamo-error:<code>')`; Electron wraps the message, so
 * the renderer finds the code with `ipcErrorCode`.
 */
/** Raw files the export reads (data-model.md), including the background image (A-04). */
export type ExportMediaName =
  | 'screen.mp4'
  | 'audio.m4a'
  | 'system.m4a'
  | 'webcam.mp4'
  | `background-${string}.${'png' | 'jpg' | 'webp'}`

export const IPC_ERROR_PREFIX = 'kamo-error:'

export function ipcErrorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  return /kamo-error:([a-z_]+)/.exec(message)?.[1] ?? null
}

export interface RecordingClock {
  state: 'recording' | 'paused'
  /** Recorded time (pauses excluded) when `at` was taken. */
  elapsedMs: number
  /** `Date.now()` of this snapshot. */
  at: number
  fps: number
}

export type RecordingStatus =
  | {
      kind: 'saved'
      projectId: string
      warning?: 'display_lost' | 'disk_full'
      /** The video was saved but some audio is missing or cut short (F-04). */
      audioWarnings?: AudioWarning[]
      /** The video was saved but the camera is missing or cut short (A-03). */
      cameraWarnings?: CameraWarning[]
    }
  | { kind: 'error'; code: string }

export interface DisplayInfo {
  id: string
  /** OS label (e.g. the monitor model); empty when the OS gives none. */
  label: string
  /** Physical pixels (logical size × scale factor), what the recording will have. */
  width: number
  height: number
  scaleFactor: number
  primary: boolean
  /** JPEG data URL, or null when the OS did not return one. */
  thumbnail: string | null
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** IPC channel names shared by main and preload. */
export const IpcChannel = {
  getLocale: 'kamo:get-locale',
  listDisplays: 'kamo:list-displays',
  displaysChanged: 'kamo:displays-changed',
  getScreenAccess: 'kamo:get-screen-access',
  startRecording: 'kamo:recording-start',
  cancelCountdown: 'kamo:countdown-cancel',
  countdownDone: 'kamo:countdown-done',
  pauseRecording: 'kamo:recording-pause',
  resumeRecording: 'kamo:recording-resume',
  stopRecording: 'kamo:recording-stop',
  recordingClock: 'kamo:recording-clock',
  getRecordingClock: 'kamo:recording-clock-get',
  recordingStatus: 'kamo:recording-status',
  listProjects: 'kamo:projects-list',
  loadProject: 'kamo:project-load',
  saveProject: 'kamo:project-save',
  renameProject: 'kamo:project-rename',
  deleteProject: 'kamo:project-delete',
  showProjectInFolder: 'kamo:project-show-in-folder',
  openEditor: 'kamo:editor-open',
  loadEvents: 'kamo:project-events',
  openHome: 'kamo:home-open',
  pickBackgroundImage: 'kamo:background-image-pick',
  projectsChanged: 'kamo:projects-changed',
  listInterruptedRecordings: 'kamo:interrupted-list',
  recoverRecording: 'kamo:interrupted-recover',
  discardRecording: 'kamo:interrupted-discard',
  getMediaSize: 'kamo:media-size',
  readMedia: 'kamo:media-read',
  openExportFile: 'kamo:export-file-open',
  writeExportFile: 'kamo:export-file-write',
  commitExportFile: 'kamo:export-file-commit',
  abortExportFile: 'kamo:export-file-abort',
  showExportedFile: 'kamo:export-file-show',
  getSettings: 'kamo:settings-get',
  updateSettings: 'kamo:settings-update',
  settingsChanged: 'kamo:settings-changed',
  openSettings: 'kamo:settings-open',
  getAppInfo: 'kamo:app-info',
  getFolders: 'kamo:folders-get',
  chooseFolder: 'kamo:folders-choose',
  showFolder: 'kamo:folders-show',
  setStopShortcut: 'kamo:shortcut-set',
  getPermissions: 'kamo:permissions-get',
  requestPermission: 'kamo:permissions-request',
  openPermissionSettings: 'kamo:permissions-open-settings',
  openOnboarding: 'kamo:onboarding-open',
  relaunch: 'kamo:app-relaunch',
  getDiagnostics: 'kamo:diagnostics-get',
  copyText: 'kamo:clipboard-copy',
  openIssue: 'kamo:diagnostics-open-issue',
  getThirdPartyNotices: 'kamo:third-party-notices',
  getUpdateStatus: 'kamo:update-status-get',
  checkForUpdates: 'kamo:update-check',
  restartToUpdate: 'kamo:update-restart',
  updateStatus: 'kamo:update-status',
  setExportInProgress: 'kamo:export-in-progress',
  getAudioSupport: 'kamo:audio-support',
  setAudioMonitor: 'kamo:audio-monitor',
  audioStatus: 'kamo:audio-status',
  audioLevels: 'kamo:audio-levels',
  requestMicrophoneAccess: 'kamo:audio-mic-access',
  audioCommand: 'kamo:audio-command',
  audioReport: 'kamo:audio-report',
  audioChunk: 'kamo:audio-chunk',
  requestCameraAccess: 'kamo:camera-access',
  cameraCommand: 'kamo:camera-command',
  cameraReport: 'kamo:camera-report',
  cameraChunk: 'kamo:camera-chunk',
} as const
