// Times reach the agent twice: exact milliseconds and a readable hh:mm:ss timecode.

/** `65_300` → `00:01:05`. Floors to the second; negative values clamp to zero. */
export function timecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

/** Rounds to whole milliseconds so float noise from the recorder never reaches the agent. */
export function roundMs(ms: number): number {
  return Math.round(ms)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a filter bound. A bare date (`2026-11-04`) is a whole day in local time: as `from`
 * it means the start of that day, as `to` the end of it. Anything else goes through `Date`.
 */
export function parseDateBound(value: string, edge: 'start' | 'end'): Date | null {
  const match = DATE_ONLY.exec(value.trim())
  if (match) {
    const [, y, m, d] = match
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (edge === 'end') date.setHours(23, 59, 59, 999)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
