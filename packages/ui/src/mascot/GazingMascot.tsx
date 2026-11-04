import { useEffect, useState } from 'react'
import {
  GAZE_OFFSETS,
  HEAD_ART_HEIGHT,
  REST_POSE,
  gazeDelayMs,
  gazeTimeline,
  pickGazeMove,
  type GazeMove,
  type GazePose,
} from './gaze.ts'
import { Mascot } from './Mascot.tsx'

/** Width of `head-look`, the frame every pose is placed in. */
const HEAD_ART_WIDTH = 160

/**
 * Kamo's head, looking around now and then (blinks, glances aside or up) while it is on
 * screen. Still for anyone who asked the system for reduced motion. Decorative, like Mascot.
 */
export function GazingMascot({ size }: { size: number }) {
  const pose = useGaze()
  const scale = size / HEAD_ART_HEIGHT
  const { dx, dy } = GAZE_OFFSETS[pose]
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden"
      style={{ width: Math.round(HEAD_ART_WIDTH * scale), height: size }}
    >
      {/* Shifted by the pose's offset, so the head stays still while the eye moves. */}
      <span className="absolute" style={{ left: -dx * scale, top: -dy * scale }}>
        <Mascot pose={pose} size={size} className="block max-w-none" />
      </span>
    </span>
  )
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useGaze(): GazePose {
  const [pose, setPose] = useState<GazePose>(REST_POSE)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        run()
      }, ms)
      timers.add(timer)
    }
    let previous: GazeMove | null = null
    const next = () => {
      later(gazeDelayMs(Math.random()), () => {
        const move = pickGazeMove(Math.random(), previous)
        previous = move
        const steps = gazeTimeline(move)
        for (const step of steps) later(step.atMs, () => setPose(step.pose))
        later(steps.at(-1)?.atMs ?? 0, next)
      })
    }
    next()
    return () => {
      for (const timer of timers) clearTimeout(timer)
      setPose(REST_POSE)
    }
  }, [])
  return pose
}
