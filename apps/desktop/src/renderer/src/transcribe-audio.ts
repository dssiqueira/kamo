// Hidden audio decoder page (A-05). Main opens one per transcription: it reads the voice track
// through main (no file access in the sandbox), decodes it with WebCodecs via mediabunny (the
// export's decoder, so no FFmpeg, D-019) and streams 16kHz mono 16-bit PCM back, aligned to the
// video by core. Main writes the WAV whisper reads, then closes this window.
import { streamSpeechPcm, type PcmChunk } from '@kamo/core'
import { AudioSampleSink, CustomSource, Input, MATROSKA, MP4, QTFF, WEBM } from 'mediabunny'
import { projectMedia } from './export-platform.ts'

async function run(): Promise<void> {
  const job = await window.kamo.takeTranscribeAudioJob()
  const file = projectMedia(job.projectId, job.file)
  const input = new Input({
    source: new CustomSource({
      getSize: () => file.size(),
      read: (start, end) => file.read(start, end),
      // IPC has latency: read ahead in big steps, the access is sequential.
      prefetchProfile: 'network',
    }),
    formats: [MP4, QTFF, WEBM, MATROSKA],
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) throw new Error('audio_unreadable')
    // Audio recorded before the first video frame is skipped by core; start at 0 anyway.
    const iterator = new AudioSampleSink(track).samples(0)[Symbol.asyncIterator]()
    const next = async (): Promise<PcmChunk | null> => {
      const result = await iterator.next()
      if (result.done) return null
      const sample = result.value
      try {
        const channels: Float32Array[] = []
        for (let c = 0; c < Math.min(2, sample.numberOfChannels); c++) {
          const data = new Float32Array(sample.numberOfFrames)
          sample.copyTo(data, { planeIndex: c, format: 'f32-planar' })
          channels.push(data)
        }
        return { timestamp: sample.timestamp, sampleRate: sample.sampleRate, channels }
      } finally {
        sample.close()
      }
    }
    await streamSpeechPcm(next, {
      offsetMs: job.offsetMs,
      durationMs: job.durationMs,
      onBlock: (samples, progress) =>
        window.kamo.writeTranscribeAudio(
          new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
          progress,
        ),
    })
    await iterator.return?.()
  } finally {
    input.dispose()
  }
}

void run().then(
  () => window.kamo.finishTranscribeAudio({ ok: true }),
  (error: unknown) => {
    console.error('kamo: transcription audio failed', error)
    const code =
      error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'failed'
    return window.kamo.finishTranscribeAudio({ ok: false, code })
  },
)
