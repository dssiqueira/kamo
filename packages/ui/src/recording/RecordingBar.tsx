import { formatTimecode } from '@kamo/i18n'
import { useEffect, useState } from 'react'
import { useT } from '../i18n.tsx'

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

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex items-center gap-sm rounded-full bg-surface-raised px-md py-sm text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.12)] [-webkit-app-region:drag]">
        <span
          aria-hidden
          className={`size-[10px] rounded-full bg-recording ${paused ? '' : 'animate-[kamo-rec-pulse_1.2s_ease-in-out_infinite_alternate]'}`}
        />
        <span className="text-label">{t(paused ? 'recording.paused' : 'recording.rec')}</span>
        <span className="font-mono text-timecode tabular-nums">
          {formatTimecode(elapsed, clock.fps)}
        </span>
        <BarButton onClick={paused ? onResume : onPause}>
          {t(paused ? 'recording.resume' : 'recording.pause')}
        </BarButton>
        <BarButton onClick={onStop}>{t('recording.stop')}</BarButton>
      </div>
    </div>
  )
}

function BarButton({ onClick, children }: { onClick(): void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-surface px-[12px] py-xs text-label transition-colors duration-[120ms] [-webkit-app-region:no-drag] hover:bg-border focus-visible:outline-2 focus-visible:outline-tertiary"
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
