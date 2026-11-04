import { useT } from '../i18n.tsx'
import { useSpring } from '../motion/useSpring.ts'

export interface CountdownProps {
  /** 3, 2, 1 */
  value: number
}

/** Full-screen 3-2-1 over the display being recorded (flows.md §3). Each number enters 1.2 → 1.0. */
export function Countdown({ value }: CountdownProps) {
  const t = useT()
  const scale = useSpring(1, 1.2, value)
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-md">
      <div className="flex size-[220px] items-center justify-center rounded-full bg-surface/90 shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
        <span
          aria-live="assertive"
          className="font-serif text-[140px] leading-none text-on-surface"
          style={{ transform: `scale(${scale})` }}
        >
          {value}
        </span>
      </div>
      <p className="rounded-full bg-surface/90 px-md py-xs text-label text-on-surface-muted">
        {t('countdown.cancelHint')}
      </p>
    </div>
  )
}
