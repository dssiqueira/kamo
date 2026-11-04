import { describe, expect, it } from 'vitest'
import type { CursorFrame } from '../cursor/cursor.ts'
import { DEFAULT_STYLE, type Style } from '../project/schema.ts'
import { outputSize } from './layout.ts'
import { createRenderer, type RenderInput, type Surface } from './renderer.ts'
import type { Context2D, ImageSourceLike } from './types.ts'

interface Call {
  name: string
  args: unknown[]
}

/** A 2D context that records every method call and property set (there is no canvas in Node). */
function recordingContext(label: string, log: Call[]) {
  const props: Record<string, unknown> = { canvas: { label } }
  const ctx = new Proxy(props, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        log.push({ name: `${label}.${key}`, args })
        if (key.startsWith('create') && key.endsWith('Gradient')) return { addColorStop() {} }
        return undefined
      }
    },
    set(target, key, value) {
      if (typeof key === 'string') {
        log.push({ name: `${label}.${key}=`, args: [value] })
        target[key] = value
      }
      return true
    },
  })
  return ctx as unknown as Context2D
}

function setup() {
  const log: Call[] = []
  const surfaces: Surface[] = []
  const ctx = recordingContext('main', log)
  const renderer = createRenderer(ctx, {
    createSurface: () => {
      const surface = {
        canvas: { backdrop: surfaces.length } as unknown as ImageSourceLike,
        ctx: recordingContext('backdrop', log),
      }
      surfaces.push(surface)
      return surface
    },
  })
  return { log, surfaces, renderer }
}

const SOURCE = { video: true } as unknown as ImageSourceLike
const visibleCursor: CursorFrame = { x: 1280, y: 720, visible: true, opacity: 1, ripple: null }

function input(over: Partial<RenderInput> = {}): RenderInput {
  return {
    source: SOURCE,
    sourceSize: { width: 2560, height: 1440 },
    style: DEFAULT_STYLE,
    aspect: '16:9',
    output: outputSize('16:9', '1080p'),
    viewport: null,
    cursor: visibleCursor,
    cursorSize: 1.5,
    ...over,
  }
}

const names = (log: Call[], prefix = 'main.') =>
  log.filter((c) => c.name.startsWith(prefix)).map((c) => c.name.slice(prefix.length))

const backdropBuilds = (log: Call[]) => log.filter((c) => c.name === 'backdrop.clearRect').length

