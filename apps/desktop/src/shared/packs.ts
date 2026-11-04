// Optional packs (A-07, D-019) and local transcription (A-05): what main tells the windows.
// Shapes only; main owns downloads, installs and the transcription queue.

export type PackId = 'transcribe-light' | 'transcribe-accurate'
export const PACK_IDS = [
  'transcribe-light',
  'transcribe-accurate',
] as const satisfies readonly PackId[]

export type PackState =
  'not_installed' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'failed'

/** Stable codes the UI explains (packages/i18n `packs.errors.*`). */
export type PackErrorCode =
  | 'offline'
  | 'download_failed'
  | 'checksum_mismatch'
  | 'disk_space'
  | 'unsupported_platform'
  | 'manifest_invalid'
  | 'pack_busy'
  | 'install_failed'
  | 'unknown_pack'

export interface PackInfo {
  id: PackId
  kind: 'transcription'
  quality: 'light' | 'accurate'
  /** Download size for this computer: exact once the list loaded, approximate before. */
  sizeBytes: number
  sizeExact: boolean
  installedVersion: string | null
  /** From the list on GitHub; null until it loaded. */
  availableVersion: string | null
  /** Installed, and the list has another version (installed only with confirmation). */
  updateAvailable: boolean
  state: PackState
  /** While downloading or paused. */
  progress: { receivedBytes: number; totalBytes: number } | null
  error: PackErrorCode | null
  /** With `disk_space`: how much free space the download needs. */
  requiredBytes: number | null
}

export interface PacksStatus {
  packs: PackInfo[]
  /**
   * The list of packs on GitHub: only fetched when the user opens Settings → Packs or asks to
   * transcribe (never on its own).
   */
  catalog: 'idle' | 'loading' | 'ready' | 'error'
  catalogError: PackErrorCode | null
}

export type TranscriptionLanguage = 'auto' | 'en' | 'pt' | 'es' | 'zh' | 'ja'
export const TRANSCRIPTION_LANGUAGES = [
  'auto',
  'en',
  'pt',
  'es',
  'zh',
  'ja',
] as const satisfies readonly TranscriptionLanguage[]

export type TranscriptionJobState =
  'queued' | 'preparing' | 'transcribing' | 'done' | 'failed' | 'no_audio' | 'cancelled'

export type TranscriptionErrorCode =
  | 'pack_missing'
  | 'project_not_found'
  | 'audio_unreadable'
  | 'whisper_failed'
  | 'output_invalid'
  /** A-06: corrected through the captions meanwhile; the new transcript was not written. */
  | 'transcript_edited'

export interface TranscriptionJob {
  projectId: string
  state: TranscriptionJobState
  /** 0..1 over the whole job (audio preparation, then whisper). */
  progress: number
  error: TranscriptionErrorCode | null
}

/** Hidden decoder page (main → page): the track to turn into 16kHz audio for whisper. */
export interface TranscribeAudioJob {
  projectId: string
  file: 'audio.m4a' | 'system.m4a'
  offsetMs: number
  durationMs: number
}

export type TranscribeAudioResult = { ok: true } | { ok: false; code: string }
