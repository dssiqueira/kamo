// Smoothed cursor (F-07, D-005). The OS cursor is not in the video: the renderer draws ours
// from events.jsonl using the track built here. Pure data, no drawing.
//
// How the track is built
// - Raw path: sample-and-hold of the last event inside the recorded area (moves marked
//   `outside` are skipped). Never interpolated linearly.
// - Smoothing: one spring per axis (rule 10, `settings.stiffness`/`damping`), stepped with the
//   exact `springStep` from the first event. Targets are piecewise constant and change only
//   at exact breakpoints (the lookahead reaching each raw sample, clicks, leaving and
//   re-entering the area, idle flips); a fixed internal clock (`sampleRateHz`, default 120Hz,
//   absolute multiples of 1/rate ms) adds more breakpoints only to bound their spacing. The
//   spring state is stored at every breakpoint; `cursorAt` advances the stored state to the
//   asked time with the same closed form. The closed form does not depend on how time is
//   split, so every frame rate (preview, 30fps, 60fps export) reads the same values, and the
//   internal rate does not change them either (rule 11).
// - Lag: a spring chasing a moving target trails it by `damping / stiffness` seconds (153ms
//   at 170/26). The whole recording is known, so the spring chases the raw path *that far
//   ahead* instead; a steady glide then has no lag and only the jitter is filtered out. The
//   lookahead never crosses the next click or the moment the pointer leaves the area.
// - Exact clicks: the lookahead stops at each click, so in the last ~150ms before it the
//   spring is already heading to the click point. Whatever error is left at the click
//   instant (`e = click - spring(tClick)`) is faded in over the window before the click with
//   a smootherstep weight (0 to 1, flat at both ends): `position = spring + w(t) * e`. At
//   `tClick` the weight is exactly 1 and, at that breakpoint, the spring state is reset to
//   the click point keeping its velocity. So the cursor is exactly on the click at the click
//   time, and position and velocity stay continuous on both sides.
// - Opacity: a spring toward 1 or 0. It goes to 0 while the pointer is outside the area,
//   after more than 3s without activity (`autoHide`), and always with `hidden`.
// - Outside: while outside, the spring holds the last inside position; at re-entry it is
//   reset (no velocity) to the re-entry point, so it reappears there without gliding.
import type { MouseButton, MouseEventRecord } from '../events/events.ts'
import type { CursorSettings } from '../project/schema.ts'
import { springStep, type SpringConfig } from '../spring.ts'

/** Internal clock of the simulation. Higher is closer to a continuous target, not smoother. */
export const CURSOR_SAMPLE_RATE_HZ = 120
/** Pointer still for longer than this: the cursor fades out (`autoHide`). */
export const CURSOR_IDLE_MS = 3000
/** Lifetime of the click ripple. */
export const CLICK_RIPPLE_MS = 400
/** Longest window before a click where the leftover error is faded in. */
export const CLICK_BLEND_MS = 150
/** Below this opacity the cursor counts as not visible. */
export const CURSOR_VISIBLE_EPSILON = 1e-3

/**
 * Arrow shape as a closed polygon in cursor units (1 unit = 1 video pixel at size 1.0),
 * hotspot at (0, 0). Vector, so the renderer can draw it sharp at any zoom (F-07). The
 * renderer fills it dark with a white outline and multiplies by `track.size`.
 */
export const CURSOR_ARROW: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 17],
  [4.2, 13.4],
  [7.1, 20],
  [9.8, 18.8],
  [6.9, 12.3],
  [12.2, 12.3],
]

export interface CursorRipple {
  x: number
  y: number
  /** 0 at the click, 1 when the ripple ends */
  progress: number
  button: MouseButton
}

export interface CursorFrame {
  /** hotspot in video pixels */
  x: number
  y: number
  visible: boolean
  /** 0..1, already includes auto-hide and outside fades */
  opacity: number
  ripple: CursorRipple | null
}

export interface BuildCursorTrackInput {
  events: readonly MouseEventRecord[]
  settings: CursorSettings
  durationMs: number
  sampleRateHz?: number
}

interface Click {
  t: number
  x: number
  y: number
  button: MouseButton
}

