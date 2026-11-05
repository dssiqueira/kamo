// Kamo looking around (E-01): it rests looking straight ahead, and every so often its eye
// glances back at you or up, or it blinks, then looks ahead again. Shared by the popup's mascot
// and the extension's toolbar icon. Pure: callers pass the randomness and run the timers, so it
// is unit tested and the toolbar can stay cheap.

/** The head poses the eye moves through (design-tokens mascot art). */
export type GazePose = 'head-look' | 'head-look-side' | 'head-look-up' | 'head-blink'

/**
 * Where the eye rests between moves: looking straight ahead, the way the head points
 * (`head-look-side`). Also the pose for anyone who asked for reduced motion.
 */
export const REST_POSE: GazePose = 'head-look-side'

export type GazeMove = 'blink' | 'double-blink' | 'glance-back' | 'glance-up'

/** One frame of a move: show `pose` from `atMs` after the move began. */
export interface GazeStep {
  pose: GazePose
  atMs: number
}

/** A blink reads at ~150–250ms; a glance is a short excursion, long enough to be noticed. */
const MOVES: Record<GazeMove, readonly { pose: GazePose; ms: number }[]> = {
  blink: [{ pose: 'head-blink', ms: 180 }],
  'double-blink': [
    { pose: 'head-blink', ms: 150 },
    { pose: REST_POSE, ms: 140 },
    { pose: 'head-blink', ms: 150 },
  ],
  'glance-back': [{ pose: 'head-look', ms: 900 }],
  'glance-up': [{ pose: 'head-look-up', ms: 800 }],
}

/** Cumulative weights: mostly blinks, now and then a glance. */
const WEIGHTS: readonly [GazeMove, number][] = [
  ['blink', 0.45],
  ['glance-back', 0.25],
  ['glance-up', 0.15],
  ['double-blink', 0.15],
]

/**
 * The next move for `random` in [0, 1). A glance never repeats right away (it would look
 * stuck): it becomes a blink instead.
 */
export function pickGazeMove(random: number, previous: GazeMove | null = null): GazeMove {
  let edge = 0
  let move: GazeMove = 'blink'
  for (const [candidate, weight] of WEIGHTS) {
    edge += weight
    if (random < edge) {
      move = candidate
      break
    }
  }
  const glance = move === 'glance-back' || move === 'glance-up'
  return glance && move === previous ? 'blink' : move
}

/** The frames of a move, ending back at the rest pose. */
export function gazeTimeline(move: GazeMove): GazeStep[] {
  const steps: GazeStep[] = []
  let at = 0
  for (const { pose, ms } of MOVES[move]) {
    steps.push({ pose, atMs: at })
    at += ms
  }
  steps.push({ pose: REST_POSE, atMs: at })
  return steps
}

/** How long the popup's mascot looks ahead before its next move: 6 to 12 seconds. */
export function gazeDelayMs(random: number): number {
  return Math.round(6000 + Math.min(1, Math.max(0, random)) * 6000)
}

/** Height of the head art, in its own pixels (design-tokens `kamo-head-*.webp`). */
export const HEAD_ART_HEIGHT = 180

/**
 * Where each pose's drawing sits against `head-look` (the frame every pose is placed in), in
 * art pixels: the head at (x, y) in `head-look` is at (x + dx, y + dy) in the pose. The art was
 * cut one pose at a time, so without this the head would jump a few pixels whenever the eye
 * moves.
 */
export const GAZE_OFFSETS: Record<GazePose, { dx: number; dy: number }> = {
  'head-look': { dx: 0, dy: 0 },
  'head-look-side': { dx: -5, dy: -2 },
  'head-look-up': { dx: 1, dy: -2 },
  'head-blink': { dx: -12, dy: 2 },
}
