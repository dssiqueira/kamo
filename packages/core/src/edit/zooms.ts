// Timeline edits on zoom blocks (F-09). Every function is pure: it returns a new Project
// that still passes the Project schema, or the same reference when the edit does nothing
// (unknown id, no room, no change), so callers can skip pushing an undo step.
import {
  DEFAULT_LEAD_MS,
  DEFAULT_ZOOM_SCALE,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_MS,
  MIN_ZOOM_SCALE,
  type Project,
  type Zoom,
} from '../project/schema.ts'
import { clampTarget } from '../zoom/generate.ts'

/** Length of a zoom created by double-clicking the track (F-09). */
export const CREATED_ZOOM_MS = 2000
/** Scale control step (F-09: 1.0Ã— to 4.0Ã— in steps of 0.25). */
export const ZOOM_SCALE_STEP = 0.25

export type ZoomEdge = 'start' | 'end'

export interface Range {
  startMs: number
  endMs: number
}

/**
 * Where a zoom may live while being edited. Edits stay inside the trim (blocks outside it
 * are hidden, F-16), widened to the zoom's own extent so a block that already straddles a
 * trim edge never jumps when touched. Always inside the video.
 */
function editBounds(project: Project, zoom: Zoom): Range {
  const { trim, durationMs } = project
  return {
    startMs: Math.max(0, Math.min(trim.startMs, zoom.startMs)),
    endMs: Math.min(durationMs, Math.max(trim.endMs, zoom.endMs)),
  }
}

/**
 * Free space around zoom `index`: from the end of the previous block to the start of the
 * next one, inside `bounds`. Rounded inwards to whole milliseconds, so integer results never
 * touch a fractional neighbor from the wrong side.
 */
