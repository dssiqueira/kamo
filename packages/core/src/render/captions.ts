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
// - The webcam bubble (A-03) can be dragged anywhere, e.g. bottom-middle, right where the
//   captions sit. Captions then move clear of it, above it (or below when that is shorter and
//   fits), a pure function of the bubble in that frame: its size after shrink-on-zoom and its fade
//   move the captions continuously, so preview and export agree and nothing jumps.
// - Font: the preset's bundled family (Inter, Instrument Serif or JetBrains Mono, already in
//   the app), then the system CJK stack of the transcript's language (DESIGN.md typography:
//   never a bundled CJK font).
// - Presets are data (CaptionLook): fonts, capitals, letter spacing, fill, outline, text
//   shadow or glow, and a box per cue, per line or across the frame. A style only changes how
//   the lines look, never where they break: capitals or spacing that make a line wider than
//   the frame shrink the font, like any line too wide. The first three presets (clean, bold,
//   kamo) paint exactly as before the gallery, so older projects look the same.
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
import type { WebcamBubble } from './webcam.ts'

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

/** Space kept between the captions and the webcam bubble, as a share of the short side. */
export const CAPTION_BUBBLE_GAP = 0.02

/** Visibility left when a fade counts as done. */
const FADE_EPSILON = 0.02
/** How long a fade takes (the spring's settle time, ~0.46s). */
export const CAPTION_FADE_MS = springSettleTime(1, FADE_EPSILON) * 1000
/** How far a cue rises while it fades in, in em. */
export const CAPTION_LIFT_EM = 0.2

/** The bundled families (DESIGN.md): Inter, Instrument Serif, JetBrains Mono. */
export type CaptionFont = 'sans' | 'serif' | 'mono'

/**
 * What a preset paints: a data-driven style, drawn by paintCaption for the preview, the MP4
 * and the GIF alike. Lengths are in em of the caption font. Colors from DESIGN.md where it
 * has one; the rest are content colors (like the wallpapers), never the zoom blocks' pink.
 */
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
  /** soft shadow under the box, or under the outline when there is no box */
  shadow: { color: string; blur: number; offsetY: number } | null
  /** a bundled weight of the family (Inter 400/500/600, Instrument Serif 400, Mono 500) */
  weight: number
  /** size relative to CAPTION_FONT_SIZE */
  scale: number
  /** family; default sans (Inter). CJK always falls back to the system stack */
  font?: CaptionFont
  /** draws the lines in capitals (no effect on scripts without case, like CJK) */
  uppercase?: boolean
  /** extra space between letters, in em */
  tracking?: number
  /** what the box wraps: the whole cue (default), each line, or the frame's width (a band) */
  boxFit?: 'cue' | 'line' | 'band'
  /** a solid copy of each box, offset behind it, in em (two-tone) */
  backing?: { color: string; x: number; y: number } | null
  /** shadow or glow painted with the letters themselves, `passes` times for strength */
  textShadow?: { color: string; blur: number; offsetY: number; passes: number } | null
  /**
   * The scale the lines are broken for (captionMaxUnits); default 1, so every style shares
   * the same lines and a bigger or wider one shrinks to fit instead. Only bold breaks for its
   * own size, as it did before the gallery (its older projects keep their lines).
   */
  wrapScale?: number
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
    wrapScale: 1.22,
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
  // Minimal: lighter white letters, no box, a close soft shadow that keeps them readable on
  // bright screens without being noticed.
  minimal: {
    color: '#FFFFFF',
    box: null,
    radius: 0,
    padX: 0,
    padY: 0.1,
    stroke: null,
    shadow: null,
    weight: 500,
    scale: 0.96,
    textShadow: { color: 'rgba(10, 12, 11, 0.9)', blur: 0.1, offsetY: 0.03, passes: 4 },
  },
  // Soft: white letters floating on a wide, diffuse dark halo.
  soft: {
    color: '#FFFFFF',
    box: null,
    radius: 0,
    padX: 0,
    padY: 0.1,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 1.04,
    textShadow: { color: 'rgba(8, 10, 9, 0.6)', blur: 0.6, offsetY: 0.06, passes: 4 },
  },
  // Neon: mint letters glowing on a dark sign.
  neon: {
    color: '#E6FFE9',
    box: 'rgba(14, 20, 17, 0.82)',
    radius: 0.28,
    padX: 0.6,
    padY: 0.26,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 1,
    textShadow: { color: '#3FE08A', blur: 0.42, offsetY: 0, passes: 3 },
  },
  // Typewriter: JetBrains Mono, ink on a cream card (the app's background).
  typewriter: {
    color: '#2B2A26',
    box: '#FAF7F2',
    radius: 0.1,
    padX: 0.6,
    padY: 0.3,
    stroke: null,
    shadow: { color: 'rgba(43, 42, 38, 0.3)', blur: 0.36, offsetY: 0.08 },
    weight: 500,
    scale: 0.92,
    font: 'mono',
  },
  // Caps: spaced capitals, each line on its own dark tag.
  caps: {
    color: '#FFFFFF',
    box: '#1A1D1B',
    radius: 0.12,
    padX: 0.42,
    padY: 0.14,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 0.86,
    uppercase: true,
    tracking: 0.06,
    boxFit: 'line',
  },
  // Cinema: Instrument Serif on a translucent band across the frame, like a film subtitle bar.
  cinema: {
    color: '#FBF7EE',
    box: 'rgba(10, 11, 10, 0.66)',
    radius: 0,
    padX: 0.6,
    padY: 0.34,
    stroke: null,
    shadow: null,
    weight: 400,
    scale: 1.2,
    font: 'serif',
    tracking: 0.01,
    boxFit: 'band',
  },
  // Marker: dark ink over a butter highlighter stroke, line by line.
  marker: {
    color: '#2B2A26',
    box: '#F7E08A',
    radius: 0.14,
    padX: 0.26,
    padY: 0.05,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 1,
    boxFit: 'line',
  },
  // Classic: the yellow subtitle of TV and DVDs, with a thin dark outline.
  classic: {
    color: '#FFE14D',
    box: null,
    radius: 0,
    padX: 0,
    padY: 0.1,
    stroke: { color: '#121412', width: 0.12 },
    shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 0.14, offsetY: 0.05 },
    weight: 600,
    scale: 1.04,
  },
  // Duo: white tags with dark green text, each over a sage copy offset down-right.
  duo: {
    color: '#1F3A1C',
    box: '#FFFFFF',
    radius: 0.22,
    padX: 0.42,
    padY: 0.14,
    stroke: null,
    shadow: null,
    weight: 600,
    scale: 1,
    boxFit: 'line',
    backing: { color: '#A8D5A2', x: 0.12, y: 0.12 },
  },
}

