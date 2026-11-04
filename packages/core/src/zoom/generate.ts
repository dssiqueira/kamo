// Automatic zoom generation (F-05, docs/data-model.md "Automatic zoom generation rules").
// Pure and deterministic: the same events, video and existing zooms always give the same
// zooms, so "Regenerate zooms" is idempotent and the result can be snapshot-tested.
import type { MouseEventRecord } from '../events/events.ts'
import { DEFAULT_LEAD_MS, DEFAULT_ZOOM_SCALE, MIN_ZOOM_MS, type Zoom } from '../project/schema.ts'

export interface ZoomGenerationOptions {
  /** the shot starts this long before its first click, so the camera arrives in time */
  leadMs: number
  /** the shot holds this long after its last click (for a drag: after the release) */
  tailMs: number
  /** a click joins the current shot only if it comes less than this after the last one */
  groupGapMs: number
  /**
   * ...and only if it lands within this fraction of the video diagonal from the shot's
   * first click (1920×1080: 0.25 × 2203 ≈ 551px)
   */
  groupRadius: number
  /** zoom scale of every generated shot */
  scale: number
}

export const DEFAULT_ZOOM_GENERATION: ZoomGenerationOptions = {
  leadMs: DEFAULT_LEAD_MS,
  tailMs: 1000,
  groupGapMs: 1500,
  groupRadius: 0.25,
  scale: DEFAULT_ZOOM_SCALE,
}

export interface ZoomGenerationInput {
  /** mouse events sorted by `t` (as `parseEvents` returns them; unsorted input is sorted) */
  events: readonly MouseEventRecord[]
  /** size of the recorded video in pixels: the space of the event coordinates */
  video: { width: number; height: number }
  durationMs: number
  /** the project's current zooms: `manual` ones are kept untouched (rule 9) */
  existing?: readonly Zoom[]
  options?: Partial<ZoomGenerationOptions>
}

export interface ZoomGeneration {
  /** manual zooms untouched plus the regenerated auto zooms; sorted, never overlapping */
  zooms: Zoom[]
  /** no left click inside the video: drives the "no clicks, nothing to zoom into" notice */
  noClicks: boolean
}

interface Click {
  downMs: number
  /** the matching `up` (end of a drag); the `down` itself if the release never came */
  releaseMs: number
  x: number
  y: number
}

interface Shot {
  startMs: number
  endMs: number
  target: { x: number; y: number }
}

/**
 * Turns the left clicks of a recording into zoom blocks and merges them with the project's
 * manual zooms. Regenerating replaces every `auto` zoom and never touches a `manual` one.
 */
export function generateZooms(input: ZoomGenerationInput): ZoomGeneration {
  const options = { ...DEFAULT_ZOOM_GENERATION, ...input.options }
  const { video, durationMs } = input
  const clicks = leftClicks(sortedEvents(input.events), video, durationMs)
  const manual = (input.existing ?? [])
    .filter((zoom) => zoom.origin === 'manual')
    .sort((a, b) => a.startMs - b.startMs)

  const shots = mergeOverlapping(
    groupClicks(clicks, video, options).flatMap((group) => {
      const shot = shotFor(group, durationMs, options)
      return shot ? [shot] : []
    }),
  )

  const usedIds = new Set(manual.map((zoom) => zoom.id))
  const auto: Zoom[] = []
  for (const shot of shots) {
    for (const [startMs, endMs] of subtract([shot.startMs, shot.endMs], manual)) {
      if (endMs - startMs < MIN_ZOOM_MS) continue
      auto.push({
        id: uniqueId(`auto-${Math.round(startMs)}`, usedIds),
        startMs,
        endMs,
        scale: options.scale,
        target: clampTarget(shot.target, video, options.scale),
        follow: true,
        origin: 'auto',
        leadMs: options.leadMs,
      })
    }
  }

  return {
    zooms: [...manual, ...auto].sort((a, b) => a.startMs - b.startMs),
    noClicks: clicks.length === 0,
  }
}

function sortedEvents(events: readonly MouseEventRecord[]): readonly MouseEventRecord[] {
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.t < events[i - 1]!.t) return [...events].sort((a, b) => a.t - b.t)
  }
  return events
}

/** Rule 1: each left-button `down` inside the video is a candidate. Right/middle never zoom. */
function leftClicks(
  events: readonly MouseEventRecord[],
  video: { width: number; height: number },
  durationMs: number,
): Click[] {
  const clicks: Click[] = []
  let pressed: Click | null = null
  for (const event of events) {
    if (event.type !== 'down' && event.type !== 'up') continue
    if (event.button !== 'left') continue
    if (event.type === 'up') {
      if (pressed) pressed.releaseMs = event.t
      pressed = null
      continue
    }
    pressed = null
    const inside = event.x >= 0 && event.x <= video.width && event.y >= 0 && event.y <= video.height
    if (!inside || event.t > durationMs) continue
    pressed = { downMs: event.t, releaseMs: event.t, x: event.x, y: event.y }
    clicks.push(pressed)
  }
  return clicks
}

