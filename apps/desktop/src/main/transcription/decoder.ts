// The audio for whisper (A-05): a hidden renderer page decodes the voice track with WebCodecs
// (mediabunny, the same decoder the export uses; no FFmpeg in the app, D-019) and streams 16kHz
// mono PCM here, where it becomes a WAV in the job's work folder. One window per job, closed
// when it ends; only that window may talk to its job.
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { open, type FileHandle } from 'node:fs/promises'
import { wavHeader } from '@kamo/core'
import { IpcChannel } from '../../shared/api.ts'
import type { TranscribeAudioJob, TranscribeAudioResult } from '../../shared/packs.ts'
import { createAppWindow } from '../windows.ts'
import type { DecodeRequest } from './service.ts'

interface PendingDecode {
  request: DecodeRequest
  window: BrowserWindow
  /** Read once: a destroyed window no longer has webContents. */
  contentsId: number
  file: FileHandle
  dataBytes: number
  writes: Promise<unknown>
  onProgress(fraction: number): void
  resolve(): void
  reject(error: unknown): void
}

export class DecodeError extends Error {
  constructor(readonly code: string) {
    super(`audio decode failed: ${code}`)
    this.name = 'DecodeError'
  }
}

const HEADER_BYTES = 44

export function createAudioDecoder() {
  const pending = new Map<number, PendingDecode>()

  const owned = (event: IpcMainInvokeEvent): PendingDecode => {
    const job = pending.get(event.sender.id)
    if (!job) throw new Error('Untrusted IPC sender')
    return job
  }

  const settle = async (job: PendingDecode, error?: unknown) => {
    if (pending.get(job.contentsId) !== job) return
    pending.delete(job.contentsId)
    try {
      await job.writes
      if (!error) await job.file.write(wavHeader(job.dataBytes), 0, HEADER_BYTES, 0)
    } catch (writeError) {
      error ??= writeError
    } finally {
      await job.file.close().catch(() => {})
      if (!job.window.isDestroyed()) job.window.destroy()
    }
    if (error) job.reject(error)
    else job.resolve()
  }

  ipcMain.handle(IpcChannel.takeTranscribeAudioJob, (event): TranscribeAudioJob => {
    const { request } = owned(event)
    return { ...request }
  })
  ipcMain.handle(IpcChannel.writeTranscribeAudio, (event, bytes: unknown, progress: unknown) => {
    const job = owned(event)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength % 2 !== 0) {
      throw new Error('PCM chunk must be 16-bit bytes')
    }
    const at = HEADER_BYTES + job.dataBytes
    job.dataBytes += bytes.byteLength
    job.writes = job.writes.then(() => job.file.write(bytes, 0, bytes.byteLength, at))
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      job.onProgress(Math.min(1, Math.max(0, progress)))
    }
    return job.writes.then(() => undefined)
  })
  ipcMain.handle(IpcChannel.finishTranscribeAudio, (event, result: unknown) => {
    const job = owned(event)
    const outcome = result as TranscribeAudioResult | null
    void settle(job, outcome?.ok === true ? undefined : new DecodeError(errorCode(outcome)))
  })

  return {
    decode(
      request: DecodeRequest,
      wavPath: string,
      signal: AbortSignal,
      onProgress: (fraction: number) => void,
    ): Promise<void> {
      signal.throwIfAborted()
      return open(wavPath, 'w').then(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const window = createAppWindow('transcribe-audio', {
              show: false,
              width: 240,
              height: 120,
              skipTaskbar: true,
              focusable: false,
            })
            const job: PendingDecode = {
              request,
              window,
              contentsId: window.webContents.id,
              file,
              dataBytes: 0,
              writes: file.write(new Uint8Array(HEADER_BYTES)),
              onProgress,
              resolve,
              reject,
            }
            pending.set(job.contentsId, job)
            const fail = (code: string) => () => void settle(job, new DecodeError(code))
            window.webContents.once('render-process-gone', fail('renderer_gone'))
            window.once('closed', fail('window_closed'))
            signal.addEventListener('abort', () => void settle(job, signal.reason), { once: true })
          }),
      )
    },
  }
}

function errorCode(result: TranscribeAudioResult | null): string {
  if (result && result.ok === false && typeof result.code === 'string') {
    return result.code.slice(0, 64)
  }
  return 'unknown'
}
