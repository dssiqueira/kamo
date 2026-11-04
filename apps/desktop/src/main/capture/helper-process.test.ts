import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HelperExitError,
  HelperFatalError,
  HelperProcess,
  HelperTimeoutError,
  LineSplitter,
  MAX_LINE_LENGTH,
  type CaptureLogger,
  type HelperLaunch,
} from './helper-process.ts'
import type { HelperEvent } from './protocol.ts'

const FAKE_HELPER = fileURLToPath(new URL('./fake-helper.ts', import.meta.url))

const logger = () => ({
  info: vi.fn<CaptureLogger['info']>(),
  warn: vi.fn<CaptureLogger['warn']>(),
  error: vi.fn<CaptureLogger['error']>(),
})

/** A tiny inline helper: runs `script` in Node. */
const inline = (script: string): HelperLaunch => ({
  executable: process.execPath,
  args: ['-e', script],
})

const fake = (env: Record<string, string> = {}): HelperLaunch => ({
  executable: process.execPath,
  args: [FAKE_HELPER],
  env,
})

const running: HelperProcess[] = []
const track = (helper: HelperProcess) => (running.push(helper), helper)
afterEach(async () => {
  for (const helper of running.splice(0)) {
    helper.dispose()
    await helper.exited
  }
})

describe('LineSplitter', () => {
  it('joins lines split across chunks and handles CRLF', () => {
    const splitter = new LineSplitter()
    expect(splitter.push('{"event":"rea')).toEqual([])
    expect(splitter.push('dy"}\r\n{"a":')).toEqual(['{"event":"ready"}'])
    expect(splitter.push('1}\n\n  \n{"b":2}\n{"c"')).toEqual(['{"a":1}', '{"b":2}'])
    expect(splitter.flush()).toEqual(['{"c"'])
    expect(splitter.flush()).toEqual([])
  })

  it('drops a line that grows too long, then recovers', () => {
    const onOverflow = vi.fn()
    const splitter = new LineSplitter(onOverflow)
    expect(splitter.push('x'.repeat(MAX_LINE_LENGTH + 1))).toEqual([])
    expect(onOverflow).toHaveBeenCalledOnce()
    expect(splitter.push('still the same line\nok\n')).toEqual(['ok'])
  })
})

describe('HelperProcess', () => {
  it('delivers events, ignores unknown ones and logs stderr', async () => {
    const log = logger()
    // one chunk with two events split mid-line, an unknown event and garbage in between
    const helper = track(
      new HelperProcess(
        inline(`
          process.stderr.write('booting\\n')
          process.stdout.write('{"event":"webcam","x":1}\\nnot json\\n{"event":"rea')
          setTimeout(() => process.stdout.write('dy","version":"t"}\\n'), 20)
          setTimeout(() => process.exit(0), 40)
        `),
        { logger: log },
      ),
    )
    const events: HelperEvent[] = []
    helper.onEvent((event) => events.push(event))
    await expect(helper.waitFor('ready', { timeoutMs: 5000 })).resolves.toEqual({
      event: 'ready',
      version: 't',
    })
    await helper.exited
    expect(events).toEqual([{ event: 'ready', version: 't' }])
    expect(log.warn).toHaveBeenCalledWith('capture.helper.unknown_event', { type: 'webcam' })
    expect(log.warn).toHaveBeenCalledWith('capture.helper.invalid_line', { reason: 'not JSON' })
    expect(log.info).toHaveBeenCalledWith('capture.helper.stderr', { line: 'booting' })
  })

  it('rejects a wait when the helper exits first', async () => {
    const helper = track(new HelperProcess(inline('process.exit(2)'), { logger: logger() }))
    const error = await helper.waitFor('ready', { timeoutMs: 5000 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HelperExitError)
    expect((error as HelperExitError).exit.code).toBe(2)
    // and later waits reject right away
    await expect(helper.waitFor('stopped', { timeoutMs: 5000 })).rejects.toBeInstanceOf(
      HelperExitError,
    )
    expect(() => helper.send({ cmd: 'stop' })).toThrow(HelperExitError)
  })

  it('rejects a wait on a fatal error', async () => {
    const helper = track(
      new HelperProcess(fake({ KAMO_FAKE_FAIL_START: 'permission_denied' }), { logger: logger() }),
    )
    await helper.waitFor('ready', { timeoutMs: 5000 })
    const started = helper.waitFor('started', { timeoutMs: 5000 })
    helper.send({
      cmd: 'start',
      displayId: '1',
      fps: 30,
      output: 'unused',
      framesDir: 'unused',
      frameIntervalMs: 5000,
      frameWidth: 480,
    })
    await expect(started).rejects.toMatchObject({
      name: HelperFatalError.name,
      code: 'permission_denied',
    })
  })

  it('times out without killing the process', async () => {
    const helper = track(
      new HelperProcess(inline('setTimeout(() => {}, 5000)'), { logger: logger() }),
    )
    await expect(helper.waitFor('ready', { timeoutMs: 50 })).rejects.toBeInstanceOf(
      HelperTimeoutError,
    )
    expect(helper.hasExited).toBe(false)
    helper.dispose()
    await helper.exited
    expect(helper.hasExited).toBe(true)
  })

  it('reports a binary that does not exist as an exit', async () => {
    const log = logger()
    const helper = track(
      new HelperProcess({ executable: 'Z:\\nope\\kamo-capture.exe' }, { logger: log }),
    )
    await expect(helper.waitFor('ready', { timeoutMs: 5000 })).rejects.toBeInstanceOf(
      HelperExitError,
    )
    expect(log.error).toHaveBeenCalledWith('capture.helper.spawn_failed', expect.anything())
  })
})
