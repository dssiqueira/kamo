import type { CursorSettings, Project, Style, Transcript } from '@kamo/core'
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
import type { CaptureKind, CaptureRect, CaptureTarget, WindowInfo } from './capture.ts'
import type {
  PackId,
  PacksStatus,
  TranscribeAudioJob,
  TranscribeAudioResult,
  TranscriptionJob,
  TranscriptionLanguage,
} from './packs.ts'

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
  /** A display (or its id), a window or a region (A-08). */
  startRecording(target: CaptureTarget | string): Promise<void>
  /** A-08: the windows that can be recorded, front to back, with thumbnails. */
  listWindows(): Promise<WindowInfo[]>
  /**
   * A-08 "Select": opens the selection frame on the display (Home hides meanwhile); resolves
   * with the selection (DIP, display-local, at least 320×240 pixels) once the frame closes or
   * records, null when the display is gone. Saved as lastRegion.
   */
  openSelection(displayId: string): Promise<CaptureRect | null>
  /** Selection frame page only: its display and where the frame opens. */
  getSelection(): Promise<SelectionInfo | null>
  /**
   * Selection frame page only: where the frame takes the mouse (DIP, page coordinates); it lets
   * clicks through everywhere else. `holding`: a drag is going on, keep the mouse.
   */
  setSelectionHitAreas(areas: CaptureRect[], holding: boolean): Promise<void>
  /** Selection frame page only: × or Esc, keeping the selection (pixels of the recording). */
  closeSelection(rect: CaptureRect): Promise<void>
  /** Selection frame page only: Record, with the selection (pixels of the recording). */
  recordSelection(rect: CaptureRect): Promise<void>
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
  /**
   * A project whose project.json is damaged: opens its screen video in the system's player
   * (`project_not_found` when it has none). Nothing in the folder changes.
   */
  openRawVideo(projectId: string): Promise<void>
  /** Raw mouse events (events.jsonl text; '' when the project has none). Parse with core. */
  loadEvents(projectId: string): Promise<string>
  /** A-06: transcript.json text (parse with core's parseTranscript), or null when there is none. */
  loadTranscript(projectId: string): Promise<string | null>
  /**
   * A-06: caption edits correct transcript.json (always marked `edited`). Rejects with
   * `invalid_transcript` or `transcript_not_found` (no transcript to correct).
   */
  saveTranscript(projectId: string, transcript: Transcript): Promise<void>
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

  // Local playlists (docs/data-model.md → Playlists): `<projects>/playlists.json`. Errors
  // reject with a code: `invalid_name`, `playlist_not_found`, `project_not_found`,
  // `too_many_playlists`, `playlist_full`, `invalid_order`, `newer_version`.
  /** In creation order; only projects whose folder exists are listed. */
  listPlaylists(): Promise<PlaylistInfo[]>
  /** Trimmed, 1–120 characters; may start with some projects (a card's "New playlist"). */
  createPlaylist(name: string, projectIds?: string[]): Promise<PlaylistInfo>
  renamePlaylist(playlistId: string, name: string): Promise<void>
  /** Deletes the playlist only; its recordings stay. Home asks for confirmation first. */
  deletePlaylist(playlistId: string): Promise<void>
  /** Appends the ones not in it yet. */
  addToPlaylist(playlistId: string, projectIds: string[]): Promise<void>
  removeFromPlaylist(playlistId: string, projectIds: string[]): Promise<void>
  /** The playlist's projects in their new order. */
  reorderPlaylist(playlistId: string, projectIds: string[]): Promise<void>
  /** Any playlist changed (here, in another window, or a project left them). Returns unsubscribe. */
  onPlaylistsChanged(listener: () => void): () => void

  // Interrupted recordings (F-02): what a crash or a forced quit left, from earlier sessions.
  /** Newest first; only the ones with a video to recover. */
  listInterruptedRecordings(): Promise<InterruptedRecording[]>
  /**
   * Makes it a normal project, with the audio and camera that could be recovered, and returns
   * it (`not_interrupted`, `unrecoverable`).
   */
  recoverRecording(projectId: string): Promise<RecoveredRecording>
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
  /**
   * Shows the onboarding in the main window (e.g. from Home's missing-permission notice).
   * `tour`: only the welcome tour, replayed from Settings (F-13).
   */
  openOnboarding(options?: { tour?: boolean }): Promise<void>
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

  // Connect to an agent (M-01, step 26).
  /**
   * devServerPath: apps/mcp/dist/cli.js in an unpackaged build (to try the MCP before npm);
   * mcpVersion: the @kamo/mcp version on npm to pin in the npx command, null while unpublished.
   */
  getAgentSetup(): Promise<{ devServerPath: string | null; mcpVersion: string | null }>
  /** Opens the local MCP instructions (apps/mcp/README.md) in the browser. */
  openAgentDocs(): Promise<void>

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

  // Optional packs (A-07, D-019). Only `refreshPacks` and `installPack` use the network, and
  // only because the user opened Settings → Packs or asked to transcribe.
  /** What is installed and, once the list loaded, what can be downloaded. */
  getPacks(): Promise<PacksStatus>
  /** Fetches the list of packs (packs-manifest.json on GitHub Releases). */
  refreshPacks(): Promise<PacksStatus>
  /** Starts (or resumes) the download; follow it with onPacksChanged. Also installs updates. */
  installPack(id: PackId): Promise<void>
  /** Keeps what arrived; installPack resumes. */
  pausePack(id: PackId): Promise<void>
  cancelPack(id: PackId): Promise<void>
  /** Deletes the pack's files; transcripts stay (`pack_busy` while transcribing). */
  removePack(id: PackId): Promise<void>
  onPacksChanged(listener: (status: PacksStatus) => void): () => void

  // Local transcription (A-05): in the background, one recording at a time.
  /**
   * Rejects with `transcript_edited` when the transcript was corrected through the captions
   * (A-06): ask the user, then call again with `replaceEdited`.
   */
  transcribeProject(projectId: string, options?: { replaceEdited?: boolean }): Promise<void>
  cancelTranscription(projectId: string): Promise<void>
  /** This session's jobs. */
  getTranscriptionJobs(): Promise<TranscriptionJob[]>
  onTranscriptionChanged(listener: (jobs: TranscriptionJob[]) => void): () => void
  // Hidden audio decoder page only (main refuses any other sender).
  takeTranscribeAudioJob(): Promise<TranscribeAudioJob>
  /** 16-bit mono PCM at 16kHz, in order; `progress` is 0..1. */
  writeTranscribeAudio(bytes: Uint8Array, progress: number): Promise<void>
  finishTranscribeAudio(result: TranscribeAudioResult): Promise<void>
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
  /** project.json `transcript.status` (A-05). */
  transcript: 'none' | 'pending' | 'done' | 'failed'
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

