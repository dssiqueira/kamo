// Virtual camera (F-06): turns the project's zooms into a smooth, deterministic camera path.
//
// The path is simulated once, from before t = 0 to the end, on a fixed internal clock
// (CAMERA_SAMPLE_RATE_HZ) with the exact closed-form spring. Preview and export only read
// the precomputed samples, so every frame rate sees the same camera at the same instant
// (rule 11), and the motion is always the 170/26 spring, never linear (rule 10).
import type { MouseEventRecord } from '../events/events.ts'
import type { Zoom } from '../project/schema.ts'
import { springSettleTime, springStep, type SpringState } from '../spring.ts'

/**
 * Internal simulation rate. 240Hz is a common multiple of 30, 60 and 120fps, so frames at
 * those rates land on (or halfway between) samples, and it is dense enough that linear
 * interpolation between samples is invisible. 10 minutes = 144k samples, a few MB.
 */
export const CAMERA_SAMPLE_RATE_HZ = 240

/**
 * Fraction of the distance still left when the camera "arrives". Starting from rest, the
 * spring leaves this fraction of any move after CAMERA_TRAVEL_MS, whatever the distance,
 * because the spring is linear.
 */
export const CAMERA_ARRIVAL_EPSILON = 0.005

/**
 * How long the camera travels before a click: the spring settle time for a unit move to
 * CAMERA_ARRIVAL_EPSILON (~0.6s for 170/26). The camera starts toward a zoom this long
 * before the click, so it is there at the click (± well under a frame).
 */
export const CAMERA_TRAVEL_MS = springSettleTime(1, CAMERA_ARRIVAL_EPSILON) * 1000

/**
 * Shortest hold on a zoom's target after its click, even when the zoom ends right there,
 * so the camera is still on target one frame after the click.
 */
export const CAMERA_MIN_HOLD_MS = 100

/**
 * With follow on, the cursor moves freely inside this central fraction of the visible
 * half-extent (a dead zone, so the camera does not jitter); past it, the camera pans just
 * enough to bring the cursor back to the edge of the dead zone.
 */
export const FOLLOW_DEAD_ZONE = 0.6

/** Hard limit: with follow on, the cursor never gets closer than this to the frame edge. */
export const FOLLOW_EDGE_MARGIN = 0.05

export interface VideoSize {
  width: number
  height: number
}

export interface CameraInput {
  /** sorted by startMs, not overlapping (the project schema guarantees it) */
  zooms: readonly Zoom[]
  /** mouse events sorted by `t`; `outside` moves are ignored */
  events: readonly MouseEventRecord[]
  video: VideoSize
  durationMs: number
  /** internal simulation rate; keep the default so preview and export agree */
  sampleRateHz?: number
}

export interface CameraState {
  /** center of the visible area, in pixels of the recorded video */
  x: number
  y: number
  /** 1 = whole video, 2 = half the width and height, … */
  scale: number
}

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

export interface CameraTrack {
  readonly video: VideoSize
  readonly durationMs: number
  readonly sampleRateHz: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly scale: Float64Array
}

interface Phase {
  /** ms, inclusive */
  from: number
  /** ms, exclusive */
  to: number
  /** null = rest (scale 1, centered) */
  zoom: Zoom | null
  /** click instant: the camera is on target here; follow starts here */
  clickMs: number
}

/** Precomputes the camera for the whole recording. Pure and deterministic. */
export function buildCameraTrack(input: CameraInput): CameraTrack {
  const { video, events } = input
  const durationMs = Math.max(0, input.durationMs)
  const sampleRateHz = input.sampleRateHz ?? CAMERA_SAMPLE_RATE_HZ
  const stepMs = 1000 / sampleRateHz
  const count = Math.floor((durationMs * sampleRateHz) / 1000) + 2
  const xs = new Float64Array(count)
  const ys = new Float64Array(count)
  const scales = new Float64Array(count)

  const phases = planPhases(input.zooms)
  const rest: CameraState = { x: video.width / 2, y: video.height / 2, scale: 1 }
  let sx: SpringState = { x: rest.x, v: 0 }
  let sy: SpringState = { x: rest.y, v: 0 }
  let ss: SpringState = { x: 1, v: 0 }

  let phaseIndex = 0
  let eventIndex = 0
  let cursor: { x: number; y: number } | null = null
  // Desired center while following: moves only when the cursor leaves the dead zone.
  let followCenter: { x: number; y: number } | null = null
  let followPhase = -1

  const advanceCursor = (t: number) => {
    for (; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex]
      if (!event || event.t > t) break
      if (event.type === 'move' && event.outside) continue
      cursor = { x: event.x, y: event.y }
    }
  }

  const phaseAt = (t: number): Phase | undefined => {
    while (phaseIndex < phases.length - 1 && (phases[phaseIndex]?.to ?? Infinity) <= t) {
      phaseIndex++
    }
    return phases[phaseIndex]
  }

  const targetAt = (t: number): CameraState => {
    const phase = phaseAt(t)
    const zoom = phase?.zoom
    if (!phase || !zoom || t < phase.from || t >= phase.to) return rest
    const scale = zoom.scale
    const base = clampCenter(zoom.target, scale, video)
    if (!zoom.follow || t < phase.clickMs) return { ...base, scale }
    if (followPhase !== phaseIndex) {
      followPhase = phaseIndex
      followCenter = base
    }
    advanceCursor(t)
    const center = followCenter ?? base
    if (cursor) {
      const reachX = (video.width / (2 * scale)) * FOLLOW_DEAD_ZONE
      const reachY = (video.height / (2 * scale)) * FOLLOW_DEAD_ZONE
      const next = {
        x: pullInside(center.x, cursor.x, reachX),
        y: pullInside(center.y, cursor.y, reachY),
      }
      followCenter = clampCenter(next, scale, video)
    }
    return { ...(followCenter ?? base), scale }
  }

  /** With follow on, the cursor never leaves the frame, even if the spring lags behind. */
  const keepCursorInFrame = (t: number) => {
    const phase = phases[phaseIndex]
    const zoom = phase?.zoom
    if (!phase || !zoom?.follow || t < phase.clickMs || t >= phase.to) return
    advanceCursor(t)
    if (!cursor) return
    const scale = Math.max(1, ss.x)
    const reachX = (video.width / (2 * scale)) * (1 - FOLLOW_EDGE_MARGIN)
    const reachY = (video.height / (2 * scale)) * (1 - FOLLOW_EDGE_MARGIN)
    sx = { x: pullInside(sx.x, cursor.x, reachX), v: sx.v }
    sy = { x: pullInside(sy.x, cursor.y, reachY), v: sy.v }
  }

  /** Steps the springs from t0 to t1, splitting exactly at phase boundaries. */
  const advance = (t0: number, t1: number) => {
    let t = t0
    while (t < t1) {
      const phase = phaseAt(t)
      const boundary = !phase
        ? Infinity
        : t < phase.from
          ? phase.from
          : t < phase.to
            ? phase.to
            : Infinity
      const end = Math.min(t1, boundary)
      const target = targetAt(t)
      const dt = (end - t) / 1000
      sx = springStep(sx, target.x, dt)
      sy = springStep(sy, target.y, dt)
      ss = springStep(ss, target.scale, dt)
      t = end
      keepCursorInFrame(t)
    }
  }

  // Pre-roll: a zoom near the start may need to depart before t = 0 to arrive on time.
  const start = Math.min(0, phases[0]?.from ?? 0)
  advance(start, 0)
  let t = 0
  for (let k = 0; k < count; k++) {
    const tk = k * stepMs
    advance(t, tk)
    t = tk
    const scale = Math.max(1, ss.x)
    const center = clampCenter({ x: sx.x, y: sy.x }, scale, video)
    xs[k] = center.x
    ys[k] = center.y
    scales[k] = scale
  }

  return { video, durationMs, sampleRateHz, x: xs, y: ys, scale: scales }
}

