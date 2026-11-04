// Toolbar icon. Recording: a small coral dot (flows.md step 4), drawn here so the extension
// ships no extra image; muted grey while paused. Otherwise, Kamo's head, which now and then
// blinks or glances aside (`playGaze`, driven by the gaze alarm in the service worker).
import headBlink from '@kamo/design-tokens/mascot/kamo-head-blink.webp'
import headLookSide from '@kamo/design-tokens/mascot/kamo-head-look-side.webp'
import headLookUp from '@kamo/design-tokens/mascot/kamo-head-look-up.webp'
import headLook from '@kamo/design-tokens/mascot/kamo-head-look.webp'
import { REST_POSE, gazeTimeline, pickGazeMove, type GazeMove, type GazePose } from '@kamo/ui/gaze'
import { TOOLBAR_ICON, TOOLBAR_SIZES, cropFor, downsample } from './toolbar-frames.ts'

const SIZES = [16, 32] as const

/** The same webp files the popup's mascot uses: nothing extra in the package. */
const ART: Record<GazePose, string> = {
  'head-look': headLook,
  'head-look-side': headLookSide,
  'head-look-up': headLookUp,
  'head-blink': headBlink,
}

type Frame = Record<number, ImageData>

let current: string | null = null
/** Bumped to cancel a move in progress (recording started, icon changed). */
let generation = 0
const timers = new Set<ReturnType<typeof setTimeout>>()
/** Frames drawn since the worker woke up; gone when it sleeps, redrawn in a few ms. */
const frames = new Map<GazePose, Promise<Frame>>()
let lastMove: GazeMove | null = null

function dot(size: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  context.fillStyle = color
  context.beginPath()
  context.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2)
  context.fill()
  return context.getImageData(0, 0, size, size)
}

function stopGaze(): void {
  generation++
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
}

/** `pausedColor` replaces the coral while the recording is paused. */
export async function setRecordingIcon(color: string, pausedColor: string | null): Promise<void> {
  stopGaze()
  const fill = pausedColor ?? color
  if (current === fill) return
  current = fill
  const imageData = Object.fromEntries(SIZES.map((size) => [size, dot(size, fill)]))
  await chrome.action.setIcon({ imageData })
}

export async function setIdleIcon(): Promise<void> {
  if (current === 'idle') return
  stopGaze()
  current = 'idle'
  await chrome.action.setIcon({ path: TOOLBAR_ICON })
}

async function drawFrame(pose: GazePose): Promise<Frame> {
  const blob = await (await fetch(ART[pose])).blob()
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data } = context.getImageData(0, 0, width, height)
  const crop = cropFor(pose, height)
  return Object.fromEntries(
    TOOLBAR_SIZES.map((size) => [
      size,
      new ImageData(downsample(data, width, height, crop, size), size, size),
    ]),
  )
}

function frameOf(pose: GazePose): Promise<Frame> {
  let frame = frames.get(pose)
  if (!frame) {
    frame = drawFrame(pose)
    frames.set(pose, frame)
    // A failed draw is retried next time instead of being remembered.
    frame.catch(() => frames.delete(pose))
  }
  return frame
}

/**
 * One move of the eye (a blink, a glance aside or up), back to rest in under 2s. Only while
 * the icon is Kamo's head: a recording cancels it on the spot. Never throws.
 */
export async function playGaze(): Promise<void> {
  if (current !== 'idle') return
  stopGaze()
  const run = generation
  const move = pickGazeMove(Math.random(), lastMove)
  lastMove = move
  const steps = gazeTimeline(move)
  let drawn: Map<GazePose, Frame>
  try {
    const poses = [...new Set(steps.map((step) => step.pose))]
    drawn = new Map(await Promise.all(poses.map(async (p) => [p, await frameOf(p)] as const)))
  } catch {
    return
  }
  if (run !== generation || current !== 'idle') return
  for (const step of steps) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (run !== generation || current !== 'idle') return
      // The resting frame is the static icon itself, so the head never drifts between moves.
      const imageData = drawn.get(step.pose)
      const icon = step.pose === REST_POSE || !imageData ? { path: TOOLBAR_ICON } : { imageData }
      void chrome.action.setIcon(icon).catch(() => undefined)
    }, step.atMs)
    timers.add(timer)
  }
}
