// Text on the toolbar icon while recording (E-01: "the icon shows the time on the badge").
// A badge fits about 4 characters, so the time shortens as the recording grows.

/**
 * `0:42` and `9:59` under ten minutes, then whole minutes (`12m`, `1h`) through Intl, so the
 * unit follows the browser language.
 */
export function formatBadge(elapsedMs: number, locale: string): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 10) {
    const seconds = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(
      totalSeconds % 60,
    )
    return `${new Intl.NumberFormat(locale).format(minutes)}:${seconds}`
  }
  const unit = (value: number, name: 'minute' | 'hour') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(
      value,
    )
  return minutes < 60 ? unit(minutes, 'minute') : unit(Math.floor(minutes / 60), 'hour')
}
