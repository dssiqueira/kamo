// Pure rules of the tab capture (E-01): what can be recorded, at what size and bitrate, and
// which container the browser records into. Kept free of chrome.* so they are unit tested.

/** E-01: up to 1080p30, or the tab's own resolution when it is smaller. */
export const MAX_CAPTURE = { width: 1920, height: 1080 } as const
export const CAPTURE_FPS = 30

/**
 * Pages Chrome never lets an extension capture (`chrome://`, other extensions, the Web Store).
 * A tab without a URL is one the extension was not invoked on, so it is not recordable either.
 */
export function isRecordableUrl(url: string | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return false
  const host = parsed.hostname
  if (host === 'chromewebstore.google.com') return false
  if (host === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return false
  return true
}

export interface Size {
  width: number
  height: number
}

/**
 * Size of the captured video: the tab's pixels (CSS size × devicePixelRatio), scaled down to fit
 * in 1920×1080 keeping the aspect ratio. Even numbers, because the video encoders want them.
 */
export function captureSize(tab: Size, devicePixelRatio: number, max: Size = MAX_CAPTURE): Size {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1
  const width = Math.max(2, tab.width * dpr)
  const height = Math.max(2, tab.height * dpr)
  const scale = Math.min(1, max.width / width, max.height / height)
  const even = (n: number) => Math.max(2, Math.floor((n * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/**
 * Video bitrate for screen content: ~0.1 bit per pixel per frame (about 6 Mbps at 1080p30),
 * never below 1.5 Mbps so small tabs stay sharp.
 */
export function videoBitrate(size: Size, fps: number = CAPTURE_FPS): number {
  return Math.max(1_500_000, Math.round(size.width * size.height * fps * 0.1))
}

/**
 * First WebM type the browser records (docs/integrations.md: VP9/VP8 video + Opus audio).
 * `null` when none is supported.
 */
export function pickVideoMimeType(
  isTypeSupported: (type: string) => boolean,
  withAudio: boolean,
): string | null {
  const candidates = withAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return candidates.find((type) => isTypeSupported(type)) ?? null
}

export const MICROPHONE_MIME_TYPE = 'audio/webm;codecs=opus'
