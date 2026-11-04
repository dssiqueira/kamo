// Trim of the start and the end (F-16). The raw video is never touched: the trim lives in
// project.trim and preview, zooms and export read it from there.
import type { MouseEventRecord } from '../events/events.ts'
import { MIN_TRIMMED_MS, type Project, type Zoom } from '../project/schema.ts'
import type { Range } from './zooms.ts'

/** Length the "Trim the last 2s?" suggestion removes (F-16). */
export const SUGGESTED_END_TRIM_MS = 2000

/** Shortest stretch a trim may leave: 1s, or the whole video when it is shorter than that. */
export function minTrimmedMs(durationMs: number): number {
  return Math.min(MIN_TRIMMED_MS, durationMs)
}

export function isTrimValid(durationMs: number, startMs: number, endMs: number): boolean {
  return startMs >= 0 && endMs <= durationMs && endMs - startMs >= minTrimmedMs(durationMs)
}

/**
 * Sets the trim, clamped to the video. A trim that would leave less than 1s is prevented
 * (F-16): the edge that moved stops at the limit; if both moved, nothing changes. Returns the
 * same project when nothing changes, so no undo step is recorded.
 */
export function setTrim(project: Project, startMs: number, endMs: number): Project {
  const { durationMs, trim } = project
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return project
  const minLength = minTrimmedMs(durationMs)
  let start = Math.min(Math.max(0, Math.round(startMs)), durationMs)
  let end = Math.min(Math.max(0, Math.round(endMs)), durationMs)
  if (end - start < minLength) {
    const startMoved = start !== trim.startMs
    const endMoved = end !== trim.endMs
    if (startMoved && !endMoved) start = Math.max(0, end - minLength)
    else if (endMoved && !startMoved) end = Math.min(durationMs, start + minLength)
    if (!isTrimValid(durationMs, start, end)) return project
  }
  if (start === trim.startMs && end === trim.endMs) return project
  return { ...project, trim: { startMs: start, endMs: end } }
}

/**
 * Zooms shown on the timeline: those that overlap the trim. The ones fully outside it
 * disappear from the timeline but stay in project.json (F-16).
 */
export function zoomsInTrim(zooms: readonly Zoom[], trim: Range): Zoom[] {
  return zooms.filter((zoom) => zoom.endMs > trim.startMs && zoom.startMs < trim.endMs)
}

/**
 * Optional "Trim the last 2s?" suggestion (F-16): when the recording ends with a left click
 * (the click on Stop) inside its last 2s, returns the suggested trim end. Otherwise null.
 * Trailing `up` and `move` events after that click are ignored.
 */
export function suggestEndTrim(
  events: readonly MouseEventRecord[],
  durationMs: number,
): number | null {
  const endMs = durationMs - SUGGESTED_END_TRIM_MS
  if (endMs < MIN_TRIMMED_MS) return null
  let last: MouseEventRecord | undefined
  for (const event of events) {
    if (event.type === 'move' || event.type === 'up') continue
    if (!last || event.t >= last.t) last = event
  }
  if (!last || last.type !== 'down' || last.button !== 'left') return null
  return last.t >= endMs && last.t <= durationMs ? endMs : null
}
