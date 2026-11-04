// project.json schema (docs/data-model.md). Validated on every read: the file lives on the
// user's disk and may be corrupted or written by another Kamo version.
import { z } from 'zod'
import { SPRING } from '../spring.ts'

export const PROJECT_VERSION = 1

export const MIN_ZOOM_MS = 600
export const MIN_ZOOM_SCALE = 1
export const MAX_ZOOM_SCALE = 4
export const MIN_TRIMMED_MS = 1000

const isoDate = z.iso.datetime()
const nonNegative = z.number().nonnegative()
const positive = z.number().positive()

export const Aspect = z.enum(['16:9', '1:1', '9:16'])
export type Aspect = z.infer<typeof Aspect>

export const Fps = z.union([z.literal(30), z.literal(60)])
export type Fps = z.infer<typeof Fps>

export const Rect = z.object({ x: z.number(), y: z.number(), width: positive, height: positive })
export type Rect = z.infer<typeof Rect>

export const Source = z.object({
  kind: z.enum(['display', 'window', 'region', 'tab']),
  displayId: z.string().optional(),
  windowTitle: z.string().optional(),
  rect: Rect.optional(),
  width: positive,
  height: positive,
  scaleFactor: positive,
  fps: Fps,
})
export type Source = z.infer<typeof Source>

export const Style = z.object({
  background: z.object({ kind: z.enum(['preset', 'image', 'color']), value: z.string() }),
  padding: z.number().min(0).max(20),
  radius: nonNegative,
  shadow: z.boolean(),
})
export type Style = z.infer<typeof Style>

export const Zoom = z.object({
  id: z.string().min(1),
  startMs: nonNegative,
  endMs: nonNegative,
  scale: z.number().min(MIN_ZOOM_SCALE).max(MAX_ZOOM_SCALE),
  target: z.object({ x: z.number(), y: z.number() }),
  follow: z.boolean(),
  origin: z.enum(['auto', 'manual']),
  leadMs: nonNegative,
})
export type Zoom = z.infer<typeof Zoom>

export const CursorSettings = z.object({
  smooth: z.boolean(),
  stiffness: positive,
  damping: positive,
  size: z.number().min(1).max(3),
  clickRipple: z.boolean(),
  hidden: z.boolean(),
  autoHide: z.boolean(),
})
export type CursorSettings = z.infer<typeof CursorSettings>

export const AudioTrack = z.object({
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
  /**
   * Where the track's first sample sits on the video timeline, in ms (F-04 sync). Negative:
   * the audio started before the first video frame, so export skips its first `-offsetMs`.
   * Optional so version 1 files without it stay valid; missing means 0.
   */
  offsetMs: z.number().optional(),
})
export type AudioTrack = z.infer<typeof AudioTrack>

/** The track's offset on the video timeline (`offsetMs`, 0 when missing). */
export function audioOffsetMs(track: AudioTrack): number {
  return track.offsetMs ?? 0
}

export const CloudLink = z.object({
  videoId: z.uuid(),
  shortId: z.string().min(1),
  aspect: Aspect,
  uploadedAt: isoDate,
})
export type CloudLink = z.infer<typeof CloudLink>

export const ExportRecord = z.object({
  aspect: Aspect,
  resolution: z.enum(['1080p', '4k']),
  fps: Fps,
  format: z.enum(['mp4', 'gif']),
  path: z.string().min(1),
  createdAt: isoDate,
})
export type ExportRecord = z.infer<typeof ExportRecord>

export const PendingUpload = z.object({
  uploadId: z.string().min(1),
  aspect: Aspect,
  partsDone: z.array(z.number().int().nonnegative()),
  totalParts: z.number().int().positive(),
  startedAt: isoDate,
})
export type PendingUpload = z.infer<typeof PendingUpload>

export const TranscriptState = z.object({
  status: z.enum(['none', 'pending', 'done', 'failed']),
  language: z.string().optional(),
  model: z.string().optional(),
})
export type TranscriptState = z.infer<typeof TranscriptState>

export const Project = z
  .object({
    version: z.literal(PROJECT_VERSION),
    id: z.uuid(),
    name: z.string(),
    createdAt: isoDate,
    durationMs: nonNegative,
    source: Source,
    style: Style,
    zooms: z.array(Zoom),
    cursor: CursorSettings,
    // Webcam bubble and captions arrive in v0.4 (A-03, A-06); until then always null.
    webcam: z.null(),
    captions: z.null(),
    transcript: TranscriptState,
    cloud: z.array(CloudLink),
    trim: z.object({ startMs: nonNegative, endMs: nonNegative }),
    audio: z.object({ mic: AudioTrack, system: AudioTrack }),
    exports: z.array(ExportRecord),
    pendingUpload: PendingUpload.nullable(),
  })
  .superRefine((project, ctx) => {
    const { trim, durationMs, zooms } = project
    if (
      trim.endMs > durationMs ||
      trim.endMs - trim.startMs < Math.min(MIN_TRIMMED_MS, durationMs)
    ) {
      ctx.addIssue({ code: 'custom', path: ['trim'], message: 'trim out of range' })
    }
    zooms.forEach((zoom, i) => {
      if (zoom.endMs - zoom.startMs < MIN_ZOOM_MS) {
        ctx.addIssue({ code: 'custom', path: ['zooms', i], message: 'zoom shorter than 600ms' })
      }
      if (zoom.endMs > durationMs) {
        ctx.addIssue({ code: 'custom', path: ['zooms', i], message: 'zoom past the end' })
      }
      const previous = zooms[i - 1]
      if (previous && zoom.startMs < previous.endMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['zooms', i],
          message: 'zooms unsorted or overlapping',
        })
      }
    })
  })
export type Project = z.infer<typeof Project>

export const DEFAULT_STYLE: Style = {
  background: { kind: 'preset', value: 'sage' },
  padding: 8,
  radius: 12,
  shadow: true,
}

export const DEFAULT_CURSOR: CursorSettings = {
  smooth: true,
  ...SPRING,
  size: 1.5,
  clickRipple: true,
  hidden: false,
  autoHide: true,
}

export const DEFAULT_ZOOM_SCALE = 2
export const DEFAULT_LEAD_MS = 300
