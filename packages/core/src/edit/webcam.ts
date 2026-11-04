// Timeline edits on the webcam bubble's hidden stretches (A-03). Same contract as the zoom
// edits: pure, the result still passes the Project schema, and the same reference comes
// back when nothing changes (no webcam, unknown index, no room), so callers skip the undo.
//
// Stretches are kept sorted and never overlap, so a stretch is addressed by its index and
// a drag never reorders them.
import type { Project, WebcamSettings } from '../project/schema.ts'
import type { Range, ZoomEdge } from './zooms.ts'

/** Length of a stretch added at the playhead. */
export const CREATED_WEBCAM_HIDDEN_MS = 2000
/** Shortest hidden stretch (shorter ones would only flicker). */
export const MIN_WEBCAM_HIDDEN_MS = 500

function withHidden(project: Project, webcam: WebcamSettings, hidden: Range[]): Project {
  return { ...project, webcam: { ...webcam, hidden } }
}

/** What the side panel and the preview can change on the bubble. */
export type WebcamPatch = Partial<Omit<WebcamSettings, 'hidden' | 'offsetMs' | 'anchor'>> & {
  /** null drops the free placement (back to `position`'s corner) */
  anchor?: { x: number; y: number } | null
}

/**
 * Updates the bubble's settings (visible, position, anchor, size, shrinkOnZoom). Picking a
 * corner without an anchor sends the bubble back to that corner.
 */
export function setWebcam(project: Project, patch: WebcamPatch): Project {
  const webcam = project.webcam
  if (!webcam) return project
  const { anchor, ...rest } = patch
  const next: WebcamSettings = { ...webcam }
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    if (rest[key] !== undefined) Object.assign(next, { [key]: rest[key] })
  }
  if (anchor) next.anchor = anchor
  else if (anchor === null || (patch.position !== undefined && anchor === undefined)) {
    delete next.anchor
  }
  const changed =
    (Object.keys(next) as (keyof WebcamSettings)[]).some(
      (key) => key !== 'anchor' && next[key] !== webcam[key],
    ) ||
    ('anchor' in webcam && !('anchor' in next)) ||
    (next.anchor !== undefined &&
      (next.anchor.x !== webcam.anchor?.x || next.anchor.y !== webcam.anchor?.y))
  return changed ? { ...project, webcam: next } : project
}

/**
 * The free stretch of the webcam lane at `tMs`, inside the trim, or null when `tMs` falls
 * on a hidden stretch or outside the trim. Whole milliseconds, rounded inwards.
 */
export function webcamGapAt(
  hidden: readonly Range[],
  trim: Range,
  durationMs: number,
  tMs: number,
): Range | null {
  const lo = Math.max(0, trim.startMs)
  const hi = Math.min(durationMs, trim.endMs)
  if (!(tMs >= lo && tMs <= hi)) return null
  let startMs = lo
  let endMs = hi
  for (const range of hidden) {
    if (range.endMs <= tMs) startMs = Math.max(startMs, range.endMs)
    else if (range.startMs >= tMs) endMs = Math.min(endMs, range.startMs)
    else return null
  }
  return { startMs: Math.ceil(startMs), endMs: Math.floor(endMs) }
}

/**
 * Hides the bubble for 2s centered on `tMs`, shifted and then shrunk to fit the free
 * stretch there; with less than MIN_WEBCAM_HIDDEN_MS of room nothing changes.
 */
export function addWebcamHidden(
  project: Project,
  tMs: number,
  lengthMs = CREATED_WEBCAM_HIDDEN_MS,
): Project {
  const webcam = project.webcam
  if (!webcam || !Number.isFinite(tMs)) return project
  const gap = webcamGapAt(webcam.hidden, project.trim, project.durationMs, tMs)
  if (!gap) return project
  const length = Math.min(Math.round(lengthMs), gap.endMs - gap.startMs)
  if (!(length >= MIN_WEBCAM_HIDDEN_MS)) return project
  const startMs = clamp(Math.round(tMs - length / 2), gap.startMs, gap.endMs - length)
  const hidden = [...webcam.hidden, { startMs, endMs: startMs + length }].sort(
    (a, b) => a.startMs - b.startMs,
  )
  return withHidden(project, webcam, hidden)
}

/** Free space around stretch `index`: between its neighbors, inside the video. */
function limitsOf(hidden: readonly Range[], index: number, durationMs: number): Range {
  return {
    startMs: Math.ceil(Math.max(hidden[index - 1]?.endMs ?? 0, 0)),
    endMs: Math.floor(Math.min(hidden[index + 1]?.startMs ?? Infinity, durationMs)),
  }
}

/** Moves stretch `index` by `deltaMs`, keeping its length; stops at neighbors and the ends. */
export function moveWebcamHidden(project: Project, index: number, deltaMs: number): Project {
  const webcam = project.webcam
  const range = webcam?.hidden[index]
  if (!webcam || !range || !Number.isFinite(deltaMs)) return project
  const limits = limitsOf(webcam.hidden, index, project.durationMs)
  const length = Math.min(Math.round(range.endMs - range.startMs), limits.endMs - limits.startMs)
  if (length < MIN_WEBCAM_HIDDEN_MS) return project
  const startMs = clamp(Math.round(range.startMs + deltaMs), limits.startMs, limits.endMs - length)
  if (startMs === range.startMs && startMs + length === range.endMs) return project
  const hidden = webcam.hidden.slice()
  hidden[index] = { startMs, endMs: startMs + length }
  return withHidden(project, webcam, hidden)
}

/** Pulls one edge of stretch `index`; never shorter than the minimum, never over a neighbor. */
export function resizeWebcamHidden(
  project: Project,
  index: number,
  edge: ZoomEdge,
  deltaMs: number,
): Project {
  const webcam = project.webcam
  const range = webcam?.hidden[index]
  if (!webcam || !range || !Number.isFinite(deltaMs)) return project
  const limits = limitsOf(webcam.hidden, index, project.durationMs)
  let { startMs, endMs } = range
  if (edge === 'start') {
    const latest = Math.floor(range.endMs - MIN_WEBCAM_HIDDEN_MS)
    if (latest < limits.startMs) return project
    startMs = clamp(Math.round(range.startMs + deltaMs), limits.startMs, latest)
  } else {
    const earliest = Math.ceil(range.startMs + MIN_WEBCAM_HIDDEN_MS)
    if (earliest > limits.endMs) return project
    endMs = clamp(Math.round(range.endMs + deltaMs), earliest, limits.endMs)
  }
  if (startMs === range.startMs && endMs === range.endMs) return project
  const hidden = webcam.hidden.slice()
  hidden[index] = { startMs, endMs }
  return withHidden(project, webcam, hidden)
}

export function deleteWebcamHidden(project: Project, index: number): Project {
  const webcam = project.webcam
  if (!webcam || !webcam.hidden[index]) return project
  return withHidden(
    project,
    webcam,
    webcam.hidden.filter((_, i) => i !== index),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
