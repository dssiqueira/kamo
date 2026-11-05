import { describe, expect, it } from 'vitest'
import { encodeCommand, parseEvent, type HelperCommand } from './protocol.ts'

describe('encodeCommand', () => {
  it('writes one JSON line per command', () => {
    const start: HelperCommand = {
      cmd: 'start',
      displayId: '1',
      fps: 30,
      output: 'C:\\p\\screen.mp4.partial',
      framesDir: 'C:\\p\\frames',
      frameIntervalMs: 5000,
      frameWidth: 480,
    }
    const line = encodeCommand(start)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line)).toEqual(start)
    expect(encodeCommand({ cmd: 'stop' })).toBe('{"cmd":"stop"}\n')
    expect(JSON.parse(encodeCommand({ ...start, mouse: false }))).toMatchObject({ mouse: false })
    const withPoint = { ...start, monitorPoint: { x: -1280, y: 540 } }
    expect(JSON.parse(encodeCommand(withPoint))).toEqual(withPoint)
  })

  it('refuses an invalid command before it leaves main', () => {
    const start = {
      cmd: 'start',
      displayId: '1',
      fps: 30,
      output: 'x',
      framesDir: 'y',
      frameIntervalMs: 5000,
      frameWidth: 480,
    } as const
    // monitorPoint: physical pixels, integers, nothing else
    for (const monitorPoint of [{ x: 1.5, y: 0 }, { x: 0 }, { x: 0, y: 0, z: 0 }]) {
      expect(() => encodeCommand({ ...start, monitorPoint } as unknown as HelperCommand)).toThrow()
    }
    expect(() => encodeCommand({ cmd: 'pause', extra: 1 } as unknown as HelperCommand)).toThrow()
    expect(() =>
      encodeCommand({
        cmd: 'start',
        displayId: '1',
        fps: 25,
        output: 'x',
        framesDir: 'y',
        frameIntervalMs: 5000,
        frameWidth: 480,
      } as unknown as HelperCommand),
    ).toThrow()
  })
})

describe('parseEvent', () => {
  it.each([
    ['{"event":"ready","version":"1.0.0"}', 'ready'],
    ['{"event":"started","width":2880,"height":1800,"scaleFactor":2,"fps":60}', 'started'],
    ['{"event":"paused","tMs":1200.5}', 'paused'],
    ['{"event":"resumed","tMs":1200.5}', 'resumed'],
    ['{"event":"frame","file":"0005.jpg","tMs":5000}', 'frame'],
    ['{"event":"stopped","durationMs":61000,"frames":13}', 'stopped'],
    ['{"event":"error","code":"display_lost","message":"gone","fatal":false}', 'error'],
    ['{"event":"error","code":"mouse_unavailable","message":"no tap","fatal":false}', 'error'],
    ['{"event":"mouse","t":16.7,"type":"move","x":10.5,"y":20}', 'mouse'],
    ['{"event":"mouse","t":17,"type":"move","x":-40,"y":20,"outside":true}', 'mouse'],
    ['{"event":"mouse","t":20,"type":"down","x":1,"y":2,"button":"left"}', 'mouse'],
    ['{"event":"mouse","t":30,"type":"scroll","x":1,"y":2,"dx":0,"dy":-12}', 'mouse'],
  ])('accepts %s', (line, type) => {
    const parsed = parseEvent(line)
    expect(parsed.reason).toBeNull()
    expect(parsed.event?.event).toBe(type)
  })

  it('drops extra fields from a newer helper', () => {
    const parsed = parseEvent('{"event":"ready","version":"2","features":["mouse"]}')
    expect(parsed.event).toEqual({ event: 'ready', version: '2' })
  })

  it('reports unknown event types separately (forward compatibility)', () => {
    const parsed = parseEvent('{"event":"webcam","t":0}')
    expect(parsed.event).toBeNull()
    expect(parsed).toMatchObject({ unknownType: 'webcam' })
  })

  it('never passes on extra fields of a mouse event', () => {
    const parsed = parseEvent('{"event":"mouse","t":1,"type":"move","x":1,"y":2,"key":"a"}')
    expect(parsed.event).toEqual({ event: 'mouse', t: 1, type: 'move', x: 1, y: 2 })
  })

  it.each([
    ['', 'not JSON'],
    ['{"event":"ready"', 'not JSON'],
    ['[1,2]', 'not an object'],
    ['null', 'not an object'],
    ['{"version":"1"}', 'missing event type'],
    ['{"event":"started","width":0,"height":1,"scaleFactor":1,"fps":30}', 'invalid started'],
    ['{"event":"started","width":1,"height":1,"scaleFactor":1,"fps":24}', 'invalid started'],
    ['{"event":"frame","file":"../../evil.jpg","tMs":0}', 'invalid frame'],
    ['{"event":"frame","file":"0005.webp","tMs":0}', 'invalid frame'],
    ['{"event":"paused","tMs":-1}', 'invalid paused'],
    ['{"event":"error","code":"oops","message":"x","fatal":true}', 'invalid error'],
    ['{"event":"stopped","durationMs":10,"frames":1.5}', 'invalid stopped'],
    ['{"event":"mouse","t":1,"type":"move","x":"1","y":2}', 'invalid mouse'],
    ['{"event":"mouse","type":"move","x":1,"y":2}', 'invalid mouse'],
  ])('rejects %j', (line, reason) => {
    const parsed = parseEvent(line)
    expect(parsed.event).toBeNull()
    expect(parsed.reason).toContain(reason)
    expect(parsed).not.toHaveProperty('unknownType')
  })
})

