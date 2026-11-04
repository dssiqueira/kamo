// Export frame timing (F-11). Output frame i shows the raw video at
// trim.startMs + i × 1000 / fps, and is stamped i / fps in the file, so the exported video
// starts at 0 and lasts the trimmed duration.

export interface TrimRange {
  startMs: number
  endMs: number
}

/**
 * Number of output frames: every frame whose start falls inside the trim. The file lasts
 * count / fps, which is the trimmed duration rounded up to the next frame (< 1 frame more).
 */
export function exportFrameCount(trim: TrimRange, fps: number): number {
  const durationMs = Math.max(0, trim.endMs - trim.startMs)
  // The epsilon keeps an exact multiple (e.g. 1000ms at 30fps = 30 frames) from becoming 31.
  return Math.max(1, Math.ceil((durationMs * fps) / 1000 - 1e-6))
}

/** Raw video time (ms) shown by output frame `index`; what the camera and cursor read. */
export function exportFrameTimeMs(trim: TrimRange, index: number, fps: number): number {
  return trim.startMs + (index * 1000) / fps
}

/** Presentation timestamp (s) of output frame `index` in the exported file. */
export function exportFrameTimestamp(index: number, fps: number): number {
  return index / fps
}

/**
 * Tolerance when matching an output time to a decoded frame: container timestamps are
 * rounded to the track timescale, so a frame meant for exactly t can be stamped a hair
 * after it. Far below one frame at any supported rate.
 */
export const FRAME_MATCH_EPSILON_S = 0.0005

export interface TimedFrame {
  /** seconds */
  readonly timestamp: number
  close(): void
}

/**
 * For each requested time (seconds, ascending), yields the decoded frame on screen at that
 * time: the last frame whose timestamp is ≤ time (like a <video> element seeked there).
 * Reads `frames` (ascending timestamps) lazily and closes every frame it will not yield
 * again. Before the first frame it yields the first one; after the last, the last one.
 * The yielded frame stays open until the next step; the caller must not close it, and
 * `release()` closes whatever is still held.
 */
export function createFramePicker<F extends TimedFrame>(frames: AsyncIterator<F>) {
  let current: F | null = null
  let next: F | null = null
  let done = false

  async function pull(): Promise<F | null> {
    if (done) return null
    const result = await frames.next()
    if (result.done) {
      done = true
      return null
    }
    return result.value
  }

  return {
    async at(timeS: number): Promise<F | null> {
      if (!current) {
        current = await pull()
        if (!current) return null
      }
      next ??= await pull()
      while (next && next.timestamp <= timeS + FRAME_MATCH_EPSILON_S) {
        current.close()
        current = next
        next = await pull()
      }
      return current
    },
    release(): void {
      current?.close()
      next?.close()
      current = null
      next = null
      done = true
      void frames.return?.()
    },
  }
}