export interface CursorTrack {
  readonly smooth: boolean
  readonly hidden: boolean
  readonly clickRipple: boolean
  /** cursor scale, 1.0 to 3.0 */
  readonly size: number
  readonly spring: SpringConfig
  /** time of the first event; before it the cursor is not visible */
  readonly startMs: number
  // Raw path (inside events only, one entry per timestamp).
  readonly rawT: Float64Array
  readonly rawX: Float64Array
  readonly rawY: Float64Array
  // Breakpoints: state after any reset, and the targets held until the next breakpoint.
  readonly bpT: Float64Array
  readonly bpX: Float64Array
  readonly bpVX: Float64Array
  readonly bpY: Float64Array
  readonly bpVY: Float64Array
  readonly bpTX: Float64Array
  readonly bpTY: Float64Array
  readonly bpO: Float64Array
  readonly bpVO: Float64Array
  readonly bpTO: Float64Array
  // Pre-click blends (one per distinct click time).
  readonly blendClickT: Float64Array
  readonly blendStartT: Float64Array
  readonly blendEX: Float64Array
  readonly blendEY: Float64Array
  readonly clicks: readonly Click[]
}

/** Builds the cursor track once per project/settings change; read it with `cursorAt`. */
export function buildCursorTrack({
  events,
  settings,
  durationMs,
  sampleRateHz = CURSOR_SAMPLE_RATE_HZ,
}: BuildCursorTrackInput): CursorTrack {
  const spring: SpringConfig = { stiffness: settings.stiffness, damping: settings.damping }
  const sorted = isSorted(events) ? events : [...events].sort((a, b) => a.t - b.t)

  // ---- Raw path, clicks, outside stretches and activity --------------------------------
  const rawT: number[] = []
  const rawX: number[] = []
  const rawY: number[] = []
  const rawIsDown: boolean[] = []
  const clicks: Click[] = []
  const outsideStarts: number[] = []
  const reentries: { t: number; x: number; y: number }[] = []
  const activity: number[] = []
  let outside = false
  let lastX = Number.NaN
  let lastY = Number.NaN

  for (const event of sorted) {
    if (event.type === 'move' && event.outside) {
      if (!outside) {
        outside = true
        outsideStarts.push(event.t)
      }
      continue
    }
    if (outside) {
      outside = false
      reentries.push({ t: event.t, x: event.x, y: event.y })
    }
    const isDown = event.type === 'down'
    const n = rawT.length
    if (n > 0 && rawT[n - 1] === event.t) {
      // Same timestamp: keep the last event, but never let it hide a click.
      if (!rawIsDown[n - 1] || isDown) {
        rawX[n - 1] = event.x
        rawY[n - 1] = event.y
        rawIsDown[n - 1] = isDown
      }
    } else {
      rawT.push(event.t)
      rawX.push(event.x)
      rawY.push(event.y)
      rawIsDown.push(isDown)
    }
    if (isDown) clicks.push({ t: event.t, x: event.x, y: event.y, button: event.button })
    if (event.type !== 'move' || event.x !== lastX || event.y !== lastY) activity.push(event.t)
    lastX = event.x
    lastY = event.y
  }

  const raw = {
    t: Float64Array.from(rawT),
    x: Float64Array.from(rawX),
    y: Float64Array.from(rawY),
  }
  const first = sorted[0]
  const startMs = first ? first.t : 0
  const endMs = Math.max(durationMs, sorted.at(-1)?.t ?? 0)

  // Distinct click times; the last click at a given time wins.
  const clickTimes: number[] = []
  const clickPos: { x: number; y: number }[] = []
  for (const click of clicks) {
    if (clickTimes.at(-1) === click.t) clickPos[clickPos.length - 1] = click
    else {
      clickTimes.push(click.t)
      clickPos.push(click)
    }
  }

  // Exact times where the opacity target flips because of idling.
  const idleTimes: number[] = []
  if (settings.autoHide) {
    activity.forEach((t, i) => {
      const next = activity[i + 1] ?? Number.POSITIVE_INFINITY
      if (next - t > CURSOR_IDLE_MS) idleTimes.push(t + CURSOR_IDLE_MS)
    })
  }

  // Breakpoints wherever a target changes, so the targets are exact and the track does not
  // depend on the internal clock: the lookahead reaching each raw sample, clicks, outside
  // stretches and idle flips. The grid only bounds the spacing between stored states.
  const lookaheadMs = (spring.damping / spring.stiffness) * 1000
  const special = [
    ...rawT.map((t) => t - lookaheadMs),
    ...clickTimes,
    ...outsideStarts,
    ...reentries.map((r) => r.t),
    ...idleTimes,
    ...activity.filter((t, i) => i > 0 && t - (activity[i - 1] ?? t) > CURSOR_IDLE_MS),
  ]
    .filter((t) => t > startMs)
    .sort((a, b) => a - b)

  // ---- Targets ----------------------------------------------------------------------------
  let clickIdx = 0 // first click time > t
  let outIdx = 0 // first outside start > t
  let reIdx = 0 // first re-entry > t
  let actIdx = 0 // first activity > t

  // Outside now: the last outside stretch that started has not been followed by a re-entry.
  const isOutside = () =>
    outIdx > 0 &&
    (outsideStarts[outIdx - 1] ?? 0) > (reentries[reIdx - 1]?.t ?? Number.NEGATIVE_INFINITY)

  /** Index into the raw path that the position spring chases at `t`. */
  const positionTarget = (t: number): number => {
    if (isOutside()) {
      // Hold the last inside position; never glide toward where the pointer comes back.
      return Math.max(0, upperBound(raw.t, outsideStarts[outIdx - 1] ?? t) - 1)
    }
    // The epsilon absorbs rounding in `(sample - lookahead) + lookahead` at the breakpoint.
    let look = t + lookaheadMs + 1e-6
    look = Math.min(look, clickTimes[clickIdx] ?? look, outsideStarts[outIdx] ?? look)
    return Math.max(0, upperBound(raw.t, look) - 1)
  }

  const opacityTarget = (t: number): number => {
    if (settings.hidden) return 0
    if (isOutside()) return 0
    if (settings.autoHide && t - (activity[actIdx - 1] ?? startMs) >= CURSOR_IDLE_MS) return 0
    return 1
  }

  const advanceIndices = (t: number) => {
    while (clickIdx < clickTimes.length && (clickTimes[clickIdx] ?? 0) <= t) clickIdx++
    while (outIdx < outsideStarts.length && (outsideStarts[outIdx] ?? 0) <= t) outIdx++
    while (reIdx < reentries.length && (reentries[reIdx]?.t ?? 0) <= t) reIdx++
    while (actIdx < activity.length && (activity[actIdx] ?? 0) <= t) actIdx++
  }

  // ---- Simulation -------------------------------------------------------------------------
  const bp = {
    t: [] as number[],
    x: [] as number[],
    vx: [] as number[],
    y: [] as number[],
    vy: [] as number[],
    tx: [] as number[],
    ty: [] as number[],
    o: [] as number[],
    vo: [] as number[],
    to: [] as number[],
  }
  const blend = {
    click: [] as number[],
    start: [] as number[],
    ex: [] as number[],
    ey: [] as number[],
  }

  if (first) {
    const startIdx = Math.max(0, upperBound(raw.t, startMs) - 1)
    let sx = { x: raw.x[startIdx] ?? first.x, v: 0 }
    let sy = { x: raw.y[startIdx] ?? first.y, v: 0 }
    advanceIndices(startMs)
    let so = { x: opacityTarget(startMs), v: 0 }
    let lastReset = startMs
    let t = startMs

    const push = () => {
      const target = positionTarget(t)
      bp.t.push(t)
      bp.x.push(sx.x)
      bp.vx.push(sx.v)
      bp.y.push(sy.x)
      bp.vy.push(sy.v)
      bp.tx.push(raw.x[target] ?? sx.x)
      bp.ty.push(raw.y[target] ?? sy.x)
      bp.o.push(so.x)
      bp.vo.push(so.v)
      bp.to.push(opacityTarget(t))
    }
    push()

    const stepMs = 1000 / sampleRateHz
    let gridIdx = Math.floor(startMs / stepMs) + 1
    let specialIdx = 0
    for (;;) {
      while (gridIdx * stepMs <= t) gridIdx++
      while (specialIdx < special.length && (special[specialIdx] ?? 0) <= t) specialIdx++
      const next = Math.min(gridIdx * stepMs, special[specialIdx] ?? Number.POSITIVE_INFINITY)
      if (next > endMs) break
      const i = bp.t.length - 1
      const dt = (next - t) / 1000
      sx = springStep(sx, bp.tx[i] ?? sx.x, dt, spring)
      sy = springStep(sy, bp.ty[i] ?? sy.x, dt, spring)
      so = springStep(so, bp.to[i] ?? so.x, dt, spring)
      t = next

      const reentry = reentries[reIdx]
      if (reentry && reentry.t === t) {
        sx = { x: reentry.x, v: 0 }
        sy = { x: reentry.y, v: 0 }
        lastReset = t
      }
      const clickT = clickTimes[clickIdx]
      const click = clickPos[clickIdx]
      if (click && clickT === t) {
        const start = Math.max(t - CLICK_BLEND_MS, lastReset)
        if (start < t) {
          blend.click.push(t)
          blend.start.push(start)
          blend.ex.push(click.x - sx.x)
          blend.ey.push(click.y - sy.x)
        }
        // Land exactly on the click and keep the velocity, so the motion stays continuous.
        sx = { x: click.x, v: sx.v }
        sy = { x: click.y, v: sy.v }
        lastReset = t
      }
      advanceIndices(t)
      push()
    }
  }

  return {
    smooth: settings.smooth,
    hidden: settings.hidden,
    clickRipple: settings.clickRipple,
    size: settings.size,
    spring,
    startMs,
    rawT: raw.t,
    rawX: raw.x,
    rawY: raw.y,
    bpT: Float64Array.from(bp.t),
    bpX: Float64Array.from(bp.x),
    bpVX: Float64Array.from(bp.vx),
    bpY: Float64Array.from(bp.y),
    bpVY: Float64Array.from(bp.vy),
    bpTX: Float64Array.from(bp.tx),
    bpTY: Float64Array.from(bp.ty),
    bpO: Float64Array.from(bp.o),
    bpVO: Float64Array.from(bp.vo),
    bpTO: Float64Array.from(bp.to),
    blendClickT: Float64Array.from(blend.click),
    blendStartT: Float64Array.from(blend.start),
    blendEX: Float64Array.from(blend.ex),
    blendEY: Float64Array.from(blend.ey),
    clicks,
  }
}

