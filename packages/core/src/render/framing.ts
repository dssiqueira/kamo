// Crop framing (A-02): where a crop format (1:1, 9:16, the split layout's screen card) looks
// inside the virtual camera's viewport. The camera zooms and pans the full recording; a
// crop narrower than the viewport still has room to move, and it uses that room to follow
// the cursor, so the action never leaves the frame. Pure math, shared by the editor preview
// and the export (rule 11).
//
// Decisions:
// - Dead zone: the cursor moves freely inside the central FRAMING_DEAD_ZONE of the crop;
//   past it the target moves just enough to bring the cursor back to the zone's edge (the
//   same idea as the camera's follow), so a wiggling pointer does not shake the frame.
// - The target chases the cursor FRAMING_LOOKAHEAD_MS ahead (the whole recording is known),
//   which cancels the spring's lag, like the smoothed cursor does.
// - The crop's center moves toward the target with the 170/26 spring (rule 10), simulated
//   once on a fixed clock with the exact closed form, so the framing is a pure function of
//   time and every frame rate reads the same one (rule 11).
// - The target is held inside the range the crop can reach in the viewport, so the spring
//   never winds up past an edge and comes back late.
// - Safety net: cropFor also keeps the cursor CROP_KEEP_MARGIN inside the crop on every frame,
//   so even a flick faster than the spring stays in the frame.
// - A crop with the viewport's own aspect (16:9 from a 16:9 recording) has no room to move:
//   no track is built.
import type { CameraTrack } from '../camera/camera.ts'
import { viewportAt } from '../camera/camera.ts'
import { cursorAt, type CursorTrack } from '../cursor/cursor.ts'
import { SPRING, springStep, type SpringState } from '../spring.ts'
import type { Box, Point } from './types.ts'

/** Internal clock of the simulation; the framing is read with linear interpolation. */
export const FRAMING_SAMPLE_RATE_HZ = 120

/** Central fraction of the crop (each axis) where the cursor moves without moving the crop. */
export const FRAMING_DEAD_ZONE = 0.5

/** The framing chases the cursor this far ahead: the spring's lag (damping / stiffness). */
export const FRAMING_LOOKAHEAD_MS = (SPRING.damping / SPRING.stiffness) * 1000

/** Crops whose aspect differs from the viewport's by less than this have no room to move. */
const SAME_ASPECT = 1e-6

/** How many crop aspects a camera keeps framings for (the split layout uses two). */
const CACHE_PER_CAMERA = 8

export interface FramingTrack {
  readonly sampleRateHz: number
  /** crop center, source pixels, one sample per 1/sampleRateHz s from t = 0 */
  readonly x: Float64Array
  readonly y: Float64Array
}

export interface FramingInput {
  camera: CameraTrack
  cursor: CursorTrack
  /** crop aspect, width / height */
  aspect: number
  durationMs: number
  sampleRateHz?: number
}

/** Size of the largest crop of `aspect` inside `viewport` (same rule as cropFor). */
export function cropSizeIn(viewport: Box, aspect: number): { width: number; height: number } {
  if (viewport.width / viewport.height > aspect) {
    return { width: viewport.height * aspect, height: viewport.height }
  }
  return { width: viewport.width, height: viewport.width / aspect }
}

/**
 * Precomputes where the crop looks for the whole recording, or null when there is nothing
 * to follow (no mouse events) or no room to move (the crop has the viewport's aspect).
 */
export function buildFramingTrack(input: FramingInput): FramingTrack | null {
  const { camera, cursor, aspect } = input
  const videoAspect = camera.video.width / camera.video.height
  if (!(aspect > 0) || Math.abs(videoAspect - aspect) <= SAME_ASPECT * aspect) return null
  if (cursor.rawT.length === 0) return null
  const sampleRateHz = input.sampleRateHz ?? FRAMING_SAMPLE_RATE_HZ
  const stepS = 1 / sampleRateHz
  const durationMs = Math.max(0, input.durationMs)
  const count = Math.floor((durationMs * sampleRateHz) / 1000) + 2
  const xs = new Float64Array(count)
  const ys = new Float64Array(count)

  let target: Point | null = null
  let sx: SpringState = { x: 0, v: 0 }
  let sy: SpringState = { x: 0, v: 0 }
  for (let i = 0; i < count; i++) {
    const tMs = (i * 1000) / sampleRateHz
    const view = viewportAt(camera, tMs)
    const size = cropSizeIn(view, aspect)
    const pointer = cursorAt(cursor, tMs + FRAMING_LOOKAHEAD_MS)
    const halfX = (size.width / 2) * FRAMING_DEAD_ZONE
    const halfY = (size.height / 2) * FRAMING_DEAD_ZONE
    if (!target) {
      target = { x: pointer.x, y: pointer.y }
    } else {
      target = {
        x: clamp(target.x, pointer.x - halfX, pointer.x + halfX),
        y: clamp(target.y, pointer.y - halfY, pointer.y + halfY),
      }
    }
    target = {
      x: clamp(target.x, view.x + size.width / 2, view.x + view.width - size.width / 2),
      y: clamp(target.y, view.y + size.height / 2, view.y + view.height - size.height / 2),
    }
    if (i === 0) {
      sx = { x: target.x, v: 0 }
      sy = { x: target.y, v: 0 }
    } else {
      sx = springStep(sx, target.x, stepS)
      sy = springStep(sy, target.y, stepS)
    }
    xs[i] = sx.x
    ys[i] = sy.x
  }
  return { sampleRateHz, x: xs, y: ys }
}

/** The crop's preferred center at `tMs` (linear between samples), null without a track. */
export function framingAt(track: FramingTrack | null, tMs: number): Point | null {
  if (!track) return null
  const last = track.x.length - 1
  const position = Math.min(Math.max(0, (tMs * track.sampleRateHz) / 1000), last)
  const i = Math.min(Math.floor(position), Math.max(0, last - 1))
  const j = Math.min(i + 1, last)
  const f = position - i
  const lerp = (a: Float64Array) => {
    const from = a[i] ?? 0
    return from + ((a[j] ?? from) - from) * f
  }
  return { x: lerp(track.x), y: lerp(track.y) }
}

const cache = new WeakMap<
  CameraTrack,
  Map<string, { cursor: CursorTrack; track: FramingTrack | null }>
>()

/**
 * The framing for a crop of `aspect` with this camera and cursor, built on first use and
 * kept while the camera track lives (a few per camera: the formats the preview and the
 * export sheet ask for). Same inputs → same track, so preview and export agree.
 */
export function framingFor(
  camera: CameraTrack,
  cursor: CursorTrack,
  aspect: number,
): FramingTrack | null {
  let byAspect = cache.get(camera)
  if (!byAspect) {
    byAspect = new Map()
    cache.set(camera, byAspect)
  }
  const key = aspect.toFixed(4)
  const hit = byAspect.get(key)
  if (hit && hit.cursor === cursor) {
    // Most recently used goes last, so the oldest is evicted first.
    byAspect.delete(key)
    byAspect.set(key, hit)
    return hit.track
  }
  // Built from the rounded aspect, so whoever asks first gets exactly the same track.
  const track = buildFramingTrack({
    camera,
    cursor,
    aspect: Number(key),
    durationMs: camera.durationMs,
  })
  byAspect.delete(key)
  byAspect.set(key, { cursor, track })
  while (byAspect.size > CACHE_PER_CAMERA) {
    const oldest = byAspect.keys().next().value
    if (oldest === undefined) break
    byAspect.delete(oldest)
  }
  return track
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
