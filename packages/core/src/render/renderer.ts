// Frame compositor (F-08, F-10, F-11). The one function that paints a Kamo frame, used by the
// editor preview and by the export (rule 11). Drawing stays thin: the math lives in
// layout.ts, wallpapers.ts and ripple.ts.
//
// Per frame: backdrop (cached) → frame clipped to a rounded rect → source crop → ripple →
// cursor → webcam (A-03: the bubble, an overlay outside the frame clip, or the split
// layout's camera card). The backdrop (wallpaper + frame shadow) only changes with the
// style, the output size or the frame box, so it is painted once into an offscreen canvas
// and then costs one drawImage per frame.
import { CURSOR_ARROW, type CursorFrame } from '../cursor/cursor.ts'
import type { Aspect, Style } from '../project/schema.ts'
import {
  computeLayout,
  isInCrop,
  REFERENCE_SHORT_SIDE,
  sourceToOutput,
  type Layout,
} from './layout.ts'
import { rippleLook } from './ripple.ts'
import type { Box, Context2D, ImageSourceLike, Point, Size } from './types.ts'
import { drawWallpaper } from './wallpapers.ts'
import { WEBCAM_RING, WEBCAM_SHADOW, webcamCoverCrop, type WebcamBubble } from './webcam.ts'

/** Video shadow at 1080p (it is content, not UI chrome, so it is bigger than DESIGN's). */
export const FRAME_SHADOW = { blur: 60, offsetY: 18, color: 'rgba(43, 42, 38, 0.28)' } as const
/** Color under the video inside the frame (only visible before the first video frame). */
export const FRAME_FILL = '#1A1D1B'
/** Arrow fill and outline (outline width in cursor units). */
export const CURSOR_FILL = '#2B2A26'
export const CURSOR_OUTLINE = '#FFFFFF'
export const CURSOR_OUTLINE_WIDTH = 1.6
const RIPPLE_FILL = 'rgba(255, 255, 255, 0.45)'
const RIPPLE_STROKE = 'rgba(43, 42, 38, 0.5)'
const RIPPLE_STROKE_WIDTH = 1.5

export interface RenderInput {
  /** current video frame: HTMLVideoElement, VideoFrame, ImageBitmap, canvas… */
  source: ImageSourceLike
  /** recorded video size in pixels */
  sourceSize: Size
  style: Style
  aspect: Aspect
  /** canvas size; the context's canvas must already have this size */
  output: Size
  /** camera viewport in source pixels (viewportAt); null = whole source */
  viewport: Box | null
  /** crop formats: the box the frame fills instead of the padded output (split layout) */
  region?: Box | null
  /** crop formats: preferred crop center in source pixels (framingAt) */
  focus?: Point | null
  /** crop formats: a source point the crop keeps inside (the cursor) */
  keep?: Point | null
  cursor: CursorFrame | null
  /** cursor scale (CursorSettings.size, 1.0–3.0) */
  cursorSize: number
  /** the webcam bubble (A-03); null/missing = none */
  webcam?: WebcamLayer | null
}

/** One webcam frame and where it goes: a bubble (webcamBubbleAt) or a split card. */
export interface WebcamLayer {
  /** current webcam frame: HTMLVideoElement, VideoFrame… */
  source: ImageSourceLike
  /** webcam video size in pixels */
  sourceSize: Size
  bubble?: WebcamBubble
  /** the split layout's camera card (splitRegions), drawn like the frame */
  card?: WebcamCard
}

/** The camera card of the split layout, output pixels. */
export interface WebcamCard extends Box {
  /** 0..1 (hidden stretches fade it) */
  opacity: number
}

/** An offscreen surface for the cached backdrop. */
export interface Surface {
  canvas: ImageSourceLike
  ctx: Context2D
}

export interface RendererOptions {
  /** creates the backdrop surface; defaults to OffscreenCanvas, else a DOM <canvas> */
  createSurface?: (size: Size) => Surface
}

export interface Renderer {
  /** paints one frame and returns its layout (for hit tests in the editor) */
  render(input: RenderInput): Layout
  /** forces the backdrop to be rebuilt on the next frame */
  invalidate(): void
}

