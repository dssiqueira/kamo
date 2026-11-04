import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURES, FIXTURE_VIDEO, generateFixtures } from '../../fixtures/generate.ts'
import { formatEvents, parseEvents, readEvents, type MouseEventRecord } from '../index.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}.jsonl`, import.meta.url), 'utf8')

const sample: MouseEventRecord[] = [
  { t: 0, type: 'move', x: 10, y: 20 },
  { t: 16.7, type: 'move', x: 2000, y: 20, outside: true },
  { t: 40, type: 'down', button: 'left', x: 12, y: 22 },
  { t: 120, type: 'up', button: 'left', x: 12, y: 22 },
  { t: 200, type: 'scroll', dx: 0, dy: -120, x: 12, y: 22 },
]

describe('parseEvents', () => {
  it('round-trips every event type', () => {
    expect(parseEvents(formatEvents(sample))).toEqual({ events: sample, skippedLines: [] })
  })

  it('keeps going past a bad line and a truncated last line (crash mid-recording)', () => {
    const text = `${formatEvents(sample.slice(0, 2))}not json\n${formatEvents(sample.slice(2, 4))}{"t":300,"ty`
    const { events, skippedLines } = parseEvents(text)
    expect(events).toHaveLength(4)
    expect(skippedLines).toEqual([3, 6])
  })

  it('never accepts keyboard events (rule 2)', () => {
    const keyboard = [
      '{"t":1,"type":"keydown","key":"a","x":0,"y":0}',
      '{"t":1,"type":"down","button":"left","x":0,"y":0,"key":"a"}',
    ].join('\n')
    expect(parseEvents(keyboard).events).toEqual([])
  })

  it('requires a button on down/up and no button on move', () => {
    const lines = [
      '{"t":1,"type":"down","x":0,"y":0}',
      '{"t":1,"type":"move","button":"left","x":0,"y":0}',
    ].join('\n')
    expect(parseEvents(lines).skippedLines).toEqual([1, 2])
  })

  it('sorts by time and keeps file order on ties', () => {
    const text = formatEvents([
      { t: 50, type: 'move', x: 1, y: 1 },
      { t: 10, type: 'move', x: 2, y: 2 },
      { t: 50, type: 'down', button: 'left', x: 3, y: 3 },
    ])
    expect(parseEvents(text).events.map((e) => e.x)).toEqual([2, 1, 3])
  })
})

describe('readEvents', () => {
  it('streams events split across arbitrary chunks', async () => {
    const bytes = new TextEncoder().encode(formatEvents(sample))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
        controller.close()
      },
    })
    const events: MouseEventRecord[] = []
    for await (const event of readEvents(stream)) events.push(event)
    expect(events).toEqual(sample)
  })
})

describe('fixtures', () => {
  it('are up to date with fixtures/generate.ts', () => {
    for (const [file, content] of Object.entries(generateFixtures())) {
      expect(fixture(file.replace('.jsonl', '')), `run pnpm --filter @kamo/core fixtures`).toBe(
        content,
      )
    }
  })

  it.each(Object.keys(FIXTURES))('%s is valid and inside the video', (name) => {
    const { events, skippedLines } = parseEvents(fixture(name))
    expect(skippedLines).toEqual([])
    for (const e of events.filter((e) => !(e.type === 'move' && e.outside))) {
      expect(e.x).toBeGreaterThanOrEqual(0)
      expect(e.x).toBeLessThan(FIXTURE_VIDEO.width)
      expect(e.y).toBeGreaterThanOrEqual(0)
      expect(e.y).toBeLessThan(FIXTURE_VIDEO.height)
    }
  })

  it('cover the cases the engine steps need', () => {
    const clicks = (name: string) =>
      parseEvents(fixture(name)).events.filter((e) => e.type === 'down')
    expect(clicks('no-clicks')).toHaveLength(0)
    expect(clicks('spaced-clicks').map((e) => e.button)).toEqual(['left', 'left', 'right', 'left'])
    expect(clicks('click-burst')).toHaveLength(5)
    expect(parseEvents(fixture('outside-display')).events.some((e) => 'outside' in e)).toBe(true)
  })
})