describe('A-08 and D-024 protocol', () => {
  const start = {
    cmd: 'start',
    displayId: '1',
    fps: 30,
    output: 'x',
    framesDir: 'y',
    frameIntervalMs: 5000,
    frameWidth: 480,
  } as const

  it('sends a window, a region, the computer sound and the window list', () => {
    const window = { ...start, windowId: '132456' }
    expect(JSON.parse(encodeCommand(window))).toEqual(window)
    const region = { ...start, region: { x: 10, y: 20.5, width: 640, height: 480 } }
    expect(JSON.parse(encodeCommand(region))).toEqual(region)
    const sound = { ...start, systemAudio: '/p/system.m4a.partial' }
    expect(JSON.parse(encodeCommand(sound))).toEqual(sound)
    expect(encodeCommand({ cmd: 'listWindows', excludePid: 42 })).toBe(
      '{"cmd":"listWindows","excludePid":42}\n',
    )
  })

  it.each([
    [
      'a window and a region at once',
      { windowId: '1', region: { x: 0, y: 0, width: 9, height: 9 } },
    ],
    ['a window id that is not a number', { windowId: '0x1F' }],
    ['an empty region', { region: { x: 0, y: 0, width: 0, height: 9 } }],
    ['a region with extra fields', { region: { x: 0, y: 0, width: 9, height: 9, z: 1 } }],
    ['an empty sound path', { systemAudio: '' }],
  ])('refuses %s', (_name, fields) => {
    expect(() => encodeCommand({ ...start, ...fields } as unknown as HelperCommand)).toThrow()
  })

  it('reads the window list, the sound offset and the window errors', () => {
    const list = parseEvent(
      '{"event":"windows","windows":[{"id":"7","title":"Notes","app":"notepad","x":-10,"y":0,"width":800,"height":600}]}',
    )
    expect(list.event).toEqual({
      event: 'windows',
      windows: [{ id: '7', title: 'Notes', app: 'notepad', x: -10, y: 0, width: 800, height: 600 }],
    })
    expect(parseEvent('{"event":"windows","windows":[]}').event).toEqual({
      event: 'windows',
      windows: [],
    })
    expect(
      parseEvent('{"event":"stopped","durationMs":10,"frames":1,"systemAudio":{"offsetMs":-12.5}}')
        .event,
    ).toMatchObject({ systemAudio: { offsetMs: -12.5 } })
    for (const code of ['window_not_found', 'window_lost']) {
      expect(
        parseEvent(`{"event":"error","code":"${code}","message":"x","fatal":false}`).event,
      ).toBeTruthy()
    }
    expect(
      parseEvent(
        '{"event":"windows","windows":[{"id":"../x","title":"","app":"","x":0,"y":0,"width":1,"height":1}]}',
      ).event,
    ).toBeNull()
  })
})