/** Cursor at `tMs` (ms since the start of the recording). O(log n), pure. */
export function cursorAt(track: CursorTrack, tMs: number): CursorFrame {
  const i = upperBound(track.bpT, tMs) - 1
  if (i < 0) {
    return {
      x: track.rawX[0] ?? 0,
      y: track.rawY[0] ?? 0,
      visible: false,
      opacity: 0,
      ripple: null,
    }
  }
  const dt = (tMs - (track.bpT[i] ?? tMs)) / 1000

  let x: number
  let y: number
  if (track.smooth) {
    x = springStep(
      { x: at(track.bpX, i), v: at(track.bpVX, i) },
      at(track.bpTX, i),
      dt,
      track.spring,
    ).x
    y = springStep(
      { x: at(track.bpY, i), v: at(track.bpVY, i) },
      at(track.bpTY, i),
      dt,
      track.spring,
    ).x
    const j = upperBound(track.blendClickT, tMs)
    const start = track.blendStartT[j]
    const clickT = track.blendClickT[j]
    if (start !== undefined && clickT !== undefined && tMs > start) {
      const w = smootherstep((tMs - start) / (clickT - start))
      x += w * at(track.blendEX, j)
      y += w * at(track.blendEY, j)
    }
  } else {
    const r = Math.max(0, upperBound(track.rawT, tMs) - 1)
    x = at(track.rawX, r)
    y = at(track.rawY, r)
  }

  let opacity = springStep(
    { x: at(track.bpO, i), v: at(track.bpVO, i) },
    at(track.bpTO, i),
    dt,
    track.spring,
  ).x
  opacity = Math.min(1, Math.max(0, opacity))
  if (track.hidden || opacity < CURSOR_VISIBLE_EPSILON) opacity = 0

  return { x, y, visible: opacity > 0, opacity, ripple: rippleAt(track, tMs) }
}

