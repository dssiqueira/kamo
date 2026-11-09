// An encoder outside WebCodecs (D-011 plan B, D-040): the desktop's optional "Video
// compatibility" pack (FFmpeg) implements it in the main process. Core still paints every
// frame with the preview's renderer (rule 11) and mixes the sound; the platform only turns
// raw pixels and PCM into an MP4 it saves where the FileSink would have.

export interface ExternalEncodeOptions {
  /** wanted output name, e.g. `Demo 16x9 1080p30.mp4`; the platform resolves collisions */
  fileName: string
  width: number
  height: number
  fps: number
  /** H.264 target bitrate (encoder-config.ts); the platform may scale it for its codec */
  bitrate: number
  /** null: no sound track */
  audio: { sampleRate: number; channels: number } | null
}

export interface ExternalEncodeSession {
  /** final file name after collision handling */
  readonly name: string
  /**
   * Interleaved signed 16-bit PCM (`sampleRate`, `channels` from the options), in order. All of
   * it comes before the first frame.
   */
  writeAudio(pcm: Int16Array): Promise<void>
  /** One output frame: `width × height` RGBA pixels, row by row, in order. */
  writeFrame(rgba: Uint8Array): Promise<void>
  /** Waits for the encoder, saves the file and returns where it went and what encoded it. */
  finish(): Promise<{ path: string; codec: string; hardware: boolean }>
  /** Cancel or failure: stops the encoder and deletes the incomplete file. */
  abort(reason?: unknown): Promise<void>
}

export interface ExternalVideoEncoder {
  /** Throws ExportError (`encoder_unavailable` when it cannot encode at all). */
  open(options: ExternalEncodeOptions): Promise<ExternalEncodeSession>
}
