import { formatTimecode } from '@kamo/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { PauseIcon, PlayIcon, StopIcon } from '../primitives/icons.tsx'

export interface RecordingClock {
  state: 'recording' | 'paused'
  /** Recorded time (pauses excluded) at the moment `at` was taken. */
  elapsedMs: number
  /** `Date.now()` when this snapshot was taken. */
  at: number
  fps: number
}

export interface RecordingBarProps {
  clock: RecordingClock
  onPause(): void
  onResume(): void
  onStop(): void
}

/**
 * Floating bar while recording (flows.md §4): pulsing REC, hh:mm:ss:ff timecode, pause, stop.
 * The window that hosts it is excluded from capture, so it never shows in the video.
 */
export function RecordingBar({ clock, onPause, onResume, onStop }: RecordingBarProps) {
  const t = useT()
  const elapsed = useElapsed(clock)
  const paused = clock.state === 'paused'
  const timecode = formatTimecode(elapsed, clock.fps)
  // The frames move too fast to read: dimmed, so the eye lands on hh:mm:ss.
  const split = timecode.lastIndexOf(':')

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div
        role="toolbar"
        aria-label={t(paused ? 'recording.paused' : 'recording.rec')}
        className="flex items-center gap-sm rounded-full border border-border bg-surface-raised py-[6px] ps-[10px] pe-[6px] text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.12)] [-webkit-app-region:drag]"
      >
        <Grip />
        <span className="flex items-center gap-[10px] pe-xs">
          <RecDot paused={paused} />
          <span
            aria-live="polite"
            className={`text-label uppercase tracking-[0.08em] ${paused ? 'text-on-surface-muted' : ''}`}
          >
            {t(paused ? 'recording.paused' : 'recording.rec')}
          </span>
        </span>
        <span className="font-mono text-timecode tabular-nums" aria-hidden>
          {timecode.slice(0, split)}
          <span className="text-on-surface-muted">{timecode.slice(split)}</span>
        </span>
        <span aria-hidden className="mx-[2px] h-[20px] w-px bg-border" />
        <BarButton
          label={t(paused ? 'recording.resume' : 'recording.pause')}
          onClick={paused ? onResume : onPause}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </BarButton>
        <BarButton label={t('recording.stop')} onClick={onStop} strong>
          <StopIcon />
        </BarButton>
      </div>
    </div>
  )
}

/** Six dots: the bar can be dragged anywhere on the screen. */
function Grip() {
  return (
    <svg aria-hidden viewBox="0 0 6 12" width="6" height="12" className="text-on-surface-muted">
      {[2, 6, 10].flatMap((y) => [
        <circle key={`l${y}`} cx="1" cy={y} r="1" fill="currentColor" />,
        <circle key={`r${y}`} cx="5" cy={y} r="1" fill="currentColor" />,
      ])}
    </svg>
  )
}

function RecDot({ paused }: { paused: boolean }) {
  if (paused) {
    return <span aria-hidden className="size-[10px] rounded-full bg-on-surface-muted" />
  }
  return (
    <span aria-hidden className="relative flex size-[10px]">
      <span className="kamo-motion absolute inset-0 animate-[kamo-rec-halo_1.4s_ease-out_infinite] rounded-full bg-recording" />
      <span className="kamo-motion relative size-[10px] animate-[kamo-rec-pulse_1.2s_ease-in-out_infinite_alternate] rounded-full bg-recording" />
    </span>
  )
}

function BarButton({
  label,
  onClick,
  strong = false,
  children,
}: {
  label: string
  onClick(): void
  /** Stop: the one way out, so it gets the strongest contrast (coral stays REC-only). */
  strong?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-[36px] items-center justify-center rounded-full transition-colors duration-[120ms] [-webkit-app-region:no-drag] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary ${
        strong
          ? 'bg-on-surface text-surface-raised hover:opacity-85'
          : 'bg-surface text-on-surface hover:bg-border'
      }`}
    >
      {children}
    </button>
  )
}

function useElapsed(clock: RecordingClock): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (clock.state !== 'recording') return
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now())
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [clock])
  return clock.state === 'recording'
    ? clock.elapsedMs + Math.max(0, now - clock.at)
    : clock.elapsedMs
}
