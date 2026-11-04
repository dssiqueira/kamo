// End-to-end lifecycle against the real on-disk store, with fake-helper.ts as the helper.
import { loadProject, parseEvents, type MouseEventRecord } from '@kamo/core'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProjectStore } from '../storage/file-store.ts'
import { RECORDING_MARKER, findInterruptedRecordings } from '../storage/recovery.ts'
import type { CaptureLogger } from './helper-process.ts'
import {
  RecordingError,
  startRecording,
  type RecordingDeps,
  type RecordingSession,
  type RecordingStatus,
} from './recording.ts'

const FAKE_HELPER = fileURLToPath(new URL('./fake-helper.ts', import.meta.url))
// 20Ã— faster: a 5s reference frame every 250ms of wall time
const SCALE = 20

let dir: string
let store: FileProjectStore
const sessions: RecordingSession[] = []

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-recording-'))
  store = new FileProjectStore(join(dir, 'projects'))
})

afterEach(async () => {
  // never leave a helper running, whatever the test did
  await Promise.all(sessions.splice(0).map((s) => s.stop().catch(() => {})))
  await rm(dir, { recursive: true, force: true })
})

const logger = (): CaptureLogger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

function deps(env: Record<string, string> = {}, extra: Partial<RecordingDeps> = {}): RecordingDeps {
  return {
    store,
    logger: logger(),
    helper: {
      executable: process.execPath,
      args: [FAKE_HELPER],
      env: { KAMO_FAKE_TIME_SCALE: String(SCALE), KAMO_FAKE_SIZE: '2880x1800@2', ...env },
    },
    freeSpace: async () => 50_000_000_000,
    now: () => new Date('2026-11-03T10:00:00Z'),
    appVersion: '0.0.0-test',
    ...extra,
  }
}

const request = { displayId: '42', fps: 30 as const, name: 'Recording test' }

async function start(
  d: RecordingDeps,
  overrides: Partial<Parameters<typeof startRecording>[1]> = {},
): Promise<RecordingSession> {
  const session = await startRecording(d, { ...request, ...overrides })
  sessions.push(session)
  return session
}

/** Wall time for `videoMs` of video at the fake's time scale. */
const video = (videoMs: number) => sleep(videoMs / SCALE)

/** events.jsonl of a saved project; every line must parse. */
async function readSavedEvents(projectDir: string): Promise<MouseEventRecord[]> {
  const text = await readFile(join(projectDir, 'events.jsonl'), 'utf8')
  const { events, skippedLines } = parseEvents(text)
  expect(skippedLines).toEqual([])
  return events
}

/** Records a few seconds of video time, then stops and expects a saved project. */
async function recordAndSave(session: RecordingSession, videoMs = 3000) {
  await video(videoMs)
  const result = await session.stop()
  if (!('project' in result)) throw new Error('expected a saved project')
  return result
}

