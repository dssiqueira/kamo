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
  /**
   * `preset`: a wallpaper id (wallpapers.ts); `color`: `#RRGGBB`; `image` (A-04): the copy in
   * the project folder, `background-<hash>.<png|jpg|webp>` (background-image.ts). An image
   * value that is not such a name, or whose file is gone, paints the neutral fallback color.
   */
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

export const WebcamPosition = z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
export type WebcamPosition = z.infer<typeof WebcamPosition>

export const WebcamSize = z.enum(['small', 'medium', 'large'])
export type WebcamSize = z.infer<typeof WebcamSize>

/** Bubble outline: round, rounded square, or rounded 16:9 / 9:16 rectangles. */
export const WebcamShape = z.enum(['circle', 'square', 'landscape', 'portrait'])
export type WebcamShape = z.infer<typeof WebcamShape>

/**
 * Webcam bubble (A-03). The camera is recorded to `webcam.mp4`; this is how it shows. Null on a
 * project recorded without the camera.
 */
/** How the camera shows: a bubble over the video, or its own card (split, 9:16 only). */
export const WebcamLayout = z.enum(['bubble', 'split'])
export type WebcamLayout = z.infer<typeof WebcamLayout>

/**
 * Split layout (A-02 + A-03): in the vertical 9:16 format the screen and the camera are
 * stacked as two cards. `ratio` is the screen's share of the height (clamped to
 * SPLIT_RATIO_MIN..MAX when drawn); `cameraFirst` puts the camera on top.
 */
export const WebcamSplit = z.object({
  ratio: z.number().min(0).max(1),
  cameraFirst: z.boolean().optional(),
})
export type WebcamSplit = z.infer<typeof WebcamSplit>

export const WebcamSettings = z.object({
  /** Off hides the bubble in the whole video without deleting the recording. */
  visible: z.boolean(),
  position: WebcamPosition,
  /**
   * Free placement dragged in the preview: the bubble's center as a fraction of the output
   * frame (0..1), so it holds in any format. Absent = sits in `position`'s corner.
   */
  anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  size: WebcamSize,
  /** Absent on projects from before shapes existed: a circle. */
  shape: WebcamShape.optional(),
  /** The bubble shrinks while the camera zooms in, and grows back after (A-03). */
  shrinkOnZoom: z.boolean(),
  /** Absent = bubble. Split only applies to the 9:16 format; 16:9 and 1:1 keep the bubble. */
  layout: WebcamLayout.optional(),
  /** Split settings; absent = screen on top, half the height each. */
  split: WebcamSplit.optional(),
  /** Stretches of video time where the bubble is hidden (set on the timeline), sorted. */
  hidden: z.array(z.object({ startMs: nonNegative, endMs: nonNegative })),
  /** Same meaning as AudioTrack.offsetMs: where the webcam's first frame sits on video time. */
  offsetMs: z.number().optional(),
})
export type WebcamSettings = z.infer<typeof WebcamSettings>

export const DEFAULT_WEBCAM: WebcamSettings = {
  visible: true,
  position: 'bottom-right',
  size: 'medium',
  shrinkOnZoom: true,
  hidden: [],
}

/** The editor's format (`project.aspect`), 16:9 when missing. */
export function projectAspect(project: { aspect?: Aspect | undefined }): Aspect {
  return project.aspect ?? '16:9'
}

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
    /**
     * Format the editor previews in, pre-checked in the export (A-02). Absent = 16:9, so
     * older files stay valid.
     */
    aspect: Aspect.optional(),
    webcam: WebcamSettings.nullable(),
    // Captions arrive in v0.4 (A-06); until then always null.
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
