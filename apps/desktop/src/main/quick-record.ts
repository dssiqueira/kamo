// "Start recording" from outside Home (F-15): the tray menu, the Windows taskbar jump list and
// the Mac Dock menu. It records what Home would record: the last choice remembered in
// settings.json (F-01, A-08), falling back to a whole display when that choice is gone.
import type { AppSettings } from '../shared/api.ts'
import type { CaptureTarget } from '../shared/capture.ts'

/** Command-line flag of the jump list task; a second launch forwards it to the running app. */
export const START_RECORDING_FLAG = '--start-recording'

export interface QuickRecordInput {
  settings: Pick<AppSettings, 'lastCaptureKind' | 'lastDisplayId' | 'lastWindowId' | 'lastRegion'>
  /** Connected displays (Electron `Display.id` as strings). */
  displayIds: readonly string[]
  primaryDisplayId: string
  /** The open windows, when the last choice was a window (null: not listed). */
  windows: readonly { id: string; displayId: string | null }[] | null
}

/** The target to record, or null when there is no display at all. */
export function quickRecordTarget(input: QuickRecordInput): CaptureTarget | null {
  const { settings, displayIds, primaryDisplayId, windows } = input
  if (displayIds.length === 0) return null
  const display = (id: string | undefined) =>
    id !== undefined && displayIds.includes(id) ? id : undefined

  if (settings.lastCaptureKind === 'region' && settings.lastRegion) {
    const displayId = display(settings.lastRegion.displayId)
    if (displayId) return { kind: 'region', displayId, rect: { ...settings.lastRegion.rect } }
  }
  if (settings.lastCaptureKind === 'window' && settings.lastWindowId && windows) {
    const window = windows.find((w) => w.id === settings.lastWindowId)
    if (window) {
      const displayId = display(window.displayId ?? undefined)
      return { kind: 'window', windowId: window.id, ...(displayId ? { displayId } : {}) }
    }
  }
  const displayId =
    display(settings.lastDisplayId) ?? display(primaryDisplayId) ?? (displayIds[0] as string)
  return { kind: 'display', displayId }
}