/** Camera at any instant: O(1), linear between the precomputed samples. */
export function cameraAt(track: CameraTrack, tMs: number): CameraState {
  const last = track.scale.length - 1
  const position = Math.min(Math.max(0, (tMs * track.sampleRateHz) / 1000), last)
  const i = Math.min(Math.floor(position), Math.max(0, last - 1))
  const j = Math.min(i + 1, last)
  const f = position - i
  const lerp = (a: Float64Array) => {
    const from = a[i] ?? 0
    return from + ((a[j] ?? from) - from) * f
  }
  const scale = Math.max(1, lerp(track.scale))
  return { ...clampCenter({ x: lerp(track.x), y: lerp(track.y) }, scale, track.video), scale }
}

/** Visible rectangle at any instant, in pixels of the recorded video. Always inside it. */
export function viewportAt(track: CameraTrack, tMs: number): Viewport {
  const { x, y, scale } = cameraAt(track, tMs)
  const width = track.video.width / scale
  const height = track.video.height / scale
  return { x: x - width / 2, y: y - height / 2, width, height }
}

/** Instant the camera must be on a zoom's target: the click it was generated from. */
export function zoomClickMs(zoom: Zoom): number {
  return Math.min(zoom.startMs + zoom.leadMs, zoom.endMs)
}

/**
 * Turns the zooms into a schedule of spring targets.
 *
 * Arrival: a zoom's target is switched on CAMERA_TRAVEL_MS before its click (earlier than
 * startMs when leadMs is shorter than the travel), so the spring, starting from rest, is
 * within CAMERA_ARRIVAL_EPSILON of the target at the click. A zoom is never released
 * before CAMERA_MIN_HOLD_MS after its click, so a zoom too short for the spring still
 * arrives (its departure moves earlier instead); the way back then starts right after.
 *
 * Adjacent zooms: when the next zoom departs less than a full travel after this one ends
 * (not enough time to settle at 1.0×), the camera goes straight from one target to the
 * next, holding the current one until the next departure.
 */
function planPhases(zooms: readonly Zoom[]): Phase[] {
  const phases: Phase[] = []
  let previousEnd = -Infinity
  zooms.forEach((zoom, i) => {
    const clickMs = zoomClickMs(zoom)
    const depart = clickMs - CAMERA_TRAVEL_MS
    const from = Math.max(depart, previousEnd)
    const hold = clickMs + CAMERA_MIN_HOLD_MS
    let to = Math.max(zoom.endMs, hold)
    const next = zooms[i + 1]
    if (next) {
      const nextDepart = zoomClickMs(next) - CAMERA_TRAVEL_MS
      if (nextDepart < zoom.endMs + CAMERA_TRAVEL_MS) to = Math.max(hold, nextDepart)
    }
    to = Math.max(to, from)
    phases.push({ from, to, zoom, clickMs })
    previousEnd = to
  })
  return phases
}

/** Center that keeps the visible area inside the video at this scale. */
function clampCenter(
  center: { x: number; y: number },
  scale: number,
  video: VideoSize,
): { x: number; y: number } {
  const halfW = video.width / (2 * scale)
  const halfH = video.height / (2 * scale)
  return {
    x: Math.min(Math.max(center.x, halfW), video.width - halfW),
    y: Math.min(Math.max(center.y, halfH), video.height - halfH),
  }
}

/** Moves `center` the least so that `point` is within `reach` of it. */
function pullInside(center: number, point: number, reach: number): number {
  if (point > center + reach) return point - reach
  if (point < center - reach) return point + reach
  return center
}
