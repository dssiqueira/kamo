import type { CursorSettings, Project, Style } from '@kamo/core'

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
  /** A project was saved, renamed, deleted or recorded. Returns unsubscribe. */
  onProjectsChanged(listener: () => void): () => void

  // Settings (F-01 remembered display, F-08 last style as the default).
  getSettings(): Promise<AppSettings>
  updateSettings(update: SettingsUpdate): Promise<AppSettings>
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

/** `app-data/settings.json` (docs/data-model.md). */
export interface AppSettings {
  version: 1
  /** Display picked last time (F-01). */
  lastDisplayId?: string
  /** Style and cursor used last: defaults for new recordings (F-08). */
  lastStyle?: Style
  lastCursor?: CursorSettings
}

export type SettingsUpdate = Partial<Omit<AppSettings, 'version'>>

/**
 * Main rejects IPC calls with `Error('kamo-error:<code>')`; Electron wraps the message, so
 * the renderer finds the code with `ipcErrorCode`.
 */
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
  | { kind: 'saved'; projectId: string; warning?: 'display_lost' | 'disk_full' }
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
  recordingStatus: 'kamo:recording-status',
  listProjects: 'kamo:projects-list',
  loadProject: 'kamo:project-load',
  saveProject: 'kamo:project-save',
  renameProject: 'kamo:project-rename',
  deleteProject: 'kamo:project-delete',
  showProjectInFolder: 'kamo:project-show-in-folder',
  openEditor: 'kamo:editor-open',
  projectsChanged: 'kamo:projects-changed',
  getSettings: 'kamo:settings-get',
  updateSettings: 'kamo:settings-update',
} as const