function rippleAt(track: CursorTrack, tMs: number): CursorRipple | null {
  if (!track.clickRipple || track.hidden) return null
  let lo = 0
  let hi = track.clicks.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((track.clicks[mid]?.t ?? 0) <= tMs) lo = mid + 1
    else hi = mid
  }
  const click = track.clicks[lo - 1]
  if (!click) return null
  const age = tMs - click.t
  if (age >= CLICK_RIPPLE_MS) return null
  return { x: click.x, y: click.y, progress: age / CLICK_RIPPLE_MS, button: click.button }
}

/** 6p^5 - 15p^4 + 10p^3: 0 to 1 with zero slope and curvature at both ends. */
function smootherstep(p: number): number {
  const c = Math.min(1, Math.max(0, p))
  return c * c * c * (c * (c * 6 - 15) + 10)
}

/** First index whose value is > `value`. */
function upperBound(array: Float64Array, value: number): number {
  let lo = 0
  let hi = array.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((array[mid] ?? 0) <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

function at(array: Float64Array, i: number): number {
  return array[i] ?? 0
}

function isSorted(events: readonly MouseEventRecord[]): boolean {
  for (let i = 1; i < events.length; i++) {
    if ((events[i]?.t ?? 0) < (events[i - 1]?.t ?? 0)) return false
  }
  return true
}