function neighborLimits(zooms: readonly Zoom[], index: number, bounds: Range): Range {
  const previous = zooms[index - 1]
  const next = zooms[index + 1]
  return {
    startMs: Math.ceil(Math.max(previous?.endMs ?? 0, bounds.startMs)),
    endMs: Math.floor(Math.min(next?.startMs ?? Infinity, bounds.endMs)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function replaceZoom(project: Project, index: number, zoom: Zoom): Project {
  const zooms = project.zooms.slice()
  zooms[index] = zoom
  return { ...project, zooms }
}

function indexOf(project: Project, id: string): number {
  return project.zooms.findIndex((zoom) => zoom.id === id)
}

/**
 * Moves a block by `deltaMs` keeping its length. Dragging against a neighbor or the edge of
 * the trim stops at the limit (F-09: blocks never overlap). The result is snapped to whole ms.
 */
export function moveZoom(project: Project, id: string, deltaMs: number): Project {
  const index = indexOf(project, id)
  const zoom = project.zooms[index]
  if (!zoom || !Number.isFinite(deltaMs)) return project
  const limits = neighborLimits(project.zooms, index, editBounds(project, zoom))
  const length = Math.min(Math.round(zoom.endMs - zoom.startMs), limits.endMs - limits.startMs)
  if (length < MIN_ZOOM_MS) return project
  const startMs = clamp(Math.round(zoom.startMs + deltaMs), limits.startMs, limits.endMs - length)
  const endMs = startMs + length
  if (startMs === zoom.startMs && endMs === zoom.endMs) return project
  return replaceZoom(project, index, { ...zoom, startMs, endMs, origin: 'manual' })
}

/**
 * Pulls one edge of a block by `deltaMs`. The block never gets shorter than 600ms, never
 * crosses a neighbor and never goes past the trim or the end of the video (F-09 edge case).
 */
export function resizeZoom(project: Project, id: string, edge: ZoomEdge, deltaMs: number): Project {
  const index = indexOf(project, id)
  const zoom = project.zooms[index]
  if (!zoom || !Number.isFinite(deltaMs)) return project
  const limits = neighborLimits(project.zooms, index, editBounds(project, zoom))
  let { startMs, endMs } = zoom
  if (edge === 'start') {
    const latest = Math.floor(zoom.endMs - MIN_ZOOM_MS)
    if (latest < limits.startMs) return project
    startMs = clamp(Math.round(zoom.startMs + deltaMs), limits.startMs, latest)
  } else {
    const earliest = Math.ceil(zoom.startMs + MIN_ZOOM_MS)
    if (earliest > limits.endMs) return project
    endMs = clamp(Math.round(zoom.endMs + deltaMs), earliest, limits.endMs)
  }
  if (startMs === zoom.startMs && endMs === zoom.endMs) return project
  return replaceZoom(project, index, { ...zoom, startMs, endMs, origin: 'manual' })
}

/** Snaps a scale to the 0.25 grid inside 1.0â€“4.0. Non-finite input falls back to 2.0. */
export function snapZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_ZOOM_SCALE
  const snapped = Math.round(scale / ZOOM_SCALE_STEP) * ZOOM_SCALE_STEP
  return clamp(snapped, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE)
}

/** Sets the scale of a block (snapped to 0.25, 1.0â€“4.0). 1.0 keeps the block (F-09). */
export function setZoomScale(project: Project, id: string, scale: number): Project {
  const index = indexOf(project, id)
  const zoom = project.zooms[index]
  if (!zoom) return project
  const next = snapZoomScale(scale)
  if (next === zoom.scale) return project
  return replaceZoom(project, index, { ...zoom, scale: next, origin: 'manual' })
}

export function deleteZoom(project: Project, id: string): Project {
  const zooms = project.zooms.filter((zoom) => zoom.id !== id)
  return zooms.length === project.zooms.length ? project : { ...project, zooms }
}

/**
 * The empty stretch of the zoom track at `tMs`, inside the trim, or null when `tMs` falls
 * on a block or outside the trim. Whole milliseconds, rounded inwards.
 */
export function zoomGapAt(
  zooms: readonly Zoom[],
  trim: Range,
  durationMs: number,
  tMs: number,
): Range | null {
  const lo = Math.max(0, trim.startMs)
  const hi = Math.min(durationMs, trim.endMs)
  if (!(tMs >= lo && tMs <= hi)) return null
  let startMs = lo
  let endMs = hi
  for (const zoom of zooms) {
    if (zoom.endMs <= tMs) startMs = Math.max(startMs, zoom.endMs)
    else if (zoom.startMs >= tMs) endMs = Math.min(endMs, zoom.startMs)
    else return null
  }
  return { startMs: Math.ceil(startMs), endMs: Math.floor(endMs) }
}

/** A fresh zoom id that is not in `zooms` yet, like the generator's `auto-<ms>`. */
export function newZoomId(zooms: readonly Zoom[], startMs: number): string {
  const used = new Set(zooms.map((zoom) => zoom.id))
  const base = `manual-${Math.round(startMs)}`
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

export interface CreateZoomOptions {
  /** id for the new block; defaults to `newZoomId` */
  id?: string
  durationMs?: number
  scale?: number
}

/**
 * Creates a 2s, 2.0Ã— manual block centered on `tMs` (F-09 double-click), with `target`
 * usually the cursor position at that instant (`cursorAt`). If the gap is tight the block
 * is shifted and then shrunk to fit; with less than 600ms of room nothing is created.
 */
export function createZoomAt(
  project: Project,
  tMs: number,
  target: { x: number; y: number },
  options: CreateZoomOptions = {},
): Project {
  const gap = zoomGapAt(project.zooms, project.trim, project.durationMs, tMs)
  if (!gap) return project
  const room = gap.endMs - gap.startMs
  const length = Math.min(Math.round(options.durationMs ?? CREATED_ZOOM_MS), room)
  if (!(length >= MIN_ZOOM_MS)) return project
  const startMs = clamp(Math.round(tMs - length / 2), gap.startMs, gap.endMs - length)
  const scale = snapZoomScale(options.scale ?? DEFAULT_ZOOM_SCALE)
  const zoom: Zoom = {
    id: options.id ?? newZoomId(project.zooms, startMs),
    startMs,
    endMs: startMs + length,
    scale,
    target: clampTarget(target, project.source, scale),
    follow: true,
    origin: 'manual',
    leadMs: DEFAULT_LEAD_MS,
  }
  if (project.zooms.some((other) => other.id === zoom.id)) return project
  const zooms = [...project.zooms, zoom].sort((a, b) => a.startMs - b.startMs)
  return { ...project, zooms }
}
