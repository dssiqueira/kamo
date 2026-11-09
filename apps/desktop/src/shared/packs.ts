// Optional packs (A-07, D-019, D-042) and local transcription (A-05): what main tells the
// windows. Shapes only; main owns downloads, installs and the transcription queue. A pack is
// one whisper model, downloaded from Hugging Face; the program (whisper-cli) ships in the app.

export type TranscriptionPackId = 'transcribe-light' | 'transcribe-accurate'
export type PackId = TranscriptionPackId
export const TRANSCRIPTION_PACK_IDS = [
  'transcribe-light',
  'transcribe-accurate',
] as const satisfies readonly TranscriptionPackId[]
export const PACK_IDS: readonly PackId[] = TRANSCRIPTION_PACK_IDS

export type PackState =
  'not_installed' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'failed'

/** Stable codes the UI explains (packages/i18n `packs.errors.*`). */
export type PackErrorCode =
  /** This computer has no connection. */
  | 'offline'
  /** Online, but Hugging Face did not answer, or stopped sending: try again later. */
  | 'source_unreachable'
  /** Hugging Face answered with an error, or sent something other than the pinned file. */
  | 'download_failed'
  /** The file arrived, but without the pinned SHA-256: it was deleted. */
  | 'checksum_mismatch'
  | 'disk_space'
  | 'pack_busy'
  | 'install_failed'
  | 'unknown_pack'

export interface PackInfo {
  id: PackId
  quality: 'light' | 'accurate'
  /** Download size: the pinned file's exact size. */
  sizeBytes: number
  /** The Hugging Face revision installed; null when not installed. */
  installedVersion: string | null
  /** Installed from another pinned file than this app's (a later app pinned a new one). */
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
   * The whisper-cli program that ships inside the app (D-042): `missing` in a development
   * build where it was not built (apps/desktop/native/whisper/README.md), or on another OS.
   */
  program: 'ready' | 'missing'
}

export type TranscriptionLanguage = 'auto' | 'en' | 'pt' | 'es' | 'zh' | 'ja' | 'de' | 'fr' | 'ko'
export const TRANSCRIPTION_LANGUAGES = [
  'auto',
  'en',
  'pt',
  'es',
  'zh',
  'ja',
  'de',
  'fr',
  'ko',
] as const satisfies readonly TranscriptionLanguage[]

export type TranscriptionJobState =
  'queued' | 'preparing' | 'transcribing' | 'done' | 'failed' | 'no_audio' | 'cancelled'

export type TranscriptionErrorCode =
  | 'pack_missing'
  /** whisper-cli is not in this build (a development build that did not build it, D-042). */
  | 'program_missing'
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