/** A local playlist as Home sees it (core `Playlist`, with missing projects hidden). */
export interface PlaylistInfo {
  id: string
  name: string
  /** In playlist order. */
  projectIds: string[]
  /** ISO 8601. */
  createdAt: string
  updatedAt: string
}

/** A recording a crash left without project.json (F-02). */
export interface InterruptedRecording {
  projectId: string
  /** ISO date the recording started. */
  startedAt: string
  /** Size of the recorded video. */
  sizeBytes: number
}

/** A recovered recording, and what of its audio and camera could not come back (F-02). */
export interface RecoveredRecording {
  project: Project
  audioWarnings: AudioWarning[]
  cameraWarnings: CameraWarning[]
}

/** `app-data/settings.json` (docs/data-model.md). */
export interface AppSettings {
  version: 1
  /** Display picked last time (F-01). */
  lastDisplayId?: string
  /** A-08: Screen, Window or Region, as picked last time. Absent: display. */
  lastCaptureKind?: CaptureKind
  /** A-08: the region dragged last time, on its display. */
  lastRegion?: { displayId: string; rect: CaptureRect }
  /** A-08: the window picked last time (reselected while it is still open). */
  lastWindowId?: string
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
  /**
   * A-05: transcribe new recordings in the background. Absent: never asked yet (the question
   * comes once, after a transcription pack is installed).
   */
  autoTranscribe?: boolean
  /** A-05. Absent: automatic detection. */
  transcriptionLanguage?: TranscriptionLanguage
  /** A-05: which installed pack transcribes. Absent: Accurate when installed, else Light. */
  transcriptionPack?: PackId
  /** Playlist shown on Home last time (D-028). Absent or '': All; a deleted one falls back to All. */
  homePlaylistId?: string
  /** A-01: Home's "Record at 60 fps" switch. Absent: 30. */
  recordingFps?: 30 | 60
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
      warning?: 'display_lost' | 'disk_full' | 'window_lost'
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

/** A-08: what the selection frame page opens with. */
export interface SelectionInfo {
  /** The display: size in DIP (points on Mac) and pixels per DIP. */
  display: { width: number; height: number; scaleFactor: number }
  /** Where the frame opens, in pixels of the recording, display-local. */
  rect: CaptureRect
  /** The global stop shortcut (accelerator, F-15), shown on the Record button. */
  stopShortcut: string
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** IPC channel names shared by main and preload. */
export const IpcChannel = {
  getLocale: 'kamo:get-locale',
  listDisplays: 'kamo:list-displays',
  displaysChanged: 'kamo:displays-changed',
  getScreenAccess: 'kamo:get-screen-access',
  startRecording: 'kamo:recording-start',
  listWindows: 'kamo:capture-windows',
  openSelection: 'kamo:selection-open',
  getSelection: 'kamo:selection-info',
  setSelectionHitAreas: 'kamo:selection-hit-areas',
  closeSelection: 'kamo:selection-close',
  recordSelection: 'kamo:selection-record',
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
  openRawVideo: 'kamo:project-open-raw-video',
  loadEvents: 'kamo:project-events',
  loadTranscript: 'kamo:project-transcript',
  saveTranscript: 'kamo:project-transcript-save',
  openHome: 'kamo:home-open',
  pickBackgroundImage: 'kamo:background-image-pick',
  projectsChanged: 'kamo:projects-changed',
  listPlaylists: 'kamo:playlists-list',
  createPlaylist: 'kamo:playlist-create',
  renamePlaylist: 'kamo:playlist-rename',
  deletePlaylist: 'kamo:playlist-delete',
  addToPlaylist: 'kamo:playlist-add',
  removeFromPlaylist: 'kamo:playlist-remove',
  reorderPlaylist: 'kamo:playlist-reorder',
  playlistsChanged: 'kamo:playlists-changed',
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
  getAgentSetup: 'kamo:agent-setup-get',
  openAgentDocs: 'kamo:agent-docs-open',
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
  getPacks: 'kamo:packs-get',
  refreshPacks: 'kamo:packs-refresh',
  installPack: 'kamo:packs-install',
  pausePack: 'kamo:packs-pause',
  cancelPack: 'kamo:packs-cancel',
  removePack: 'kamo:packs-remove',
  packsChanged: 'kamo:packs-changed',
  transcribeProject: 'kamo:transcription-start',
  cancelTranscription: 'kamo:transcription-cancel',
  getTranscriptionJobs: 'kamo:transcription-jobs',
  transcriptionChanged: 'kamo:transcription-changed',
  takeTranscribeAudioJob: 'kamo:transcribe-audio-job',
  writeTranscribeAudio: 'kamo:transcribe-audio-write',
  finishTranscribeAudio: 'kamo:transcribe-audio-finish',
} as const