/** The presets in gallery order (the first three kept from before the gallery). */
export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  'clean',
  'bold',
  'kamo',
  'minimal',
  'soft',
  'neon',
  'typewriter',
  'caps',
  'cinema',
  'marker',
  'classic',
  'duo',
]

/** System CJK stacks per language (DESIGN.md typography), behind the bundled family. */
const CJK_FONTS: Readonly<Record<string, string>> = {
  zh: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"',
  ja: '"Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP"',
  ko: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"',
}

const FAMILIES: Readonly<Record<CaptionFont, { name: string; generic: string }>> = {
  sans: { name: '"Inter"', generic: 'sans-serif' },
  serif: { name: '"Instrument Serif"', generic: 'serif' },
  mono: { name: '"JetBrains Mono"', generic: 'monospace' },
}

/**
 * CSS font family for a transcript language (ISO 639-1, e.g. `pt`, `ja`) and a family: the
 * bundled font, then the system CJK stack of the language (DESIGN.md: never a bundled CJK font).
 */
export function captionFontFamily(language: string, font: CaptionFont = 'sans'): string {
  const base = language.toLowerCase().split(/[-_]/)[0] ?? ''
  const cjk = CJK_FONTS[base]
  const { name, generic } = FAMILIES[font]
  return cjk ? `${name}, ${cjk}, ${generic}` : `${name}, ${generic}`
}

/** What the canvas must load before drawing a preset (`document.fonts.load`). */
export function captionFontSpec(preset: CaptionPreset, fontFamily: string, px = 48): string {
  return `${CAPTION_LOOKS[preset].weight} ${px}px ${fontFamily}`
}

/** A line as the preset draws it (capitals for `uppercase`); the lines are never rewrapped. */
export function captionLineText(preset: CaptionPreset, line: string, language?: string): string {
  if (!CAPTION_LOOKS[preset].uppercase) return line
  try {
    return line.toLocaleUpperCase(language || undefined)
  } catch {
    return line.toUpperCase()
  }
}

/** Font size in output pixels. */
export function captionFontPx(output: Size, settings: Pick<CaptionSettings, 'size' | 'preset'>) {
  const short = Math.min(output.width, output.height)
  return CAPTION_FONT_SIZE[settings.size] * CAPTION_LOOKS[settings.preset].scale * short
}

/**
 * Units per line for a format: what fits in CAPTION_WIDTH of the frame at the default padding
 * (8%), capped at CAPTION_MAX_UNITS. 16:9 medium → 42, 9:16 medium → 29. Depends on the size,
 * not on the style (only bold's wrapScale): switching styles keeps the lines.
 */
