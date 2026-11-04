import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger, logsDir, redact } from './logger.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const now = () => new Date('2026-11-03T10:00:00.000Z')

describe('redact', () => {
  it('replaces a Windows home folder in every spelling', () => {
    const home = 'C:\\Users\\Douglas'
    expect(redact('open C:\\Users\\Douglas\\Kamo\\projects\\x failed', home)).toBe(
      'open ~\\Kamo\\projects\\x failed',
    )
    expect(redact('file:///C:/Users/Douglas/Kamo', home)).toBe('file:///~/Kamo')
    expect(redact('c:\\users\\douglas\\AppData', home)).toBe('~\\AppData')
    expect(redact('{"path":"C:\\\\Users\\\\Douglas\\\\x"}', home)).toBe('{"path":"~\\\\x"}')
  })

  it('replaces a POSIX home folder, case-sensitively', () => {
    const home = '/Users/douglas/'
    expect(redact('at /Users/douglas/Kamo/projects (x)', home)).toBe('at ~/Kamo/projects (x)')
    expect(redact('/Users/Douglas/x', home)).toBe('/Users/Douglas/x')
  })

  it('leaves text alone when the home folder is unusable', () => {
    expect(redact('/x/y', '/')).toBe('/x/y')
  })
})

describe('Logger', () => {
  it('writes JSON lines with level and redacted fields', async () => {
    const home = 'C:\\Users\\Douglas'
    const log = new Logger(join(dir, 'logs'), { home, now })
    log.info('app.start', { version: '0.1.0' })
    log.warn('disk.low', { freeBytes: 10 })
    log.error('store.write_failed', {
      error: new Error('EPERM: C:\\Users\\Douglas\\Kamo\\projects\\p\\project.json'),
      level: 'spoofed',
    })
    const lines = (await readFile(join(dir, 'logs', 'kamo.log'), 'utf8')).trim().split('\n')
    const entries = lines.map((line) => JSON.parse(line))
    expect(entries.map((e) => [e.level, e.event])).toEqual([
      ['info', 'app.start'],
      ['warn', 'disk.low'],
      ['error', 'store.write_failed'],
    ])
    expect(entries[0]).toEqual({
      t: '2026-11-03T10:00:00.000Z',
      level: 'info',
      event: 'app.start',
      version: '0.1.0',
    })
    expect(entries[2].error.message).toBe('EPERM: ~\\Kamo\\projects\\p\\project.json')
    expect(lines.join('\n')).not.toContain('Douglas')
  })

  it('rotates at the size limit, keeping one previous file', async () => {
    const log = new Logger(dir, { maxBytes: 1000, now })
    for (let i = 0; i < 40; i++) log.info('tick', { i })
    expect((await stat(join(dir, 'kamo.log'))).size).toBeLessThanOrEqual(1000)
    expect((await stat(join(dir, 'kamo.1.log'))).size).toBeLessThanOrEqual(1000)
    const tail = await log.tail(1000)
    expect(JSON.parse(tail.at(-1)!).i).toBe(39)
    // older lines beyond the previous file are gone
    expect(tail.length).toBeLessThan(40)
  })

  it('tails the last N lines across the rotation, oldest first', async () => {
    const log = new Logger(dir, { maxBytes: 600, now })
    for (let i = 0; i < 12; i++) log.info('tick', { i })
    const tail = await log.tail(8)
    expect(tail.map((line) => JSON.parse(line).i)).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('tails an empty log and defaults to 200 lines', async () => {
    const log = new Logger(dir, { now })
    expect(await log.tail()).toEqual([])
    for (let i = 0; i < 250; i++) log.info('tick', { i })
    const tail = await log.tail()
    expect(tail).toHaveLength(200)
    expect(JSON.parse(tail[0]!).i).toBe(50)
  })

  it('never throws when the log cannot be written', async () => {
    await writeFile(join(dir, 'blocker'), 'a file where the folder should be')
    const log = new Logger(join(dir, 'blocker', 'logs'), { now, onWriteFailure: () => {} })
    expect(() => log.info('x')).not.toThrow()
  })

  // Regression: a rename that failed once (Windows: the file held open elsewhere) left the
  // cached size over the limit, so every later line retried it and was silently dropped.
  it('keeps logging when the rotation cannot move the file aside', async () => {
    await mkdir(join(dir, 'kamo.1.log'))
    await writeFile(join(dir, 'kamo.1.log', 'keep'), 'a folder in the way of the rename')
    const log = new Logger(dir, { maxBytes: 300, now })
    for (let i = 0; i < 20; i++) log.info('tick', { i })
    const lines = (await readFile(join(dir, 'kamo.log'), 'utf8')).trim().split('\n')
    expect(lines.map((line) => JSON.parse(line).i)).toEqual([...Array(20).keys()])
    expect(log.writeFailures).toBe(0)
  })

  it('rotates on the real file size when another process appends too', async () => {
    const devRun = new Logger(dir, { maxBytes: 1000, now })
    const smokeRun = new Logger(dir, { maxBytes: 1000, now })
    for (let i = 0; i < 40; i++) (i % 2 ? devRun : smokeRun).info('tick', { i })
    expect((await stat(join(dir, 'kamo.log'))).size).toBeLessThanOrEqual(1000)
    const tail = await devRun.tail(1000)
    expect(JSON.parse(tail.at(-1)!).i).toBe(39)
  })

  it('reports the first failed write, keeps the lines and writes them once it can', async () => {
    const logs = join(dir, 'logs')
    await writeFile(logs, 'a file where the folder should be')
    const failures: string[] = []
    const log = new Logger(logs, { now, onWriteFailure: (code) => failures.push(code) })
    log.info('app.start')
    log.info('recording.started')
    expect(failures).toHaveLength(1)
    expect(log.writeFailures).toBe(2)
    const tail = (await log.tail()).map((line) => JSON.parse(line))
    expect(tail.map((entry) => entry.event)).toEqual([
      'app.start',
      'recording.started',
      'log.write_failed',
    ])
    expect(tail[2]).toMatchObject({ level: 'error', count: 2 })

    await rm(logs)
    log.info('recording.finished')
    const written = (await readFile(join(logs, 'kamo.log'), 'utf8')).trim().split('\n')
    expect(written.map((line) => JSON.parse(line).event)).toEqual([
      'app.start',
      'recording.started',
      'recording.finished',
    ])
  })
})

describe('logsDir', () => {
  it('is the logs folder inside app-data on every OS', () => {
    expect(logsDir(join('app-data', 'Kamo'))).toBe(join('app-data', 'Kamo', 'logs'))
  })
})