describe('startRecording', () => {
  it('records, pauses, resumes and saves a valid project', async () => {
    const session = await start(deps())
    const statuses: RecordingStatus[] = []
    session.onStatus((s) => statuses.push(s))
    expect(session.state).toBe('recording')
    expect(existsSync(join(session.projectDir, RECORDING_MARKER))).toBe(true)

    const wallStart = performance.now()
    await video(3000)
    await session.pause()
    expect(session.state).toBe('paused')
    await video(4000)
    await session.resume()
    await video(3500)
    const result = await session.stop()
    const wallVideoMs = (performance.now() - wallStart) * SCALE

    expect(session.state).toBe('finished')
    if (!('project' in result)) throw new Error('expected a saved project')
    expect(result.stoppedBy).toBe('user')
    const saved = await loadProject(store, session.projectId)
    expect(saved).toEqual(result.project)
    expect(saved).toMatchObject({
      name: 'Recording test',
      createdAt: '2026-11-03T10:00:00.000Z',
      source: {
        kind: 'display',
        displayId: '42',
        width: 2880,
        height: 1800,
        scaleFactor: 2,
        fps: 30,
      },
    })
    expect(saved.trim).toEqual({ startMs: 0, endMs: saved.durationMs })

    // duration excludes the pause
    expect(saved.durationMs).toBeGreaterThanOrEqual(6500)
    expect(saved.durationMs).toBeLessThan(wallVideoMs - 3000)
    const paused = statuses.find((s) => s.type === 'paused')
    const resumed = statuses.find((s) => s.type === 'resumed')
    expect(paused && resumed && paused.tMs === resumed.tMs).toBe(true)

    const files = await readdir(session.projectDir)
    expect(files.sort()).toEqual(['events.jsonl', 'frames', 'project.json', 'screen.mp4'])
    expect((await readFile(join(session.projectDir, 'screen.mp4'))).length).toBeGreaterThan(0)
    const frames = await readdir(join(session.projectDir, 'frames'))
    expect(frames.slice(0, 2)).toEqual(['0000.jpg', '0005.jpg'])
    expect(frames).toHaveLength(result.frames)
    // The 0000 frame can be emitted before onStatus is attached (it fires as capture starts),
    // so the listener may miss the first one; every frame it heard must be on disk.
    const heard = statuses.flatMap((s) => (s.type === 'frame' ? [s.file] : []))
    expect(frames).toEqual(expect.arrayContaining(heard))
    expect(heard.length).toBeGreaterThanOrEqual(result.frames - 1)
    expect(statuses.at(-1)).toEqual({ type: 'finished', result })
    expect(await findInterruptedRecordings(store)).toEqual([])

    // F-03: mouse events in video time, the pause excluded
    const events = await readSavedEvents(session.projectDir)
    expect(events.length).toBeGreaterThan((saved.durationMs / 1000) * 50)
    for (const event of events) {
      expect(event.t).toBeGreaterThanOrEqual(0)
      expect(event.t).toBeLessThanOrEqual(saved.durationMs)
    }
    // moves at 60Hz of video time, with no hole where the pause was
    const gaps = events.slice(1).map((event, i) => event.t - events[i]!.t)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1000 / 60 + 0.2)
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'down', button: 'left', t: 1000 }),
    )
    expect(events).toContainEqual(expect.objectContaining({ type: 'up', button: 'left', t: 1200 }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'scroll', t: 1500 }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'move', outside: true, t: 2000 }))

    // stop is idempotent
    await expect(session.stop()).resolves.toBe(result)
  })

  it('discards a recording shorter than 1s', async () => {
    const session = await start(deps({ KAMO_FAKE_TIME_SCALE: '1' }))
    const result = await session.stop()
    expect(result).toMatchObject({ discarded: 'too_short', stoppedBy: 'user' })
    expect(existsSync(session.projectDir)).toBe(false)
    expect(await store.listProjectIds()).toEqual([])
  })

  it('fails to start on display_not_found and leaves nothing behind', async () => {
    const error = await startRecording(
      deps({ KAMO_FAKE_FAIL_START: 'display_not_found' }),
      request,
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RecordingError)
    expect((error as RecordingError).code).toBe('display_not_found')
    expect(await store.listProjectIds()).toEqual([])
  })

  it('times out a helper that never starts, kills it and leaves nothing behind', async () => {
    const d = deps({ KAMO_FAKE_START_DELAY_MS: '5000' }, { startTimeoutMs: 200 })
    await expect(startRecording(d, request)).rejects.toMatchObject({ code: 'start_timeout' })
    expect(await store.listProjectIds()).toEqual([])
  })

  it('keeps the marker and the partial when the helper crashes', async () => {
    const session = await start(deps({ KAMO_FAKE_CRASH_AFTER_MS: '1500' }))
    const statuses: RecordingStatus[] = []
    session.onStatus((s) => statuses.push(s))
    await expect(session.done).rejects.toMatchObject({ code: 'helper_crashed' })
    expect(session.state).toBe('failed')
    expect(statuses.at(-1)).toMatchObject({ type: 'failed' })
    await expect(session.stop()).rejects.toMatchObject({ code: 'helper_crashed' })

    const files = await readdir(session.projectDir)
    expect(files).toContain(RECORDING_MARKER)
    expect(files).toContain('screen.mp4.partial')
    expect(files).not.toContain('project.json')
    // the mouse events recorded until the crash are kept (closed by main, which is still alive)
    expect(await readSavedEvents(session.projectDir)).not.toHaveLength(0)
    expect(await findInterruptedRecordings(store)).toEqual([session.projectId])
  })

  it.each(['display_lost', 'disk_full'] as const)(
    'finalizes what was recorded when the helper stops with %s',
    async (code) => {
      const session = await start(
        deps({ KAMO_FAKE_AUTOSTOP_AFTER_MS: '2000', KAMO_FAKE_AUTOSTOP_CODE: code }),
      )
      const statuses: RecordingStatus[] = []
      session.onStatus((s) => statuses.push(s))
      const result = await session.done
      expect(result.stoppedBy).toBe(code)
      expect(statuses).toContainEqual({ type: 'stopping', reason: code })
      if (!('project' in result)) throw new Error('expected a saved project')
      expect(result.project.durationMs).toBeGreaterThanOrEqual(2000)
      expect(await loadProject(store, session.projectId)).toEqual(result.project)
      expect((await readdir(session.projectDir)).sort()).toEqual([
        'events.jsonl',
        'frames',
        'project.json',
        'screen.mp4',
      ])
      // stop after the helper stopped on its own returns the same result
      await expect(session.stop()).resolves.toBe(result)
    },
  )

  it('refuses to start with less than 1GB free, before spawning anything', async () => {
    const spawnHelper = vi.fn()
    const d = deps({}, { freeSpace: async () => 999_999_999, spawnHelper })
    await expect(startRecording(d, request)).rejects.toMatchObject({ code: 'low_disk' })
    expect(spawnHelper).not.toHaveBeenCalled()
    expect(existsSync(store.root)).toBe(false)
  })

  it('ignores event types it does not know yet', async () => {
    const d = deps({ KAMO_FAKE_EXTRA_EVENTS: '1' })
    const session = await start(d)
    await video(1500)
    const result = await session.stop()
    expect('project' in result).toBe(true)
    expect(d.logger.warn).toHaveBeenCalledWith('capture.helper.unknown_event', { type: 'webcam' })
  })
})

