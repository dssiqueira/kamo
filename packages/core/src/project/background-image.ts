// Wallpaper with your own image (A-04). The image is copied into the project folder, so the
// project keeps working when the original is deleted, and `style.background` points at the
// copy: `{ kind: 'image', value: 'background-<hash>.<ext>' }` (docs/data-model.md).
//
// The name carries a hash of the bytes: a new image is a new name, so the preview never shows
// a cached old picture and undo can go back to an image picked earlier in the session.
import type { Style } from './schema.ts'

export type BackgroundImageType = 'png' | 'jpg' | 'webp'

/** Extensions the picker offers (`.jpeg` is saved as `.jpg`). */
export const BACKGROUND_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

/** Biggest image accepted: far more than a 4K wallpaper needs. */
export const MAX_BACKGROUND_IMAGE_BYTES = 25 * 2 ** 20

/** Biggest side accepted, in pixels (decoding bigger ones costs too much memory). */
export const MAX_BACKGROUND_IMAGE_SIDE = 16_384

/** `background-<8 to 64 lowercase hex>.<png|jpg|webp>`: a plain name, never a path. */
const BACKGROUND_FILE = /^background-[0-9a-f]{8,64}\.(png|jpg|webp)$/

export const BACKGROUND_IMAGE_MIME: Readonly<Record<BackgroundImageType, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

export function isBackgroundImageFile(name: unknown): name is string {
  return typeof name === 'string' && BACKGROUND_FILE.test(name)
}

/** The project file the background shows, or null (not an image, or an unsafe name). */
export function backgroundImageFile(background: Style['background']): string | null {
  return background.kind === 'image' && isBackgroundImageFile(background.value)
    ? background.value
    : null
}

/** The name an image of this type and content hash is saved under. */
export function backgroundImageName(type: BackgroundImageType, hash: string): string {
  const name = `background-${hash.toLowerCase().slice(0, 16)}.${type}`
  if (!isBackgroundImageFile(name)) throw new TypeError('invalid background image hash')
  return name
}

/**
 * The real type of an image from its first bytes (magic numbers), whatever its extension
 * says; null when it is not a PNG, JPEG or WebP.
 */
export function sniffImageType(bytes: Uint8Array): BackgroundImageType | null {
  const at = (i: number) => bytes[i] ?? -1
  const ascii = (from: number, text: string) =>
    [...text].every((char, i) => at(from + i) === char.charCodeAt(0))
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => at(i) === byte) &&
    bytes.length > 8
  ) {
    return 'png'
  }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp'
  return null
}
