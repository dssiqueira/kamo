// What Home records (F-01, A-08): a whole display, one window or a region of a display. Pure
// selection logic, tested without React.
import type { DisplayOption } from './pickDisplay.ts'

export type CaptureKind = 'display' | 'window' | 'region'

/** A window Home can record (A-08). */
export interface WindowOption {
  id: string
  title: string
  /** Executable or application name; may be empty. */
  app: string
  /** JPEG data URL, or null when the OS gave none. */
  thumbnail: string | null
}

/** The region chosen on a display, with its size in pixels of the recording. */
export interface RegionOption {
  displayId: string
  width: number
  height: number
}

/** Folds case and accents, so "cafe" finds "Café". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/** The windows whose title or app contains every word of the search. */
export function filterWindows<T extends WindowOption>(windows: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...windows]
  return windows.filter((window) => {
    const text = fold(`${window.title} ${window.app}`)
    return words.every((word) => text.includes(word))
  })
}

/**
 * Which window is selected after the list changes: the current one while it is open, else the
 * one picked last time, else the first (the front-most window). Null when there is none.
 */
export function pickWindow(
  windows: readonly WindowOption[],
  current: string | null,
  remembered: string | null = null,
): string | null {
  for (const id of [current, remembered]) {
    if (id !== null && windows.some((w) => w.id === id)) return id
  }
  return windows[0]?.id ?? null
}

/** What the Record button says it records, or null when nothing is chosen yet. */
export type RecordTarget =
  | { kind: 'display'; name: string }
  | { kind: 'window'; title: string }
  | { kind: 'region'; width: number; height: number }

export function recordTarget(input: {
  kind: CaptureKind
  displays: readonly DisplayOption[]
  selectedDisplayId: string | null
  displayName(display: DisplayOption, index: number): string
  windows: readonly WindowOption[] | null
  selectedWindowId: string | null
  region: RegionOption | null
}): RecordTarget | null {
  if (input.kind === 'window') {
    const window = input.windows?.find((w) => w.id === input.selectedWindowId)
    return window ? { kind: 'window', title: window.title || window.app } : null
  }
  if (input.kind === 'region') {
    const { region } = input
    return region && region.displayId === input.selectedDisplayId
      ? { kind: 'region', width: region.width, height: region.height }
      : null
  }
  const index = input.displays.findIndex((d) => d.id === input.selectedDisplayId)
  const display = input.displays[index]
  return display ? { kind: 'display', name: input.displayName(display, index) } : null
}

/** Long window titles are cut for the button (the full title is in the list). */
export function shortTitle(title: string, max = 40): string {
  const chars = [...title.trim()]
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`
}
