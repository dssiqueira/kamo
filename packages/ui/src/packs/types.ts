// What the packs and transcription screens show (A-07, A-05). The UI does not know where it
// runs (rule 1): the desktop maps main's pack manager onto these shapes.

export type PackViewId = 'transcribe-light' | 'transcribe-accurate'

export type PackViewState =
  'not_installed' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'failed'

export interface PackView {
  id: PackViewId
  quality: 'light' | 'accurate'
  sizeBytes: number
  /** False: an estimate shown before the list of packs loaded. */
  sizeExact: boolean
  installedVersion: string | null
  availableVersion: string | null
  updateAvailable: boolean
  state: PackViewState
  progress: { receivedBytes: number; totalBytes: number } | null
  /** Stable code (`offline`, `checksum_mismatch`, `disk_space`...). */
  error: string | null
  requiredBytes: number | null
}

export interface PacksView {
  packs: readonly PackView[]
  catalog: 'idle' | 'loading' | 'ready' | 'error'
  catalogError: string | null
}

export interface PackActions {
  onInstall(id: PackViewId): void
  onPause(id: PackViewId): void
  onCancel(id: PackViewId): void
  /** Resolves with an error code (`pack_busy`), or null when removed. */
  onRemove(id: PackViewId): Promise<string | null>
  /** Loads the list again (after an error). */
  onRetryCatalog(): void
}

export type TranscriptionLanguageChoice = 'auto' | 'en' | 'pt' | 'es' | 'zh' | 'ja'

/** A recording's transcription, as a project card shows it. */
export type CardTranscriptState =
  | { state: 'none' }
  | { state: 'queued' }
  | { state: 'running'; progress: number }
  | { state: 'done' }
  | { state: 'failed'; error: string | null }
  | { state: 'no_audio' }
