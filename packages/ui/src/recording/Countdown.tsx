import { useEffect, useState } from 'react'
import { useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { useSpring } from '../motion/useSpring.ts'

export interface CountdownProps {
  /** 3, 2, 1 */
  value: number
}

const BLINK_MS = 160

/**
 * Full-screen 3-2-1 over the display being recorded (flows.md §3). Each number enters
 * 1.2 → 1.0, and Kamo, peeking over the circle, blinks on each one (DESIGN.md → Mascot).
 */
export function Countdown({ value }: CountdownProps) {
  const t = useT()
  const scale = useSpring(1, 1.2, value)
  const blinking = useBlink(value)
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-md">
      <div className="relative">
        <Mascot
          pose={blinking ? 'head-blink' : 'head-look'}
          size={96}
          className="absolute -top-[62px] start-[118px]"
        />
        <div className="relative flex size-[220px] items-center justify-center rounded-full bg-surface/90 shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
          <span
            aria-live="assertive"
            className="font-serif text-[140px] leading-none text-on-surface"
            style={{ transform: `scale(${scale})` }}
          >
            {value}
          </span>
        </div>
      </div>
      <p className="rounded-full bg-surface/90 px-md py-xs text-label text-on-surface-muted">
        {t('countdown.cancelHint')}
      </p>
    </div>
  )
}

/** True for a moment after `value` changes; never with prefers-reduced-motion. */
function useBlink(value: number): boolean {
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setBlinking(true)
    const timer = setTimeout(() => setBlinking(false), BLINK_MS)
    return () => clearTimeout(timer)
  }, [value])
  return blinking
}
