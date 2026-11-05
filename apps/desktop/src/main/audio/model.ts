// Pure pieces of desktop audio (F-04, D-024): sources from settings, sync offsets, file names
// and validation of what the recorder page sends. No Electron here, so it is tested in Node.
import { z } from 'zod'
import type { AppSettings } from '../../shared/api.ts'
import type {
  AudioSources,
  AudioSupport,
  AudioTrackName,
  RecorderReport,
} from '../../shared/audio.ts'

/** What the next recording captures: the Home toggles saved in settings (F-01, F-04). */
export function audioSourcesFromSettings(
  settings: AppSettings,
  support: AudioSupport,
): AudioSources {
  return {
    mic: settings.micEnabled === true,
    micDeviceId: settings.micDeviceId ? settings.micDeviceId : null,
    system: support.system && settings.systemAudioEnabled === true,
  }
}

export function hasAnySource(sources: AudioSources): boolean {
  return sources.mic || sources.system
}

/**
 * Offset of an audio track on the video timeline (Project.audio.*.offsetMs). Both times are
 * `Date.now()` on the same machine: when the track's MediaRecorder fired `start`, and when
 * the capture helper confirmed its first frame (`started`). Negative: the audio began first,
 * and export skips its first `-offset` ms.
 */
export function trackOffsetMs(audioStartedAt: number, videoStartedAt: number): number {
  return Math.round(audioStartedAt - videoStartedAt)
}

/**
 * docs/data-model.md: `audio.m4a` (microphone) and `system.m4a` (computer sound). If this
 * Chromium could not record AAC/MP4, the Opus/WebM fallback keeps the same base name.
 */
export function audioFileName(track: AudioTrackName, mimeType: string): string {
  const base = track === 'mic' ? 'audio' : 'system'
  return `${base}.${mimeType.startsWith('audio/webm') ? 'webm' : 'm4a'}`
}

const Track = z.enum(['mic', 'system'])
const Status = z.enum(['off', 'starting', 'live', 'denied', 'unavailable', 'unsupported'])
const Level = z.number().min(0).max(1)

export const AudioSourcesSchema = z.strictObject({
  mic: z.boolean(),
  micDeviceId: z.string().max(512).nullable(),
  system: z.boolean(),
})

const RecorderReportSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({
    type: z.literal('status'),
    status: z.strictObject({
      devices: z
        .array(z.strictObject({ id: z.string().max(512), label: z.string().max(512) }))
        .max(64),
      mic: Status,
      system: Status,
    }),
  }),
  z.strictObject({
    type: z.literal('levels'),
    levels: z.strictObject({ mic: Level, system: Level }),
  }),
  z.strictObject({
    type: z.literal('started'),
    track: Track,
    at: z.number().int().positive(),
    mimeType: z.string().max(128),
  }),
  z.strictObject({
    type: z.literal('failed'),
    track: Track,
    reason: z.enum(['denied', 'unavailable']),
  }),
  z.strictObject({ type: z.literal('lost'), track: Track }),
  z.strictObject({ type: z.literal('stopped'), track: Track }),
])

/** Validates a report from the recorder page; null when it is malformed. */
export function parseRecorderReport(value: unknown): RecorderReport | null {
  const result = RecorderReportSchema.safeParse(value)
  return result.success ? (result.data as RecorderReport) : null
}

export function parseAudioSources(value: unknown): AudioSources | null {
  if (value === null) return null
  const result = AudioSourcesSchema.safeParse(value)
  if (!result.success) throw new Error('invalid audio sources')
  return result.data
}

export function parseTrack(value: unknown): AudioTrackName {
  return Track.parse(value)
}

/**
 * Permission policy (rule 3: nothing more than needed). Only the hidden audio recorder page
 * may open audio devices: `media` with audio only (never the camera), and `display-capture`,
 * whose video is dropped at once and is only there to reach the loopback audio (Windows).
 */
export function isAudioPermissionAllowed(query: {
  permission: string
  fromRecorder: boolean
  mediaTypes?: readonly string[]
}): boolean {
  if (!query.fromRecorder) return false
  if (query.permission === 'display-capture') return true
  if (query.permission !== 'media') return false
  const types = query.mediaTypes ?? []
  return types.length > 0 && types.every((type) => type === 'audio')
}
