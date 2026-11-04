// Where exported videos go. The desktop writes to the Videos folder (or the one the user
// picked); the extension hands the file to chrome.downloads (F-11, E-04).

export interface FileSink {
  /** Opens a new output file. The sink resolves name collisions by adding " (2)" (F-11). */
  open(fileName: string, mimeType: string): Promise<SinkFile>
}

export interface SinkFile {
  /** Final name after collision handling, e.g. `Demo 16x9 1080p30 (2).mp4`. */
  readonly name: string
  readonly stream: WritableStream<Uint8Array>
  /** Finishes the file and returns where it ended up (path or download id). */
  commit(): Promise<string>
  /** Cancel or failure: deletes the incomplete file (F-11). */
  abort(reason?: unknown): Promise<void>
}