export function createRenderer(ctx: Context2D, options: RendererOptions = {}): Renderer {
  const createSurface = options.createSurface ?? defaultSurface
  let backdrop: Surface | null = null
  let backdropSize: Size | null = null
  let backdropKey: string | null = null

  function backdropFor(style: Style, layout: Layout): Surface {
    const key = backdropCacheKey(style, layout)
    if (backdrop && backdropKey === key) return backdrop
    const { output } = layout
    if (
      !backdrop ||
      !backdropSize ||
      backdropSize.width !== output.width ||
      backdropSize.height !== output.height
    ) {
      backdrop = createSurface(output)
      backdropSize = { width: output.width, height: output.height }
    }
    paintBackdrop(backdrop.ctx, style, layout)
    backdropKey = key
    return backdrop
  }

  return {
    render(input) {
      const layout = computeLayout({
        output: input.output,
        sourceSize: input.sourceSize,
        style: input.style,
        aspect: input.aspect,
        viewport: input.viewport,
        region: input.region ?? null,
        focus: input.focus ?? null,
        keep: input.keep ?? null,
      })
      ctx.drawImage(backdropFor(input.style, layout).canvas, 0, 0)

      const { frame, crop } = layout
      ctx.save()
      roundRectPath(ctx, frame, layout.radius)
      ctx.clip()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        input.source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
      )
      if (input.cursor) {
        // The cursor zooms with the camera: cursor units × size × output px per source px.
        const unit = input.cursorSize * layout.scale
        if (input.cursor.ripple) drawRipple(ctx, input.cursor.ripple, layout, unit)
        if (input.cursor.visible && input.cursor.opacity > 0 && isInCrop(input.cursor, layout)) {
          drawCursor(ctx, input.cursor, layout, unit)
        }
      }
      ctx.restore()
      if (input.webcam?.card)
        drawWebcamCard(ctx, input.webcam, input.webcam.card, layout, input.style)
      else if (input.webcam?.bubble)
        drawWebcam(ctx, input.webcam, input.webcam.bubble, layout.output)
      return layout
    },
    invalidate() {
      backdropKey = null
    },
  }
}

/** Everything the backdrop depends on. Same key → the cached backdrop is reused. */
export function backdropCacheKey(style: Style, layout: Layout): string {
  return JSON.stringify([
    style.background.kind,
    style.background.value,
    style.shadow,
    layout.output.width,
    layout.output.height,
    layout.frame.x,
    layout.frame.y,
    layout.frame.width,
    layout.frame.height,
    layout.radius,
  ])
}

/** Wallpaper + (optional) soft shadow under where the frame will be. */
function paintBackdrop(ctx: Context2D, style: Style, layout: Layout): void {
  const { output, frame, radius } = layout
  ctx.save()
  ctx.clearRect(0, 0, output.width, output.height)
  drawWallpaper(ctx, style.background, output)
  if (style.shadow) {
    const k = Math.min(output.width, output.height) / REFERENCE_SHORT_SIDE
    ctx.shadowColor = FRAME_SHADOW.color
    ctx.shadowBlur = FRAME_SHADOW.blur * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = FRAME_SHADOW.offsetY * k
  }
  // The frame's fill also casts the shadow; the video covers it on every frame.
  ctx.fillStyle = FRAME_FILL
  roundRectPath(ctx, frame, radius)
  ctx.fill()
  ctx.restore()
}

/**
 * Webcam bubble: a shadowed cream shape (the ring), then the camera cover-fitted to the
 * shape and mirrored inside it. Sizes scale with the output's short side, like the frame
 * shadow. The circle is a rounded box with half-side corners, so every shape takes one path.
 */
function drawWebcam(ctx: Context2D, webcam: WebcamLayer, bubble: WebcamBubble, output: Size): void {
  const { sourceSize } = webcam
  if (!(bubble.opacity > 0) || !(bubble.width > 0 && bubble.height > 0)) return
  if (!(sourceSize.width > 0 && sourceSize.height > 0)) return
  const k = Math.min(output.width, output.height) / REFERENCE_SHORT_SIDE
  const ring = Math.min(WEBCAM_RING.width * k, bubble.radius / 4)
  const outer: Box = {
    x: bubble.x - bubble.width / 2,
    y: bubble.y - bubble.height / 2,
    width: bubble.width,
    height: bubble.height,
  }
  const inner: Box = {
    x: outer.x + ring,
    y: outer.y + ring,
    width: outer.width - ring * 2,
    height: outer.height - ring * 2,
  }
  const crop = webcamCoverCrop(sourceSize, inner.width / inner.height)
  ctx.save()
  ctx.globalAlpha = Math.min(1, bubble.opacity)
  ctx.shadowColor = WEBCAM_SHADOW.color
  ctx.shadowBlur = WEBCAM_SHADOW.blur * k
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = WEBCAM_SHADOW.offsetY * k
  roundRectPath(ctx, outer, bubble.cornerRadius)
  ctx.fillStyle = WEBCAM_RING.color
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  roundRectPath(ctx, inner, Math.max(0, bubble.cornerRadius - ring))
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Mirrored like a selfie view: flipped around the bubble's center.
  ctx.translate(bubble.x, bubble.y)
  ctx.scale(-1, 1)
  ctx.drawImage(
    webcam.source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -inner.width / 2,
    -inner.height / 2,
    inner.width,
    inner.height,
  )
  ctx.restore()
}

