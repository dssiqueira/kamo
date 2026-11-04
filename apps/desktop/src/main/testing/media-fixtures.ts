// Test-only: tiny but well-formed media files, like the ones MediaRecorder and the native
// helper stream. Packets are never decoded, only indexed, so the payloads are placeholders.
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from 'mediabunny'

// A minimal H.264 decoder config (baseline, 640×360).
const SPS = [0x67, 0x42, 0x00, 0x1f, 0xe9, 0x02, 0x80, 0xf6, 0x40]
const PPS = [0x68, 0xce, 0x3c, 0x80]
const AVCC = new Uint8Array([
  1,
  0x42,
  0,
  0x1f,
  0xff,
  0xe1,
  0,
  SPS.length,
  ...SPS,
  1,
  0,
  PPS.length,
  ...PPS,
])
// AudioSpecificConfig: AAC-LC, 48 kHz, stereo.
const AAC_CONFIG = new Uint8Array([0x11, 0x90])

/** `seconds` of 640×360 video at 30fps, fragmented (ftyp, moov, 0.5s moof+mdat, mfra). */
export async function fragmentedVideoMp4(seconds = 3): Promise<Uint8Array> {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }),
    target,
  })
  const source = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { frameRate: 30 })
  await output.start()
  for (let i = 0; i < seconds * 30; i++) {
    const key = i % 15 === 0
    const data = new Uint8Array([0, 0, 0, 4, key ? 0x65 : 0x41, 1, 2, 3, ...new Array(64).fill(i)])
    await source.add(
      new EncodedPacket(data, key ? 'key' : 'delta', i / 30, 1 / 30),
      i === 0
        ? {
            decoderConfig: {
              codec: 'avc1.42001f',
              codedWidth: 640,
              codedHeight: 360,
              description: AVCC,
            },
          }
        : undefined,
    )
  }
  await output.finalize()
  return new Uint8Array(target.buffer!)
}

const AAC_FRAME_S = 1024 / 48_000

/** `seconds` of AAC audio as a fragmented MP4, like MediaRecorder's `audio/mp4`. */
export async function fragmentedAudioMp4(seconds = 2): Promise<Uint8Array> {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }),
    target,
  })
  const source = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(source)
  await output.start()
  const frames = Math.round(seconds / AAC_FRAME_S)
  for (let i = 0; i < frames; i++) {
    await source.add(
      new EncodedPacket(new Uint8Array(96).fill(i % 256), 'key', i * AAC_FRAME_S, AAC_FRAME_S),
      i === 0
        ? {
            decoderConfig: {
              codec: 'mp4a.40.2',
              numberOfChannels: 2,
              sampleRate: 48_000,
              description: AAC_CONFIG,
            },
          }
        : undefined,
    )
  }
  await output.finalize()
  return new Uint8Array(target.buffer!)
}

/** `seconds` of Opus audio in WebM, like MediaRecorder's fallback. */
export async function opusWebm(seconds = 2): Promise<Uint8Array> {
  const target = new BufferTarget()
  const output = new Output({ format: new WebMOutputFormat(), target })
  const source = new EncodedAudioPacketSource('opus')
  output.addAudioTrack(source)
  await output.start()
  const frame = 0.02
  for (let i = 0; i < Math.round(seconds / frame); i++) {
    await source.add(
      new EncodedPacket(new Uint8Array(40).fill(i % 256), 'key', i * frame, frame),
      i === 0
        ? { decoderConfig: { codec: 'opus', numberOfChannels: 2, sampleRate: 48_000 } }
        : undefined,
    )
  }
  await output.finalize()
  return new Uint8Array(target.buffer!)
}

/** Top-level MP4 boxes: [type, offset, size]. */
export function mp4Boxes(bytes: Uint8Array): [string, number, number][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: [string, number, number][] = []
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset)
    found.push([String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), offset, size])
    offset += size
  }
  return found
}

/** Only the header boxes (ftyp + moov), like a recorder page that died before its first chunk. */
export function headerOnly(bytes: Uint8Array): Uint8Array {
  const moov = mp4Boxes(bytes).find(([type]) => type === 'moov')
  if (!moov) throw new Error('no moov')
  return bytes.slice(0, moov[1] + moov[2])
}
