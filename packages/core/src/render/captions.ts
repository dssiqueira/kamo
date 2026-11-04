// Burned-in captions (A-06): which cue shows at any instant, how visible it is, how it looks
// and where it sits. Pure math and constants, shared by the editor preview and the export
// (rule 11); renderer.ts only measures and paints.
//
// Decisions:
// - Captions are an overlay on the OUTPUT, drawn last (over the webcam), never zoomed by the
//   virtual camera. They sit in the screen frame (layout.frame): the video in 16:9, the crop
//   in 1:1 and 9:16, and in the 9:16 split layout the screen card, so they never cover the
//   camera card (the face). With the screen on top, "bottom" puts them just above the camera.
// - Sizes are fractions of the output's short side, like the frame shadow and the bubble, so
//   they read the same at 1080p and 4K. Lines are broken by units in cues.ts; a line that
//   still measures wider than the frame (font metrics vary) shrinks the font, never rewraps,
//   so the preview, the export and the .srt keep the same lines.
// - 9:16 keeps the bottom 13% free (where phone apps put their buttons).
// - Fade: each cue fades in with the 170/26 spring (rule 10) from its start and fades out
//   from its end, as a pure function of time. Cues closer than the fade bridge the gap and
//   switch at once, so back-to-back cues do not blink.
// - Font: Inter (the app font), then the system CJK stack of the transcript's language
//   (DESIGN.md typography: never a bundled CJK font).
import { captionCues, type CaptionCue } from '../captions/cues.ts'
import type {
  Aspect,
  CaptionPosition,
  CaptionPreset,
  CaptionSettings,
  CaptionSize,
} from '../project/schema.ts'
import { springSettleTime, springStep } from '../spring.ts'
import type { Transcript } from '../transcript/transcript.ts'
import { outputSize, paddedArea, REFERENCE_SHORT_SIDE } from './layout.ts'
import type { Box, Size } from './types.ts'

/** Font size as a fraction of the output's short side (1080p: 39, 48, 59px). */
export const CAPTION_FONT_SIZE: Readonly<Record<CaptionSize, number>> = {
  small: 0.036,
  medium: 0.044,
  large: 0.055,
}

/** Lines per cue. */
export const CAPTION_MAX_LINES = 2
/** At most this many units per line, even when the frame is wider (reading comfort). */
export const CAPTION_MAX_UNITS = 42
/** Average width of one unit, in em (Inter at weight 600). */
export const CAPTION_UNIT_EM = 0.56
/** Text may use this share of the frame's width. */
export const CAPTION_WIDTH = 0.88
export const CAPTION_LINE_HEIGHT = 1.28
/** Gap between the captions and the bottom of the frame, as a share of its height. */
export const CAPTION_MARGIN = 0.06
/** Bottom share of the output kept free per format (9:16: phone app buttons). */
export const CAPTION_SAFE_BOTTOM: Readonly<Record<Aspect, number>> = {
  '16:9': 0.04,
  '1:1': 0.05,
  '9:16': 0.13,
}

/** Visibility left when a fade counts as done. */
const FADE_EPSILON = 0.02
/** How long a fade takes (the spring's settle time, ~0.46s). */
export const CAPTION_FADE_MS = springSettleTime(1, FADE_EPSILON) * 1000
/** How far a cue rises while it fades in, in em. */
export const CAPTION_LIFT_EM = 0.2

/** What a preset paints. Colors from DESIGN.md. */
export interface CaptionLook {
  /** text color */
  color: string
  /** box behind the lines; null = none */
  box: string | null
  /** box corner radius, in em */
  radius: number
  /** box padding, in em */
  padX: number
  padY: number
  /** outline around the letters; width in em */
  stroke: { color: string; width: number } | null
  /** soft shadow under the letters (outline presets) */
  shadow: { color: string; blur: number; offsetY: number } | null
  weight: number
  /** size relative to CAPTION_FONT_SIZE */
  scale: number
}

