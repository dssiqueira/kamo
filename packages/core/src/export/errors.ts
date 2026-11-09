// Why an export stopped. The UI maps each code to a message (export.errors.*).

export type ExportErrorCode =
  /** the user canceled; the incomplete file was deleted */
  | 'aborted'
  /** the disk filled up while writing; the incomplete file was deleted */
  | 'disk_full'
  /** any other failure writing the file */
  | 'write_failed'
  /** the recorded video could not be read or decoded */
  | 'source_unreadable'
  /** this machine has no H.264 encoder WebCodecs can use */
  | 'encoder_unavailable'
  /** the WebCodecs encoder broke in the middle of the export */
  | 'encoder_failed'
  | 'failed'

export class ExportError extends Error {
  readonly code: ExportErrorCode
  constructor(code: ExportErrorCode, options?: { cause?: unknown }) {
    super(`export failed: ${code}`, options)
    this.name = 'ExportError'
    this.code = code
  }
}

/** Things worth telling the user about a finished export. */
export type ExportWarning =
  /** no hardware H.264 encoder: exported with the software one (slower) */
  | 'software_encoder'
  /** a microphone or computer sound file could not be read; exported without it */
  | 'audio_unreadable'
  /** no AAC encoder on this machine; exported without sound */
  | 'audio_encoder_unavailable'
  /** the webcam recording could not be read; exported without the bubble (A-03) */
  | 'webcam_unreadable'
  /** the background image file is missing or could not be decoded; exported on the fallback color (A-04) */
  | 'background_unreadable'
  /**
   * this machine's encoder cannot make the asked resolution or frame rate (A-01, e.g. 4K60);
   * the file was exported at the best setting it takes, which its name says
   */
  | 'settings_fallback'

export function exportErrorCode(error: unknown): ExportErrorCode {
  if (error instanceof ExportError) return error.code
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return 'aborted'
  }
  return 'failed'
}

/** Any failure as an ExportError (an ExportError stays as it is). */
export function toExportError(error: unknown): ExportError {
  if (error instanceof ExportError) return error
  return new ExportError(exportErrorCode(error), { cause: error })
}
