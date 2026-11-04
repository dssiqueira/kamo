// Where exported videos go. The desktop writes to the Videos folder (or the one the user
// picked); the extension hands the file to chrome.downloads (F-11, E-04).

export interface FileSink {
  /** Opens a new output file. The sink resolves name collisions by adding " (2)" (F-11). */
  open(fileName: string, mimeType: string): Promise<SinkFile>
}

/**
 * One positioned write. The MP4 muxer writes the media first and then patches the header
 * (moov) at the start of the file, so writes are not append-only. Same shape as the
 * `FileSystemWritableFileStream` write params (OPFS in the extension) and mediabunny's
 * `StreamTargetChunk`.
 */
export interface SinkChunk {
  type: 'write'
  data: Uint8Array
  /** byte offset in the file */
  position: number
}

export interface SinkFile {
  /** Final name after collision handling, e.g. `Demo 16x9 1080p30 (2).mp4`. */
  readonly name: string
  /**
   * Receives the file's bytes. Closing the stream does not finish the file: only `commit`
   * does, so an aborted stream never leaves a half-written file under the final name.
   */
  readonly stream: WritableStream<SinkChunk>
  /** Finishes the file and returns where it ended up (path or download id). */
  commit(): Promise<string>
  /** Cancel or failure: deletes the incomplete file (F-11). */
  abort(reason?: unknown): Promise<void>
}
