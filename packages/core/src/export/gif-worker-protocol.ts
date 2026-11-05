// Messages between the GIF export and its worker (gif.worker.ts).
import type { GifFrameEncoderOptions } from './gif.ts'

export type GifWorkerRequest =
  | { type: 'init'; options: GifFrameEncoderOptions }
  /** an RGBA frame, transferred */
  | { type: 'frame'; rgba: ArrayBuffer; delayMs: number }
  | { type: 'finish' }

export type GifWorkerReply =
  { type: 'bytes'; bytes: Uint8Array } | { type: 'error'; message: string }
