// Recorded time with pauses removed (F-02, E-01). One instance per recording, in the offscreen
// document; the background and the popup get snapshots (`RecordingClock` from @kamo/ui).

export interface ClockSnapshot {
  state: 'recording' | 'paused'
  /** Recorded time (pauses excluded) at the moment `at` was taken. */
  elapsedMs: number
  /** `Date.now()` when this snapshot was taken. */
  at: number
  fps: number
}

export class RecordingTimer {
  private elapsedBeforePause = 0
  private runningSince: number | null = null

  constructor(
    private readonly fps: number,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    this.elapsedBeforePause = 0
    this.runningSince = this.now()
  }

  pause(): void {
    if (this.runningSince === null) return
    this.elapsedBeforePause += this.now() - this.runningSince
    this.runningSince = null
  }

  resume(): void {
    if (this.runningSince === null) this.runningSince = this.now()
  }

  get paused(): boolean {
    return this.runningSince === null
  }

  elapsedMs(): number {
    const running = this.runningSince === null ? 0 : this.now() - this.runningSince
    return this.elapsedBeforePause + running
  }

  snapshot(): ClockSnapshot {
    return {
      state: this.paused ? 'paused' : 'recording',
      elapsedMs: this.elapsedMs(),
      at: this.now(),
      fps: this.fps,
    }
  }
}

/** Reference thumbnails every 5s of recorded time (data-model.md: `frames/0005.jpg`). */
export const FRAME_INTERVAL_MS = 5000

/** `frames/0005.jpg` for the thumbnail of second 5. Same naming as the desktop. */
export function frameFileName(elapsedMs: number): string {
  return `${String(Math.round(elapsedMs / 1000)).padStart(4, '0')}.jpg`
}

/** Elapsed time of the next thumbnail after the one taken at `takenAtMs`. */
export function nextFrameAt(takenAtMs: number): number {
  return (Math.floor(takenAtMs / FRAME_INTERVAL_MS) + 1) * FRAME_INTERVAL_MS
}
