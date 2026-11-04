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
  })

  it('refuses an invalid command before it leaves main', () => {
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
    const parsed = parseEvent('{"event":"mouse","type":"move","x":1,"y":2,"t":0}')
    expect(parsed.event).toBeNull()
    expect(parsed).toMatchObject({ unknownType: 'mouse' })
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
  ])('rejects %j', (line, reason) => {
    const parsed = parseEvent(line)
    expect(parsed.event).toBeNull()
    expect(parsed.reason).toContain(reason)
    expect(parsed).not.toHaveProperty('unknownType')
  })
})
