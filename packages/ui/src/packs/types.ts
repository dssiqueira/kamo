// What the packs and transcription screens show (A-07, A-05). The UI does not know where it
// runs (rule 1): the desktop maps main's pack manager onto these shapes.

export type PackViewId = 'transcribe-light' | 'transcribe-accurate'

export type PackViewState =
  'not_installed' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'failed'

/** A transcription model (D-042): downloaded from Hugging Face, run by the bundled whisper. */
export interface PackView {
  id: PackViewId
  quality: 'light' | 'accurate'
  /** Exact download size. */
  sizeBytes: number
  installedVersion: string | null
  /** Installed from another file than the one this app pins (a later app updated it). */
  updateAvailable: boolean
  state: PackViewState
  progress: { receivedBytes: number; totalBytes: number } | null
  /** Stable code (`offline`, `source_unreachable`, `checksum_mismatch`, `disk_space`...). */
  error: string | null
  requiredBytes: number | null
}

export interface PacksView {
  packs: readonly PackView[]
  /** The transcription program is in this build (`missing`: a development build without it). */
  program: 'ready' | 'missing'
}

export interface PackActions {
  /** Download, resume, try again, or update. */
  onInstall(id: PackViewId): void
  onPause(id: PackViewId): void
  onCancel(id: PackViewId): void
  /** Resolves with an error code (`pack_busy`), or null when removed. */
  onRemove(id: PackViewId): Promise<string | null>
}

export type TranscriptionLanguageChoice =
  'auto' | 'en' | 'pt' | 'es' | 'zh' | 'ja' | 'de' | 'fr' | 'ko'

/** A recording's transcription, as a project card shows it. */
export type CardTranscriptState =
  | { state: 'none' }
  | { state: 'queued' }
  | { state: 'running'; progress: number }
  | { state: 'done' }
  | { state: 'failed'; error: string | null }
  | { state: 'no_audio' }
