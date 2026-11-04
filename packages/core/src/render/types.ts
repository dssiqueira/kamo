// Shared renderer types.
//
// The 2D context and image types are structural (only what the renderer uses) instead of
// the DOM's names: @kamo/core is also type-checked by Node-only configs (the desktop main
// process imports it without the DOM lib). A real CanvasRenderingContext2D or
// OffscreenCanvasRenderingContext2D is assignable to Context2D, and any CanvasImageSource
// (HTMLVideoElement, VideoFrame, ImageBitmap, canvas) is an ImageSourceLike.

/** Anything `drawImage` accepts: HTMLVideoElement, VideoFrame, ImageBitmap, canvas… */
export type ImageSourceLike = object

export interface GradientLike {
  addColorStop(offset: number, color: string): void
}

/** The subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D Kamo draws with. */
export interface Context2D {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  lineJoin: string
  globalAlpha: number
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: string
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  /** captions (A-06) */
  font: string
  textAlign: string
  textBaseline: string
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  save(): void
  restore(): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  clip(): void
  fill(): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GradientLike
  drawImage(image: ImageSourceLike, dx: number, dy: number): void
  drawImage(
    image: ImageSourceLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
}

export interface Size {
  width: number
  height: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}