describe('createRenderer', () => {
  it('draws backdrop → clip → source crop → cursor, in that order', () => {
    const { log, renderer } = setup()
    renderer.render(input())
    const main = names(log).filter((n) =>
      ['drawImage', 'save', 'clip', 'fill', 'stroke', 'restore'].includes(n),
    )
    expect(main).toEqual([
      'drawImage', // cached backdrop
      'save',
      'clip',
      'drawImage', // source crop into the frame
      'save',
      'stroke', // cursor outline
      'fill', // cursor body
      'restore',
      'restore',
    ])
  })

  it('draws the backdrop canvas at 0,0 and the source crop into the frame', () => {
    const { log, renderer } = setup()
    const viewport = { x: 640, y: 360, width: 1280, height: 720 }
    const layout = renderer.render(input({ viewport }))
    const draws = log.filter((c) => c.name === 'main.drawImage')
    expect(draws[0]?.args).toEqual([{ backdrop: 0 }, 0, 0])
    const { frame } = layout
    expect(draws[1]?.args).toEqual([
      SOURCE,
      640,
      360,
      1280,
      720,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
    ])
  })

  it('smooths the source in high quality', () => {
    const { log, renderer } = setup()
    renderer.render(input())
    const sets = log.filter((c) => c.name.startsWith('main.imageSmoothing'))
    expect(sets.map((c) => [c.name, c.args[0]])).toEqual([
      ['main.imageSmoothingEnabled=', true],
      ['main.imageSmoothingQuality=', 'high'],
    ])
  })

  it('clips the frame with a rounded-rect path', () => {
    const { log, renderer } = setup()
    renderer.render(input())
    const main = names(log)
    const clip = main.indexOf('clip')
    const path = main.slice(main.indexOf('beginPath'), clip)
    expect(path.filter((n) => n === 'arcTo')).toHaveLength(4)
    expect(path.at(-1)).toBe('closePath')
  })

  it('caches the backdrop across frames with the same style', () => {
    const { log, surfaces, renderer } = setup()
    for (let i = 0; i < 10; i++) {
      renderer.render(input({ viewport: { x: i * 10, y: 0, width: 1280, height: 720 } }))
    }
    expect(surfaces).toHaveLength(1)
    expect(backdropBuilds(log)).toBe(1)
    expect(log.filter((c) => c.name === 'main.drawImage')).toHaveLength(20)
  })

  it('rebuilds the backdrop when the style changes, reusing the surface', () => {
    const { log, surfaces, renderer } = setup()
    const styles: Style[] = [
      DEFAULT_STYLE,
      { ...DEFAULT_STYLE, background: { kind: 'preset', value: 'dawn' } },
      { ...DEFAULT_STYLE, background: { kind: 'preset', value: 'dawn' }, padding: 15 },
      { ...DEFAULT_STYLE, background: { kind: 'preset', value: 'dawn' }, padding: 15, radius: 30 },
      {
        ...DEFAULT_STYLE,
        background: { kind: 'preset', value: 'dawn' },
        padding: 15,
        radius: 30,
        shadow: false,
      },
    ]
    for (const style of styles) renderer.render(input({ style }))
    renderer.render(input({ style: styles[styles.length - 1] ?? DEFAULT_STYLE }))
    expect(backdropBuilds(log)).toBe(5)
    expect(surfaces).toHaveLength(1)
  })

  it('creates a new backdrop surface when the output size changes', () => {
    const { surfaces, renderer } = setup()
    renderer.render(input())
    renderer.render(input({ aspect: '1:1', output: outputSize('1:1', '1080p') }))
    expect(surfaces).toHaveLength(2)
  })

  it('rebuilds after invalidate()', () => {
    const { log, renderer } = setup()
    renderer.render(input())
    renderer.invalidate()
    renderer.render(input())
    expect(backdropBuilds(log)).toBe(2)
  })

  it('paints the shadow only when style.shadow is on', () => {
    const on = setup()
    on.renderer.render(input())
    expect(on.log.some((c) => c.name === 'backdrop.shadowBlur=' && Number(c.args[0]) > 0)).toBe(
      true,
    )
    const off = setup()
    off.renderer.render(input({ style: { ...DEFAULT_STYLE, shadow: false } }))
    expect(off.log.some((c) => c.name === 'backdrop.shadowBlur=')).toBe(false)
  })

  it('paints the wallpaper before the shadow-casting frame', () => {
    const { log, renderer } = setup()
    renderer.render(input())
    const backdrop = names(log, 'backdrop.')
    expect(backdrop.indexOf('createLinearGradient')).toBeLessThan(backdrop.indexOf('fill'))
    expect(backdrop.lastIndexOf('fillRect')).toBeLessThan(backdrop.indexOf('fill'))
  })

  it('skips the cursor when invisible, null, or outside the crop', () => {
    const cases: (CursorFrame | null)[] = [
      null,
      { ...visibleCursor, visible: false, opacity: 0 },
      { ...visibleCursor, x: 100, y: 100 }, // outside the zoomed crop below
    ]
    for (const cursor of cases) {
      const { log, renderer } = setup()
      renderer.render(input({ cursor, viewport: { x: 640, y: 360, width: 1280, height: 720 } }))
      expect(names(log)).not.toContain('stroke')
      expect(names(log)).not.toContain('fill')
    }
  })

  it('places and scales the cursor with the camera', () => {
    const { log, renderer } = setup()
    const viewport = { x: 640, y: 360, width: 1280, height: 720 } // 2× zoom of a 2560 source
    renderer.render(
      input({
        viewport,
        style: { ...DEFAULT_STYLE, padding: 0 },
        cursor: { ...visibleCursor, opacity: 0.5 },
      }),
    )
    const translate = log.find((c) => c.name === 'main.translate')
    const scale = log.find((c) => c.name === 'main.scale')
    expect(translate?.args).toEqual([960, 540]) // source 1280,720 → output center
    expect(scale?.args[0]).toBeCloseTo(1.5 * 1.5) // cursorSize × (1920 / 1280)
    expect(log.find((c) => c.name === 'main.globalAlpha=')?.args).toEqual([0.5])
  })

  it('draws the ripple as a circle under the cursor, sized by the spring easing', () => {
    const { log, renderer } = setup()
    renderer.render(
      input({
        cursor: { ...visibleCursor, ripple: { x: 1280, y: 720, progress: 0.5, button: 'left' } },
      }),
    )
    const main = names(log)
    const arc = main.indexOf('arc')
    expect(arc).toBeGreaterThan(main.indexOf('clip'))
    expect(arc).toBeLessThan(main.indexOf('translate'))
    expect(main.filter((n) => n === 'arc')).toHaveLength(1)
  })

  it('draws the ripple even when the cursor itself is hidden by auto-hide', () => {
    const { log, renderer } = setup()
    renderer.render(
      input({
        cursor: {
          ...visibleCursor,
          visible: false,
          opacity: 0,
          ripple: { x: 1280, y: 720, progress: 0.2, button: 'left' },
        },
      }),
    )
    expect(names(log)).toContain('arc')
    expect(names(log)).not.toContain('translate')
  })
})

describe('Context2D', () => {
  it('accepts the real DOM 2D contexts and image sources (type-level check)', () => {
    const asContext = (c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) =>
      c satisfies Context2D
    const asImage = (s: CanvasImageSource) => s satisfies ImageSourceLike
    expect(typeof asContext).toBe('function')
    expect(typeof asImage).toBe('function')
  })
})