export function captionMaxUnits(
  aspect: Aspect,
  settings: Pick<CaptionSettings, 'size' | 'preset'>,
): number {
  const output = outputSize(aspect, '1080p')
  const frameWidth = paddedArea(output, 8).width
  const font =
    CAPTION_FONT_SIZE[settings.size] *
    (CAPTION_LOOKS[settings.preset].wrapScale ?? 1) *
    Math.min(output.width, output.height)
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
  /** the preset's family with the language's CJK fallback (captionFontFamily) */
  fontFamily: string
  /** the transcript's language (capitals follow its rules) */
  language: string
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
    fontFamily: captionFontFamily(transcript.language, CAPTION_LOOKS[settings.preset].font),
    language: transcript.language,
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
  /** the transcript's language, for the capitals of an uppercase preset */
  language?: string
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
    language: track.language,
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
  /** the boxes of a per-line preset (boxFit `line`), one per line; empty otherwise */
  lineBoxes: Box[]
  /** corner radius of the line boxes */
  lineRadius: number
}

/** The webcam bubble as the captions see it: center, outer size and fade (WebcamBubble). */
export type CaptionObstacle = Pick<WebcamBubble, 'x' | 'y' | 'width' | 'height' | 'opacity'>

/**
 * Places the lines in the screen frame. `lineWidths` are the measured widths at
 * captionFontPx; when the widest exceeds CAPTION_WIDTH of the frame the font shrinks to fit.
 * `avoid`: the webcam bubble in this frame; the captions move clear of it (captionDodge).
 */
export function captionPlacement(
  frame: Box,
  output: Size,
  layer: Pick<CaptionLayer, 'preset' | 'position' | 'size' | 'aspect'>,
  lineWidths: readonly number[],
  avoid?: CaptionObstacle | null,
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
  // A band spans the frame, whatever the text's width.
  const width = look.boxFit === 'band' ? frame.width : widest * shrink + 2 * padX
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
  if (avoid) {
    const bottomLimit =
      layer.position === 'middle'
        ? frame.y + frame.height
        : Math.min(frame.y + frame.height, output.height * (1 - CAPTION_SAFE_BOTTOM[layer.aspect]))
    y += captionDodge(
      { x: x - width / 2, y, width, height },
      avoid,
      { top: frame.y, bottom: bottomLimit },
      CAPTION_BUBBLE_GAP * Math.min(output.width, output.height),
    )
  }
  const lines = lineWidths.map((_, i) => ({ x, y: y + padY + lineHeight * (i + 0.5) }))
  // Per-line boxes: one em plus the padding tall, centered on each line, so two lines keep a
  // thin gap between their boxes (and stay inside the cue's box).
  const lineBoxHeight = fontPx * (1 + 2 * look.padY)
  const lineBoxes =
    look.boxFit === 'line'
      ? lineWidths.map((w, i) => {
          const at = lines[i] as { x: number; y: number }
          const boxWidth = w * shrink + 2 * padX
          return {
            x: at.x - boxWidth / 2,
            y: at.y - lineBoxHeight / 2,
            width: boxWidth,
            height: lineBoxHeight,
          }
        })
      : []
  return {
    box: { x: x - width / 2, y, width, height },
    fontPx,
    lines,
    radius: Math.min(look.radius * fontPx, height / 2),
    lineBoxes,
    lineRadius: Math.min(look.radius * fontPx, lineBoxHeight / 2),
  }
}

/**
 * How far (output px, negative = up) the caption box moves to stay clear of the bubble.
 * The shorter way out that stays in the frame: above the bubble or below it (up when it is a
 * tie, and for bottom captions below rarely fits); not at all when neither fits. Continuous in the bubble: the move fades with the bubble's opacity and ramps in
 * over `gap` as the boxes start to overlap sideways, so a shrinking or fading bubble glides
 * the captions instead of snapping them.
 */
export function captionDodge(
  box: Box,
  bubble: CaptionObstacle,
  limits: { top: number; bottom: number },
  gap: number,
): number {
  if (!(bubble.opacity > 0) || bubble.width <= 0 || bubble.height <= 0) return 0
  const left = bubble.x - bubble.width / 2
  const right = bubble.x + bubble.width / 2
  const top = bubble.y - bubble.height / 2
  const bottom = bubble.y + bubble.height / 2
  // Sideways overlap, gap included; the move ramps in over the last `gap` pixels of it.
  const sideways = Math.min(box.x + box.width, right + gap) - Math.max(box.x, left - gap)
  const ramp = gap > 0 ? clamp01(sideways / gap) : sideways > 0 ? 1 : 0
  const weight = ramp * Math.min(1, bubble.opacity)
  if (weight <= 0) return 0
  // Already clear vertically.
  if (box.y + box.height <= top - gap || box.y >= bottom + gap) return 0
  const up = top - gap - (box.y + box.height)
  const down = bottom + gap - box.y
  const fitsUp = box.y + up >= limits.top
  const fitsDown = box.y + box.height + down <= limits.bottom
  // The shorter way that fits (up when equal): a bubble just touching the captions from above
  // nudges them down a little instead of sending them over the bubble.
  if (fitsUp && (!fitsDown || -up <= down)) return up * weight
  if (fitsDown) return down * weight
  return 0
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