/**
 * Split layout's camera card: the same rounded corners and shadow as the screen frame (two
 * matching cards), the camera cover-fitted and mirrored like the bubble. No ring: the ring
 * sets the floating bubble apart from the video, the card sits on the wallpaper like it.
 */
function drawWebcamCard(
  ctx: Context2D,
  webcam: WebcamLayer,
  card: WebcamCard,
  layout: Layout,
  style: Style,
): void {
  const { sourceSize } = webcam
  if (!(card.opacity > 0) || !(card.width > 0.5 && card.height > 0.5)) return
  if (!(sourceSize.width > 0 && sourceSize.height > 0)) return
  const { output } = layout
  const k = Math.min(output.width, output.height) / REFERENCE_SHORT_SIDE
  const radius = Math.min(layout.radius, card.width / 2, card.height / 2)
  const crop = webcamCoverCrop(sourceSize, card.width / card.height)
  ctx.save()
  ctx.globalAlpha = Math.min(1, card.opacity)
  if (style.shadow) {
    ctx.shadowColor = FRAME_SHADOW.color
    ctx.shadowBlur = FRAME_SHADOW.blur * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = FRAME_SHADOW.offsetY * k
  }
  roundRectPath(ctx, card, radius)
  ctx.fillStyle = FRAME_FILL
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  roundRectPath(ctx, card, radius)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(card.x + card.width / 2, card.y + card.height / 2)
  ctx.scale(-1, 1)
  ctx.drawImage(
    webcam.source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -card.width / 2,
    -card.height / 2,
    card.width,
    card.height,
  )
  ctx.restore()
}

function drawCursor(ctx: Context2D, cursor: CursorFrame, layout: Layout, unit: number): void {
  const at = sourceToOutput(cursor, layout)
  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(0, cursor.opacity))
  ctx.translate(at.x, at.y)
  ctx.scale(unit, unit)
  ctx.beginPath()
  CURSOR_ARROW.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = CURSOR_OUTLINE_WIDTH
  ctx.strokeStyle = CURSOR_OUTLINE
  ctx.stroke()
  ctx.fillStyle = CURSOR_FILL
  ctx.fill()
  ctx.restore()
}

function drawRipple(
  ctx: Context2D,
  ripple: NonNullable<CursorFrame['ripple']>,
  layout: Layout,
  unit: number,
): void {
  const look = rippleLook(ripple.progress)
  if (look.opacity <= 0) return
  const at = sourceToOutput(ripple, layout)
  ctx.save()
  ctx.globalAlpha = look.opacity
  ctx.beginPath()
  ctx.arc(at.x, at.y, look.radius * unit, 0, Math.PI * 2)
  ctx.fillStyle = RIPPLE_FILL
  ctx.fill()
  ctx.lineWidth = RIPPLE_STROKE_WIDTH * unit
  ctx.strokeStyle = RIPPLE_STROKE
  ctx.stroke()
  ctx.restore()
}

/** Rounded rect path built from arcTo (works on every 2D context, no roundRect needed). */
export function roundRectPath(ctx: Context2D, box: Box, radius: number): void {
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2))
  const { x, y, width: w, height: h } = box
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

interface CanvasLike {
  width: number
  height: number
  getContext(id: '2d'): Context2D | null
}

/** Canvas globals, looked up at runtime (the types do not assume the DOM lib). */
const canvasGlobals = globalThis as {
  OffscreenCanvas?: new (width: number, height: number) => CanvasLike
  document?: { createElement(tag: 'canvas'): CanvasLike }
}

function defaultSurface(size: Size): Surface {
  const { OffscreenCanvas: Offscreen, document: doc } = canvasGlobals
  let canvas: CanvasLike | null = null
  if (Offscreen) {
    canvas = new Offscreen(size.width, size.height)
  } else if (doc) {
    canvas = doc.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
  }
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) throw new Error('No 2D canvas available for the backdrop')
  return { canvas, ctx }
}