export const CAPTION_LOOKS: Readonly<Record<CaptionPreset, CaptionLook>> = {
  // Clean: white on a soft dark pill (the dark theme's background), readable on any video.
  clean: {
    color: '#FFFFFF',
    box: 'rgba(26, 29, 27, 0.84)',
    radius: 0.32,
    padX: 0.5,
    padY: 0.22,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 1,
  },
  // Bold: bigger white letters with a dark outline and no box, for vertical videos.
  bold: {
    color: '#FFFFFF',
    box: null,
    radius: 0,
    padX: 0,
    padY: 0.1,
    stroke: { color: '#1A1D1B', width: 0.16 },
    shadow: { color: 'rgba(26, 29, 27, 0.45)', blur: 0.18, offsetY: 0.06 },
    weight: 600,
    scale: 1.22,
  },
  // Kamo: the brand's sage with very dark green text (never white on sage).
  kamo: {
    color: '#1F3A1C',
    box: '#A8D5A2',
    radius: 0.5,
    padX: 0.6,
    padY: 0.24,
    stroke: null,
    shadow: { color: 'rgba(43, 42, 38, 0.22)', blur: 0.4, offsetY: 0.1 },
    weight: 600,
    scale: 1,
  },
}

/** System CJK stacks per language (DESIGN.md typography), behind Inter. */
const CJK_FONTS: Readonly<Record<string, string>> = {
  zh: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"',
  ja: '"Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP"',
  ko: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"',
}

/** CSS font family for a transcript language (ISO 639-1, e.g. `pt`, `ja`). */
export function captionFontFamily(language: string): string {
  const base = language.toLowerCase().split(/[-_]/)[0] ?? ''
  const cjk = CJK_FONTS[base]
  return cjk ? `"Inter", ${cjk}, sans-serif` : '"Inter", sans-serif'
}

/** Font size in output pixels. */
export function captionFontPx(output: Size, settings: Pick<CaptionSettings, 'size' | 'preset'>) {
  const short = Math.min(output.width, output.height)
  return CAPTION_FONT_SIZE[settings.size] * CAPTION_LOOKS[settings.preset].scale * short
}

/**
 * Units per line for a format: what fits in CAPTION_WIDTH of the frame at the default padding
 * (8%), capped at CAPTION_MAX_UNITS. 16:9 medium → 42, 9:16 medium → 29.
 */
export function captionMaxUnits(
  aspect: Aspect,
  settings: Pick<CaptionSettings, 'size' | 'preset'>,
): number {
  const output = outputSize(aspect, '1080p')
  const frameWidth = paddedArea(output, 8).width
  const font = captionFontPx(output, settings)
  return Math.max(
    8,
    Math.min(
      CAPTION_MAX_UNITS,
      Math.floor((frameWidth * CAPTION_WIDTH) / (font * CAPTION_UNIT_EM)),
    ),
  )
}

/** A transcript's captions, ready to draw: settings, font and the cues per format. */
export interface CaptionTrack {
  settings: CaptionSettings
  fontFamily: string
  /** the cues for a format (lines depend on its width); computed once per format */
  cues(aspect: Aspect): readonly CaptionCue[]
}

/** Null when there is nothing to show (captions off, or no speech). */
export function buildCaptionTrack(
  transcript: Pick<Transcript, 'segments' | 'language'> | null | undefined,
  settings: CaptionSettings | null | undefined,
): CaptionTrack | null {
  if (!transcript || !settings?.enabled || transcript.segments.length === 0) return null
  const cache = new Map<Aspect, CaptionCue[]>()
  return {
    settings,
    fontFamily: captionFontFamily(transcript.language),
    cues(aspect) {
      let cues = cache.get(aspect)
      if (!cues) {
        cues = captionCues(transcript, {
          maxUnits: captionMaxUnits(aspect, settings),
          maxLines: CAPTION_MAX_LINES,
        })
        cache.set(aspect, cues)
      }
      return cues
    },
  }
}

/** The cue on screen at `timeMs` and how visible it is (0..1). */
export interface ActiveCaption {
  cue: CaptionCue
  opacity: number
}

/** Spring response from 0 toward 1 after `ms` (1 once within half a percent, settled). */
function rise(ms: number): number {
  if (ms <= 0) return 0
  const value = 1 - springStep({ x: 1, v: 0 }, 0, ms / 1000).x
  return value > 0.995 ? 1 : Math.max(0, value)
}

