// Export file names (F-11): `<project name> <format> <resolution><fps>.mp4`, e.g.
// `Demo 16x9 1080p30.mp4`, `Demo 16x9 720p15.gif` (A-02). Pure, so the desktop main process re-checks names with it too.
import type { Aspect } from '../project/schema.ts'
import type { Resolution } from '../render/layout.ts'

/** `16:9` → `16x9`: a colon is not allowed in Windows file names. */
export function aspectFileLabel(aspect: Aspect): string {
  return aspect.replace(':', 'x')
}

/** Longest base name kept (before the format suffix), well under every OS limit. */
export const MAX_FILE_BASE_LENGTH = 120

// Invalid on Windows (`<>:"/\|?*`) or macOS (`/`, `:`), plus control characters.
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i

/**
 * Makes a string safe as a file name on Windows and macOS: invalid characters become a
 * space, runs of spaces collapse, trailing dots and spaces go (Windows drops them), reserved
 * device names (CON, NUL…) get an underscore and the result is never empty.
 */
export function sanitizeFileName(name: string, fallback = 'Kamo'): string {
  let clean = name
    .normalize('NFC')
    .replace(INVALID_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
  if (clean.length > MAX_FILE_BASE_LENGTH) {
    // Cut on a code point boundary, then clean the end again.
    clean = Array.from(clean)
      .slice(0, MAX_FILE_BASE_LENGTH)
      .join('')
      .replace(/[. ]+$/, '')
  }
  if (!clean) return fallback
  if (WINDOWS_RESERVED.test(clean.split('.')[0] ?? '')) clean = `${clean}_`
  return clean
}

export interface ExportNameInput {
  projectName: string
  aspect: Aspect
  /** `720p`: the GIF size (A-02) */
  resolution: Resolution | '720p'
  /** 30 or 60 for an MP4, 10 or 15 for a GIF */
  fps: number
  extension?: 'mp4' | 'gif'
}

/** `Demo 16x9 1080p30.mp4` (F-11). */
export function exportFileName({
  projectName,
  aspect,
  resolution,
  fps,
  extension = 'mp4',
}: ExportNameInput): string {
  return `${sanitizeFileName(projectName)} ${aspectFileLabel(aspect)} ${resolution}${fps}.${extension}`
}

/**
 * Name for the n-th file with the same name (n ≥ 2): `Demo 16x9 1080p30 (2).mp4` (F-11).
 * n = 1 returns the name unchanged.
 */
export function numberedFileName(fileName: string, n: number): string {
  if (n <= 1) return fileName
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} (${n})`
  return `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}`
}
