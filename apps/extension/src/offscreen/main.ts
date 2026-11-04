// Offscreen document: the only place the extension records (the MV3 service worker can't).
// It has no UI; the background drives it with OffscreenRequest messages.
import {
  isOffscreenRequest,
  type Notice,
  type OffscreenEvent,
  type OffscreenRequest,
  type OffscreenResponse,
} from '../shared/messages.ts'
import { OpfsProjectStore } from '../storage/opfs-store.ts'
import { CaptureError, TabRecording } from './tab-recording.ts'

const store = new OpfsProjectStore()
let recording: TabRecording | null = null

function emit(event: OffscreenEvent): void {
  void chrome.runtime.sendMessage(event).catch(() => undefined)
}

function failure(error: unknown): OffscreenResponse {
  const notice: Notice =
    error instanceof CaptureError
      ? error.notice
      : { key: 'extension.errors.captureFailed', tone: 'error' }
  return { ok: false, notice }
}

async function handle(request: OffscreenRequest): Promise<OffscreenResponse> {
  switch (request.type) {
    case 'prepare': {
      if (recording) await recording.cancel()
      const id = request.projectId
      recording = await TabRecording.prepare({
        store,
        request,
        onClock: (clock) => emit({ target: 'background', type: 'clock', projectId: id, clock }),
        onFinishedByItself: (notices) => {
          recording = null
          emit({ target: 'background', type: 'finished', projectId: id, notices })
        },
      })
      return { ok: true }
    }
    case 'start': {
      if (!recording) return failure(null)
      try {
        return { ok: true, clock: await recording.start() }
      } catch (error) {
        await recording.cancel().catch(() => undefined)
        recording = null
        return failure(error)
      }
    }
    case 'pause':
      await recording?.pause()
      return { ok: true }
    case 'resume':
      await recording?.resume()
      return { ok: true }
    case 'stop': {
      const current = recording
      if (!current) return { ok: true, notices: [] }
      const notices = await current.finish()
      recording = null
      return { ok: true, notices }
    }
    case 'cancel':
      await recording?.cancel()
      recording = null
      return { ok: true }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) return false
  handle(message).then(sendResponse, (error: unknown) => sendResponse(failure(error)))
  return true
})