describe('mouse events (F-03)', () => {
  it('refuses anything that is not a mouse event, and mouse events sent while paused', async () => {
    const d = deps({ KAMO_FAKE_BAD_MOUSE: '1' })
    const session = await start(d)
    await video(1500)
    await session.pause()
    await video(1000)
    await session.resume()
    const result = await recordAndSave(session, 1000)

    const text = await readFile(join(session.projectDir, 'events.jsonl'), 'utf8')
    expect(text).not.toContain('key')
    const events = await readSavedEvents(session.projectDir)
    expect(events.every((e) => ['move', 'down', 'up', 'scroll'].includes(e.type))).toBe(true)
    expect(events.some((e) => e.x === 7777)).toBe(false)
    expect(events.at(-1)!.t).toBeLessThanOrEqual(result.project.durationMs)
    expect(d.logger.warn).toHaveBeenCalledWith('recording.mouse_event_invalid', {
      issues: expect.any(Array),
    })
    expect(d.logger.info).toHaveBeenCalledWith(
      'recording.mouse_events',
      expect.objectContaining({ invalid: 1, droppedWhilePaused: 1 }),
    )
  })

  it('keeps recording video when the mouse is unavailable', async () => {
    const session = await start(deps({ KAMO_FAKE_MOUSE_UNAVAILABLE: '1' }))
    const statuses: RecordingStatus[] = []
    session.onStatus((s) => statuses.push(s))
    const result = await recordAndSave(session)
    expect(result.project.durationMs).toBeGreaterThanOrEqual(3000)
    expect(await readSavedEvents(session.projectDir)).toEqual([])
    // sent right after `started`, before onStatus could be attached: kept in `warnings`
    expect(session.warnings).toEqual([{ code: 'mouse_unavailable', message: 'simulated' }])
    expect(statuses.some((s) => s.type === 'failed')).toBe(false)
  })

  it('records no mouse events when asked not to', async () => {
    const session = await start(deps(), { mouse: false })
    await recordAndSave(session)
    expect(await readSavedEvents(session.projectDir)).toEqual([])
  })
})
