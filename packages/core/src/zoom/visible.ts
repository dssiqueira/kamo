import type { Zoom } from '../project/schema.ts'

/**
 * The "auto-zoom" toggle hides the automatic zooms without deleting them (F-05): preview
 * and export render only what this returns, while project.json keeps every zoom.
 */
export function visibleZooms(zooms: readonly Zoom[], settings: { autoZoom: boolean }): Zoom[] {
  return settings.autoZoom ? [...zooms] : zooms.filter((zoom) => zoom.origin === 'manual')
}
