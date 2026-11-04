export interface DisplayOption {
  id: string
  /** OS label (monitor model); empty when the OS gives none. */
  label: string
  /** Physical pixels, what the recording will have. */
  width: number
  height: number
  primary: boolean
  thumbnail: string | null
}

/**
 * Which display is selected after the list changes (F-01): keep the current one if it is
 * still connected, else the remembered one, else the primary, else the first.
 */
export function pickDisplay(
  displays: readonly DisplayOption[],
  current: string | null,
  remembered: string | null = null,
): string | null {
  for (const id of [current, remembered]) {
    if (id !== null && displays.some((d) => d.id === id)) return id
  }
  return (displays.find((d) => d.primary) ?? displays[0])?.id ?? null
}
