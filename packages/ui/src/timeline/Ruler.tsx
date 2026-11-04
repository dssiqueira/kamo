import { formatTimecode } from '@kamo/i18n'
import type { KeyboardEvent } from 'react'
import { useT } from '../i18n.tsx'
import { nudgeMs, rulerTicks, snapToFrame, tickStep, type TimeScale } from './scale.ts'
import { useDrag } from './useDrag.ts'

export interface RulerProps {
  scale: TimeScale
  fps: number
  playheadMs: number
  onScrub(tMs: number): void
}

/**
 * Ruler with hh:mm:ss:ff marks. Pressing and dragging on it moves the playhead (F-09 scrub);
 * it is a slider for keyboard and screen readers.
 */
export function Ruler({ scale, fps, playheadMs, onScrub }: RulerProps) {
  const t = useT()
  const step = tickStep(scale)
  const ticks = rulerTicks(scale, step)
  const durationMs = scale.durationMs

  const scrubTo = (clientX: number, element: HTMLElement) => {
    const ms = scale.toMs(clientX - element.getBoundingClientRect().left)
    onScrub(Math.min(snapToFrame(ms, fps), durationMs))
  }

  const drag = useDrag({
    thresholdPx: 0,
    onMove: (_dx, event) => scrubTo(event.clientX, event.currentTarget),
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    const nudge = nudgeMs(event.key, event.shiftKey, fps)
    if (nudge !== null) next = playheadMs + nudge
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = durationMs
    if (next === null) return
    event.preventDefault()
    onScrub(Math.min(Math.max(snapToFrame(next, fps), 0), durationMs))
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={t('timeline.playhead')}
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs)}
      aria-valuenow={Math.round(playheadMs)}
      aria-valuetext={formatTimecode(playheadMs, fps)}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      {...drag}
      className="relative h-[24px] cursor-pointer touch-none overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary"
    >
      {ticks.map((tick) => (
        <span
          key={tick.ms}
          aria-hidden
          className={`absolute bottom-0 w-px bg-border ${tick.major ? 'h-[10px]' : 'h-[5px]'}`}
          style={{ insetInlineStart: scale.toPx(tick.ms) }}
        />
      ))}
      {ticks
        .filter((tick) => tick.major)
        .map((tick) => (
          <span
            key={`label-${tick.ms}`}
            aria-hidden
            className="absolute top-0 ps-xs font-mono text-label whitespace-nowrap text-on-surface-muted tabular-nums"
            style={{ insetInlineStart: scale.toPx(tick.ms) }}
          >
            {formatTimecode(tick.ms, fps)}
          </span>
        ))}
    </div>
  )
}