/**
 * Rule 2: a click joins the current shot when it comes less than `groupGapMs` after the
 * previous click's release AND lands within `groupRadius` × video diagonal of the shot's
 * first click. Measuring the distance from the first click (not the previous one) keeps a
 * chain of small steps from walking the shot across the whole screen.
 */
function groupClicks(
  clicks: readonly Click[],
  video: { width: number; height: number },
  options: ZoomGenerationOptions,
): Click[][] {
  const radius = options.groupRadius * Math.hypot(video.width, video.height)
  const groups: Click[][] = []
  let current: Click[] | null = null
  for (const click of clicks) {
    const first = current?.[0]
    const last = current?.[current.length - 1]
    if (
      current &&
      first &&
      last &&
      click.downMs - last.releaseMs < options.groupGapMs &&
      Math.hypot(click.x - first.x, click.y - first.y) <= radius
    ) {
      current.push(click)
    } else {
      current = [click]
      groups.push(current)
    }
  }
  return groups
}

/**
 * Rule 3: from `leadMs` before the first click to `tailMs` after the last release, clamped
 * to the video. Shorter than 600ms (a click right at the end) grows on both sides within
 * the video; a video shorter than 600ms gets no zoom at all.
 */
function shotFor(
  group: readonly Click[],
  durationMs: number,
  options: ZoomGenerationOptions,
): Shot | null {
  const first = group[0]
  if (!first || durationMs < MIN_ZOOM_MS) return null
  const lastRelease = Math.max(...group.map((click) => click.releaseMs))
  let startMs = Math.max(0, Math.round(first.downMs - options.leadMs))
  let endMs = Math.min(durationMs, Math.round(lastRelease + options.tailMs))
  const missing = MIN_ZOOM_MS - (endMs - startMs)
  if (missing > 0) {
    startMs -= Math.floor(missing / 2)
    endMs += Math.ceil(missing / 2)
    if (startMs < 0) {
      endMs -= startMs
      startMs = 0
    }
    if (endMs > durationMs) {
      startMs -= endMs - durationMs
      endMs = durationMs
    }
  }
  // Target: plain centroid of the clicks. Grouped clicks are at most a quarter diagonal
  // from the first one, so the centroid keeps all of them in frame, and `follow` carries
  // the camera along a drag.
  const target = {
    x: group.reduce((sum, click) => sum + click.x, 0) / group.length,
    y: group.reduce((sum, click) => sum + click.y, 0) / group.length,
  }
  return { startMs, endMs, target }
}

/**
 * Rule 4: shots that collide merge into one covering both spans. The larger shot (longer
 * duration; on a tie, the earlier one) absorbs the smaller and keeps its target.
 */
function mergeOverlapping(shots: readonly Shot[]): Shot[] {
  const merged: Shot[] = []
  for (const shot of shots) {
    const previous = merged[merged.length - 1]
    if (!previous || shot.startMs >= previous.endMs) {
      merged.push({ ...shot })
      continue
    }
    const larger = shot.endMs - shot.startMs > previous.endMs - previous.startMs ? shot : previous
    merged[merged.length - 1] = {
      startMs: Math.min(previous.startMs, shot.startMs),
      endMs: Math.max(previous.endMs, shot.endMs),
      target: larger.target,
    }
  }
  return merged
}

/** Rule 5 (AGENTS.md rule 9): the parts of a span not covered by any manual zoom. */
function subtract(span: [number, number], manual: readonly Zoom[]): [number, number][] {
  const pieces: [number, number][] = []
  let [startMs] = span
  const endMs = span[1]
  for (const zoom of manual) {
    if (zoom.endMs <= startMs) continue
    if (zoom.startMs >= endMs) break
    if (zoom.startMs > startMs) pieces.push([startMs, zoom.startMs])
    startMs = Math.max(startMs, zoom.endMs)
    if (startMs >= endMs) return pieces
  }
  if (startMs < endMs) pieces.push([startMs, endMs])
  return pieces
}

/** Edge clicks: shift the target so the zoomed viewport never shows outside the video. */
export function clampTarget(
  target: { x: number; y: number },
  video: { width: number; height: number },
  scale: number,
): { x: number; y: number } {
  const halfWidth = video.width / scale / 2
  const halfHeight = video.height / scale / 2
  return {
    x: Math.min(Math.max(target.x, halfWidth), video.width - halfWidth),
    y: Math.min(Math.max(target.y, halfHeight), video.height - halfHeight),
  }
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}
