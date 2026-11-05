// The caption style gallery (A-06): what each thumbnail shows and how it is painted. The
// thumbnails go through the core's paintCaption, so a style looks in the gallery exactly as in
// the preview and the export (rule 11); only the sample text and the crop of the video behind
// it are chosen here.
import {
  CAPTION_FONT_SIZE,
  CAPTION_LOOKS,
  captionFontFamily,
  captionFontSpec,
  captionTokens,
  paintCaption,
  type CaptionLayer,
  type CaptionPosition,
  type CaptionPreset,
  type Context2D,
  type Transcript,
} from '@kamo/core'

/** Width budget of a thumbnail's sample (units: Latin letter 1, CJK character 2). */
export const SAMPLE_MAX_UNITS = 14

/** Punctuation that reads as cut off at the end of a sample. */
const TRAILING = /[\s,;:\-–—、，；：（(「『"“]+$/u

/**
 * The sample a thumbnail shows: the start of what is said at the playhead (or of the next
 * caption, or the last one), cut between words or CJK characters to SAMPLE_MAX_UNITS (at least
 * one word); `fallback` when the transcript has nothing to show.
 */
export function captionSample(
  transcript: Pick<Transcript, 'segments'> | null | undefined,
  timeMs: number,
  fallback: string,
  maxUnits = SAMPLE_MAX_UNITS,
): string {
  const segments = (transcript?.segments ?? []).filter((s) => s.text.trim() !== '')
  const segment =
    segments.find((s) => s.startMs <= timeMs && timeMs < s.endMs) ??
    segments.find((s) => s.startMs > timeMs) ??
    segments.at(-1)
  if (!segment) return fallback
  let text = ''
  let units = 0
  for (const token of captionTokens(segment.text)) {
    if (text !== '' && units + token.units > maxUnits) break
    text += token.text
    units += token.units
    if (token.space) {
      text += ' '
      units += 1
    }
  }
  return text.replace(TRAILING, '') || fallback
}

/** Font size of a thumbnail's sample, as a share of its height (shrinks when too wide). */
const SAMPLE_FONT = 0.3
/** The share of the video's width a thumbnail shows, around where the captions sit. */
const CROP_WIDTH = 0.46

export interface ThumbnailOptions {
  preset: CaptionPreset
  text: string
  /** of the text: the transcript's, or the interface's for the fallback */
  language: string
  /** the editor's video at the playhead; null or not ready: a plain dark backdrop */
  video: HTMLVideoElement | null
  /** where the user's captions sit: the crop shows that part of the video */
  position: CaptionPosition
}

/** The canvas fonts a set of presets needs, for `document.fonts.load` before painting. */
export function thumbnailFonts(presets: readonly CaptionPreset[], language: string): string[] {
  return [
    ...new Set(
      presets.map((preset) =>
        captionFontSpec(preset, captionFontFamily(language, CAPTION_LOOKS[preset].font)),
      ),
    ),
  ]
}

/** The part of the video behind the captions, with the thumbnail's aspect. */
export function thumbnailCrop(
  video: { width: number; height: number },
  aspect: number,
  position: CaptionPosition,
): { x: number; y: number; width: number; height: number } {
  let width = video.width * CROP_WIDTH
  let height = width / aspect
  if (height > video.height) {
    height = video.height
    width = height * aspect
  }
  const x = (video.width - width) / 2
  const center = position === 'middle' ? video.height / 2 : video.height * 0.86
  const y = Math.max(0, Math.min(video.height - height, center - height / 2))
  return { x, y, width, height }
}

/**
 * Paints one thumbnail: the crop of the video, then the sample in the preset, centered and as
 * big as SAMPLE_FONT allows. The canvas must already have its pixel size.
 */
export function paintCaptionThumbnail(ctx: CanvasRenderingContext2D, options: ThumbnailOptions) {
  const { width, height } = ctx.canvas
  if (!(width > 0 && height > 0)) return
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  const video = options.video
  if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    const crop = thumbnailCrop(
      { width: video.videoWidth, height: video.videoHeight },
      width / height,
      options.position,
    )
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
  } else {
    // No frame yet: the dark theme's surfaces, like an empty preview.
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#3A403C')
    gradient.addColorStop(1, '#1A1D1B')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
  const layer: CaptionLayer = {
    lines: [options.text],
    opacity: 1,
    rising: false,
    preset: options.preset,
    position: 'middle',
    size: 'medium',
    fontFamily: captionFontFamily(options.language, CAPTION_LOOKS[options.preset].font),
    aspect: '16:9',
    language: options.language,
  }
  // Caption sizes are a share of the output's short side: an output that many times the
  // thumbnail's height gives the sample its size, drawn in the thumbnail's own frame.
  const scale = SAMPLE_FONT / CAPTION_FONT_SIZE.medium
  const frame = { x: 0, y: 0, width, height }
  paintCaption(ctx as unknown as Context2D, layer, frame, {
    width: width * scale,
    height: height * scale,
  })
}