/** The cue showing at `timeMs` (video time) with its fade, or null. */
export function activeCaption(cues: readonly CaptionCue[], timeMs: number): ActiveCaption | null {
  // Last cue that started at or before timeMs.
  let lo = 0
  let hi = cues.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if ((cues[mid] as CaptionCue).startMs <= timeMs) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found === -1) return null
  const cue = cues[found] as CaptionCue
  const next = cues[found + 1]
  const previous = cues[found - 1]
  const bridged = next !== undefined && next.startMs - cue.endMs < CAPTION_FADE_MS
  const shownUntil = bridged ? next.startMs : cue.endMs + CAPTION_FADE_MS
  if (timeMs >= shownUntil) return null
  const fadesIn = !previous || cue.startMs - previous.endMs >= CAPTION_FADE_MS
  const fadeIn = fadesIn ? rise(timeMs - cue.startMs) : 1
  const fadeOut = !bridged && timeMs > cue.endMs ? 1 - rise(timeMs - cue.endMs) : 1
  const opacity = Math.min(fadeIn, fadeOut)
  return opacity > FADE_EPSILON / 2 ? { cue, opacity } : null
}

/** One frame's caption, as the renderer draws it. */
export interface CaptionLayer {
  lines: readonly string[]
  /** 0..1 */
  opacity: number
  /** true while fading in: the lines rise into place */
  rising: boolean
  preset: CaptionPreset
  position: CaptionPosition
  size: CaptionSize
  fontFamily: string
  aspect: Aspect
}

/** The caption layer for a frame, or null when none shows. */
export function captionLayerAt(
  track: CaptionTrack | null | undefined,
  aspect: Aspect,
  timeMs: number,
): CaptionLayer | null {
  if (!track) return null
  const active = activeCaption(track.cues(aspect), timeMs)
  if (!active) return null
  const { settings } = track
  return {
    lines: active.cue.lines,
    opacity: active.opacity,
    rising: timeMs < active.cue.endMs,
    preset: settings.preset,
    position: settings.position,
    size: settings.size,
    fontFamily: track.fontFamily,
    aspect,
  }
}

/** Where a caption goes, output pixels. */
export interface CaptionPlacement {
  /** the box behind the lines (also the area the lines take without a box) */
  box: Box
  /** font size after shrinking to fit */
  fontPx: number
  /** center x and middle y of each line */
  lines: { x: number; y: number }[]
  radius: number
}

/**
 * Places the lines in the screen frame. `lineWidths` are the measured widths at
 * captionFontPx; when the widest exceeds CAPTION_WIDTH of the frame the font shrinks to fit.
 */
export function captionPlacement(
  frame: Box,
  output: Size,
  layer: Pick<CaptionLayer, 'preset' | 'position' | 'size' | 'aspect'>,
  lineWidths: readonly number[],
): CaptionPlacement {
  const look = CAPTION_LOOKS[layer.preset]
  let fontPx = captionFontPx(output, layer)
  const widest = Math.max(0, ...lineWidths)
  const room = frame.width * CAPTION_WIDTH - 2 * look.padX * fontPx
  const shrink = widest > room && widest > 0 ? room / widest : 1
  fontPx *= shrink
  const lineHeight = fontPx * CAPTION_LINE_HEIGHT
  const padX = look.padX * fontPx
  const padY = look.padY * fontPx
  const width = widest * shrink + 2 * padX
  const height = lineWidths.length * lineHeight + 2 * padY
  const x = frame.x + frame.width / 2
  let y: number
  if (layer.position === 'middle') {
    y = frame.y + (frame.height - height) / 2
  } else {
    const k = Math.min(output.width, output.height) / REFERENCE_SHORT_SIDE
    const bottom = Math.min(
      frame.y + frame.height - Math.max(frame.height * CAPTION_MARGIN, 24 * k),
      output.height * (1 - CAPTION_SAFE_BOTTOM[layer.aspect]),
    )
    y = Math.max(frame.y, bottom - height)
  }
  return {
    box: { x: x - width / 2, y, width, height },
    fontPx,
    lines: lineWidths.map((_, i) => ({ x, y: y + padY + lineHeight * (i + 0.5) })),
    radius: Math.min(look.radius * fontPx, height / 2),
  }
}
