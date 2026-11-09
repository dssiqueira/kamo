// Dates, numbers, durations and sizes always go through Intl (AGENTS.md rule 14).
import type { Locale } from './locales.ts'

export function formatDate(
  locale: Locale,
  date: Date | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(date)
}

/** Short date for a new project's default name ("03/11, 22:38" in pt-BR). */
export function formatProjectDate(locale: Locale, date: Date | number): string {
  return formatDate(locale, date, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

/** Human-readable duration, e.g. "2m 5s". For the timeline, use `formatTimecode`. */
export function formatDuration(locale: Locale, ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const duration = hours
    ? { hours, minutes, seconds }
    : minutes
      ? { minutes, seconds }
      : { seconds }
  return new Intl.DurationFormat(locale, { style: 'narrow' }).format(duration)
}

const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

// A no-break space between the number and the unit, so "152 MB" never wraps in a narrow panel.
export function formatFileSize(locale: Locale, bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
    value /= 1000
    unit++
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: SIZE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  })
    .format(value)
    .replace(/\s/g, '\u00a0')
}

/**
 * DESIGN.md timecode `hh:mm:ss:ff`. It is video notation, the same in every language,
 * so it does not go through Intl.
 */
export function formatTimecode(ms: number, fps = 30): string {
  const totalFrames = Math.floor((Math.max(0, ms) * fps) / 1000)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    Math.floor(totalSeconds / 3600),
    Math.floor((totalSeconds % 3600) / 60),
    totalSeconds % 60,
    frames,
  ]
    .map(pad)
    .join(':')
}
