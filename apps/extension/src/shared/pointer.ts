// From what the page saw to what the video shows (E-02, data-model.md MouseEvent): a sample in
// CSS pixels of the tab's viewport becomes video pixels. Pure, so it is unit tested.
//
// The tab capture shows the layout viewport (scrollbars included), scaled into the video
// frame. Normalizing by the viewport size covers devicePixelRatio and the browser zoom at once
// (CSS px × DPR × zoom / video scale is the same ratio), pinch zoom goes through the visual
// viewport, and a window resized mid-recording is letterboxed by Chrome into the fixed frame,
// so the page is fit (contain) and centered. Positions are screen positions: scrolling the page
// does not move them (clientX/clientY).
import type { MouseButton, MouseEventRecord } from '@kamo/core'
import type { RawPointerSample } from '../content/mouse-capture.ts'
import type { Size } from './capture.ts'

const KINDS = new Set(['move', 'down', 'up', 'scroll', 'leave'])
const BUTTONS: Record<number, MouseButton> = { 0: 'left', 1: 'middle', 2: 'right' }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** A sample from the port, checked field by field (the port only carries these). */
export function parsePointerSample(message: unknown): RawPointerSample | null {
  if (typeof message !== 'object' || message === null) return null
  const m = message as Record<string, unknown>
  if (typeof m['kind'] !== 'string' || !KINDS.has(m['kind'])) return null
  for (const key of ['at', 'x', 'y', 'vw', 'vh', 'scale', 'ox', 'oy']) {
    if (!finite(m[key])) return null
  }
  if (!((m['vw'] as number) > 0 && (m['vh'] as number) > 0 && (m['scale'] as number) > 0)) {
    return null
  }
  const kind = m['kind'] as RawPointerSample['kind']
  if ((kind === 'down' || kind === 'up') && !finite(m['button'])) return null
  if (kind === 'scroll' && !(finite(m['dx']) && finite(m['dy']))) return null
  return {
    kind,
    at: m['at'] as number,
    x: m['x'] as number,
    y: m['y'] as number,
    vw: m['vw'] as number,
    vh: m['vh'] as number,
    scale: m['scale'] as number,
    ox: m['ox'] as number,
    oy: m['oy'] as number,
    ...(kind === 'down' || kind === 'up' ? { button: m['button'] as number } : {}),
    ...(kind === 'scroll' ? { dx: m['dx'] as number, dy: m['dy'] as number } : {}),
  }
}

const round = (value: number) => Math.round(value * 10) / 10

/** Where the sample's point is in the video, in video pixels. */
export function toVideoPoint(sample: RawPointerSample, video: Size): { x: number; y: number } {
  // The page fills the frame when the aspect ratios match, and is letterboxed otherwise.
  const fit = Math.min(video.width / sample.vw, video.height / sample.vh)
  const left = (video.width - sample.vw * fit) / 2
  const top = (video.height - sample.vh * fit) / 2
  // Pinch zoom: the visible part starts at the visual viewport's offset, magnified by `scale`.
  const x = (sample.x - sample.ox) * sample.scale
  const y = (sample.y - sample.oy) * sample.scale
  return { x: round(left + x * fit), y: round(top + y * fit) }
}

/**
 * The events.jsonl record for a sample at `t` ms of the recording, or null when it has no
 * place there (a button the format doesn't know, e.g. back/forward).
 */
export function toMouseEvent(
  sample: RawPointerSample,
  video: Size,
  t: number,
): MouseEventRecord | null {
  const { x, y } = toVideoPoint(sample, video)
  const time = Math.max(0, Math.round(t))
  switch (sample.kind) {
    case 'move':
      return { t: time, x, y, type: 'move' }
    case 'leave':
      return { t: time, x, y, type: 'move', outside: true }
    case 'down':
    case 'up': {
      const button = BUTTONS[sample.button ?? -1]
      return button ? { t: time, x, y, type: sample.kind, button } : null
    }
    case 'scroll': {
      // Wheel deltas follow the same scale as the positions.
      const fit = Math.min(video.width / sample.vw, video.height / sample.vh) * sample.scale
      return {
        t: time,
        x,
        y,
        type: 'scroll',
        dx: round((sample.dx ?? 0) * fit),
        dy: round((sample.dy ?? 0) * fit),
      }
    }
  }
}
