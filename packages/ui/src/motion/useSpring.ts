import { SPRING } from '@kamo/core'
import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number with the Kamo spring (rule 10: stiffness 170, damping 26, never linear).
 * `from` is where the value starts every time `key` changes. Honors prefers-reduced-motion.
 */
export function useSpring(target: number, from: number, key: unknown): number {
  const [value, setValue] = useState(from)
  const state = useRef({ x: from, v: 0 })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    state.current = { x: from, v: 0 }
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      // Semi-implicit Euler with a capped step keeps the spring stable on slow frames.
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      const s = state.current
      const force = -SPRING.stiffness * (s.x - target) - SPRING.damping * s.v
      s.v += force * dt
      s.x += s.v * dt
      setValue(s.x)
      if (Math.abs(s.x - target) > 0.0005 || Math.abs(s.v) > 0.0005) {
        frame = requestAnimationFrame(step)
      } else {
        setValue(target)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, from, key])

  return value
}
