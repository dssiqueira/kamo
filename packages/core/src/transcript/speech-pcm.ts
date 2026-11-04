// Audio for transcription (A-05): one track as 16kHz mono 16-bit PCM, aligned to the video
// timeline, so whisper's times are already video times. Pure math over decoded chunks: the
// app decodes (mediabunny in a renderer) and writes the WAV; this is tested in Node.
import { createTrackReader, type PcmChunk, type StereoBlock } from '../export/audio-mix.ts'

/** What whisper.cpp expects. */
export const SPEECH_SAMPLE_RATE = 16_000
/** Read at 3× and averaged down: a cheap low-pass, so 48kHz speech does not alias. */
const OVERSAMPLE = 3
const READ_RATE = SPEECH_SAMPLE_RATE * OVERSAMPLE
/** 10 seconds per block keeps memory flat however long the recording is. */
export const SPEECH_BLOCK_FRAMES = SPEECH_SAMPLE_RATE * 10

export interface SpeechPcmOptions {
  /**
   * Where the track's first sample sits on the video timeline (project.audio.*.offsetMs):
   * negative skips the audio recorded before the first video frame, positive adds silence.
   */
  offsetMs: number
  /** Video duration: the output has exactly this length. */
  durationMs: number
  /** Called in order with each block and the fraction done (0..1]. */
  onBlock(samples: Int16Array, progress: number): Promise<void> | void
  /** Stops between blocks. */
  signal?: AbortSignal
  blockFrames?: number
}

/** Output frames for a video of this length. */
export function speechFrameCount(durationMs: number): number {
  return Math.max(0, Math.round((durationMs / 1000) * SPEECH_SAMPLE_RATE))
}

/** Streams a decoded track as 16kHz mono Int16 blocks. Returns the frames written. */
export async function streamSpeechPcm(
  next: () => Promise<PcmChunk | null>,
  options: SpeechPcmOptions,
): Promise<number> {
  const reader = createTrackReader(next, {
    startS: -options.offsetMs / 1000,
    targetRate: READ_RATE,
  })
  const total = speechFrameCount(options.durationMs)
  const blockFrames = Math.max(1, Math.floor(options.blockFrames ?? SPEECH_BLOCK_FRAMES))
  for (let start = 0; start < total; start += blockFrames) {
    options.signal?.throwIfAborted()
    const count = Math.min(blockFrames, total - start)
    const block = await reader.read(start * OVERSAMPLE, count * OVERSAMPLE)
    await options.onBlock(downmixSpeech(block, count), (start + count) / total)
  }
  return total
}

/** Averages both channels and every OVERSAMPLE frames into one 16-bit sample. */
export function downmixSpeech(block: StereoBlock, count: number): Int16Array {
  const out = new Int16Array(count)
  for (let i = 0; i < count; i++) {
    let sum = 0
    for (let k = 0; k < OVERSAMPLE; k++) {
      const j = i * OVERSAMPLE + k
      sum += (block.left[j] ?? 0) + (block.right[j] ?? 0)
    }
    out[i] = toInt16(sum / (2 * OVERSAMPLE))
  }
  return out
}

function toInt16(value: number): number {
  const clamped = value > 1 ? 1 : value < -1 ? -1 : value
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
}

/** 44-byte RIFF header of a PCM WAV whose sample data is `dataBytes` long. */
export function wavHeader(
  dataBytes: number,
  sampleRate = SPEECH_SAMPLE_RATE,
  channels = 1,
  bitsPerSample = 16,
): Uint8Array {
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  const blockAlign = (channels * bitsPerSample) / 8
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  return header
}
