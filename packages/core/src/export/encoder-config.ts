// H.264 encoder settings for the export (F-11, A-01): the AVC level each size and frame rate
// needs, the bitrate, and the fallback when this machine's encoder cannot make what was asked
// (4K60 is beyond many hardware encoders). Pure apart from asking WebCodecs, which is
// injectable so the choice is tested in Node.
import type { Aspect, Fps } from '../project/schema.ts'
import { outputSize, type Resolution } from '../render/layout.ts'
import type { Size } from '../render/types.ts'

/** H.264 bits per pixel per frame at 30fps: generous, because screen text blurs fast. */
export const VIDEO_BITS_PER_PIXEL = 0.16

/**
 * Bitrate for a size and frame rate. Above 30fps each extra frame costs half as much: frames
 * that close together are mostly alike, so 60fps gets 1.5× the 30fps bitrate, not 2×.
 */
export function exportBitrate(size: Size, fps: number): number {
  const effectiveFps = fps <= 30 ? fps : 30 + (fps - 30) / 2
  return Math.round(size.width * size.height * effectiveFps * VIDEO_BITS_PER_PIXEL)
}

interface AvcLevel {
  /** the level byte of the codec string (`avc1.6400<level>`), in hex */
  hex: string
  /** max frame size, in 16×16 macroblocks */
  maxFs: number
  /** max macroblocks per second */
  maxMbps: number
  /** max bitrate (Main profile; High allows 1.25×, left as headroom) */
  maxBitrate: number
}

/** H.264 Annex A, from 4.0 (every hardware encoder takes it) up to 5.2 (4K60). */
const AVC_LEVELS: readonly AvcLevel[] = [
  { hex: '28', maxFs: 8_192, maxMbps: 245_760, maxBitrate: 20_000_000 }, // 4.0
  { hex: '29', maxFs: 8_192, maxMbps: 245_760, maxBitrate: 50_000_000 }, // 4.1
  { hex: '2a', maxFs: 8_704, maxMbps: 522_240, maxBitrate: 50_000_000 }, // 4.2
  { hex: '32', maxFs: 22_080, maxMbps: 589_824, maxBitrate: 135_000_000 }, // 5.0
  { hex: '33', maxFs: 36_864, maxMbps: 983_040, maxBitrate: 240_000_000 }, // 5.1
  { hex: '34', maxFs: 36_864, maxMbps: 2_073_600, maxBitrate: 240_000_000 }, // 5.2
  { hex: '3c', maxFs: 139_264, maxMbps: 4_177_920, maxBitrate: 240_000_000 }, // 6.0
]

/**
 * The lowest AVC level that fits the frame size, macroblock rate and bitrate, e.g. 1080p30 →
 * 4.0 (`28`), 1080p60 → 4.2 (`2a`), 4K30 → 5.1 (`33`), 4K60 → 5.2 (`34`).
 */
export function avcLevel(size: Size, fps: number, bitrate = exportBitrate(size, fps)): string {
  const wide = Math.ceil(size.width / 16)
  const high = Math.ceil(size.height / 16)
  const fs = wide * high
  for (const level of AVC_LEVELS) {
    // A frame side may not exceed √(8 × MaxFS) macroblocks (Annex A.3.1).
    const side = Math.sqrt(8 * level.maxFs)
    if (fs > level.maxFs || wide > side || high > side) continue
    if (fs * fps > level.maxMbps || bitrate > level.maxBitrate) continue
    return level.hex
  }
  return (AVC_LEVELS.at(-1) as AvcLevel).hex
}

/** High first, then Main and Constrained Baseline for encoders that refuse High. */
export function avcCodecs(size: Size, fps: number, bitrate?: number): string[] {
  const level = avcLevel(size, fps, bitrate)
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.42e0${level}`]
}

export interface VideoEncoderChoice {
  codec: string
  hardware: boolean
}

/** What chooseVideoEncoder needs from WebCodecs' `VideoEncoder`. */
export interface EncoderSupport {
  isConfigSupported(config: VideoEncoderConfig): Promise<{ supported?: boolean }>
}

/**
 * H.264 encoder for this size: hardware first (fast, D-011), else software with a warning.
 * Null when WebCodecs has none for it.
 */
export async function chooseVideoEncoder(
  size: Size,
  fps: number,
  bitrate: number,
  encoder: EncoderSupport | undefined = globalThis.VideoEncoder,
): Promise<VideoEncoderChoice | null> {
  if (!encoder) return null
  const codecs = avcCodecs(size, fps, bitrate)
  for (const hardware of [true, false]) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = {
        codec,
        width: size.width,
        height: size.height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: hardware ? 'prefer-hardware' : 'prefer-software',
        avc: { format: 'avc' },
      }
      const support = await encoder.isConfigSupported(config).catch(() => null)
      if (support?.supported) return { codec, hardware }
    }
  }
  return null
}

export interface VideoSettings {
  resolution: Resolution
  fps: Fps
}

/**
 * What to try, best first, when `wanted` cannot be encoded: the same resolution at 30fps,
 * then 1080p at the asked frame rate, then 1080p30. Keeps the resolution before the frame rate
 * because 4K is usually asked for sharp text, and a 4K60 refusal is most often the rate.
 */
export function videoSettingsFallbacks(wanted: VideoSettings): VideoSettings[] {
  const all: VideoSettings[] = [
    wanted,
    { resolution: wanted.resolution, fps: 30 },
    { resolution: '1080p', fps: wanted.fps },
    { resolution: '1080p', fps: 30 },
  ]
  return all.filter(
    (s, i) => all.findIndex((o) => o.resolution === s.resolution && o.fps === s.fps) === i,
  )
}

export interface ResolvedVideoSettings extends VideoSettings {
  encoder: VideoEncoderChoice
  /** true when this machine could not encode what was asked and a lower setting is used */
  fallback: boolean
}

/**
 * The settings this machine can export a format at (A-01): what was asked if the encoder
 * takes it, else the first fallback it takes. Null when it has no H.264 encoder at all.
 */
export async function resolveVideoSettings(
  aspect: Aspect,
  wanted: VideoSettings,
  encoder: EncoderSupport | undefined = globalThis.VideoEncoder,
): Promise<ResolvedVideoSettings | null> {
  const candidates = videoSettingsFallbacks(wanted)
  for (const [i, settings] of candidates.entries()) {
    const size = outputSize(aspect, settings.resolution)
    const choice = await chooseVideoEncoder(
      size,
      settings.fps,
      exportBitrate(size, settings.fps),
      encoder,
    )
    if (choice) return { ...settings, encoder: choice, fallback: i > 0 }
  }
  return null
}

/**
 * 4K is only offered when the recording has more pixels than a 1080p frame can show (A-01):
 * a 1080p screen exported at 4K would only be upscaled. A side 25% past 1080p is enough (an
 * ultrawide 2560×1080, a 1440p, Retina or 4K display), because 1080p would scale those down
 * and lose detail that 4K keeps, and zooms crop into the recording.
 */
export function canExport4k(source: { width: number; height: number }): boolean {
  const long = Math.max(source.width, source.height)
  const short = Math.min(source.width, source.height)
  return long > 1920 * 1.25 || short > 1080 * 1.25
}
