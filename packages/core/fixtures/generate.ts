// Deterministic sample recordings for the engine tests (zooms, camera, cursor).
// Regenerate with `pnpm --filter @kamo/core fixtures`; a test fails if they drift.
import { formatEvents, type MouseButton, type MouseEventRecord } from '../src/events/events.ts'

export const FIXTURE_VIDEO = { width: 1920, height: 1080, fps: 30 } as const

const MOVE_INTERVAL_MS = 1000 / 60

interface Point {
  x: number
  y: number
}

class Recording {
  readonly events: MouseEventRecord[] = []
  private random: () => number
  t = 0
  at: Point

  constructor(seed: number, start: Point) {
    this.random = mulberry32(seed)
    this.at = start
  }

  /** Moves with a little hand jitter, sampled at ~60Hz like the native hooks. */
  moveTo(to: Point, durationMs: number, outside = false): this {
    const from = this.at
    const steps = Math.max(1, Math.round(durationMs / MOVE_INTERVAL_MS))
    for (let i = 1; i <= steps; i++) {
      const p = easeInOut(i / steps)
      const jitter = i === steps ? 0 : 2
      this.t += durationMs / steps
      this.at = {
        x: round(from.x + (to.x - from.x) * p + (this.random() - 0.5) * jitter),
        y: round(from.y + (to.y - from.y) * p + (this.random() - 0.5) * jitter),
      }
      this.events.push({
        t: round(this.t),
        type: 'move',
        ...this.at,
        ...(outside ? { outside: true as const } : {}),
      })
    }
    return this
  }

  wait(ms: number): this {
    this.t += ms
    return this
  }

  click(button: MouseButton = 'left'): this {
    this.events.push({ t: round(this.t), type: 'down', button, ...this.at })
    this.t += 80
    this.events.push({ t: round(this.t), type: 'up', button, ...this.at })
    return this
  }

  scroll(dy: number): this {
    this.events.push({ t: round(this.t), type: 'scroll', dx: 0, dy, ...this.at })
    this.t += 50
    return this
  }

  drag(to: Point, durationMs: number): this {
    this.events.push({ t: round(this.t), type: 'down', button: 'left', ...this.at })
    this.moveTo(to, durationMs)
    this.events.push({ t: round(this.t), type: 'up', button: 'left', ...this.at })
    return this
  }
}

const CENTER = { x: 960, y: 540 }

export const FIXTURES: Record<string, () => Recording> = {
  /** Mouse wanders, never clicks: no zooms ("no clicks, nothing to zoom"). */
  'no-clicks': () =>
    new Recording(1, CENTER)
      .moveTo({ x: 300, y: 200 }, 1500)
      .wait(2000)
      .moveTo({ x: 1600, y: 900 }, 2000)
      .scroll(-240)
      .moveTo(CENTER, 1500),

  /** Clicks far apart in time and space: one zoom each; right click never zooms. */
  'spaced-clicks': () =>
    new Recording(2, CENTER)
      .moveTo({ x: 400, y: 300 }, 1200)
      .click()
      .wait(2500)
      .moveTo({ x: 1500, y: 800 }, 1200)
      .click()
      .wait(1500)
      .moveTo({ x: 1200, y: 300 }, 800)
      .click('right')
      .wait(2000)
      .moveTo({ x: 300, y: 900 }, 1200)
      .click()
      .wait(1500),

  /** Four quick clicks close together become one shot; a far click later is another. */
  'click-burst': () =>
    new Recording(3, CENTER)
      .wait(2000)
      .moveTo({ x: 900, y: 500 }, 600)
      .click()
      .moveTo({ x: 980, y: 520 }, 250)
      .click()
      .moveTo({ x: 1040, y: 600 }, 250)
      .click()
      .moveTo({ x: 950, y: 610 }, 250)
      .click()
      .wait(3000)
      .moveTo({ x: 1700, y: 200 }, 1000)
      .click()
      .wait(1500),

  /** Clicks on the edges: the zoom must shift so it never shows outside the video. */
  'edge-clicks': () =>
    new Recording(4, CENTER)
      .moveTo({ x: 5, y: 5 }, 1000)
      .click()
      .wait(2500)
      .moveTo({ x: 1915, y: 1075 }, 1500)
      .click()
      .wait(2500)
      .moveTo({ x: 1915, y: 540 }, 1000)
      .click()
      .wait(1500),

  /** Click and drag: one zoom that follows the drag. */
  drag: () =>
    new Recording(5, CENTER)
      .moveTo({ x: 500, y: 500 }, 1000)
      .wait(300)
      .drag({ x: 1200, y: 700 }, 1500)
      .wait(2000),

  /** Pointer leaves for another display, comes back and clicks. */
  'outside-display': () =>
    new Recording(6, CENTER)
      .moveTo({ x: 1919, y: 500 }, 800)
      .moveTo({ x: 1919, y: 400 }, 1500, true)
      .wait(1000)
      .moveTo({ x: 1400, y: 450 }, 800)
      .click()
      .wait(2000),
}

export function generateFixtures(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(FIXTURES).map(([name, build]) => [
      `${name}.jsonl`,
      formatEvents(build().events),
    ]),
  )
}

function easeInOut(p: number): number {
  // Only shapes the fake hand movement in the fixtures; app animation always uses springs.
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
