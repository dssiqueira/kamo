// The GIF encoder off the main thread (A-02): quantization and LZW cost tens of ms per frame,
// which would freeze the editor. Messages are handled in order; each answer carries the bytes
// to append to the file (transferred, not copied).
import { createGifFrameEncoder, type GifFrameEncoder } from './gif.ts'
import type { GifWorkerReply, GifWorkerRequest } from './gif-worker-protocol.ts'

interface WorkerScope {
  onmessage: ((event: MessageEvent<GifWorkerRequest>) => void) | null
  postMessage(message: GifWorkerReply, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let encoder: GifFrameEncoder | null = null

scope.onmessage = ({ data }) => {
  try {
    let bytes: Uint8Array
    if (data.type === 'init') {
      encoder = createGifFrameEncoder(data.options)
      bytes = new Uint8Array(0)
    } else if (!encoder) {
      throw new Error('gif worker: not initialized')
    } else if (data.type === 'frame') {
      bytes = encoder.addFrame(new Uint8Array(data.rgba), data.delayMs)
    } else {
      bytes = encoder.finish()
    }
    scope.postMessage({ type: 'bytes', bytes }, [bytes.buffer])
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
