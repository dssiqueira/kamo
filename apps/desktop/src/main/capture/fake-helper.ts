// Fake capture helper for tests: speaks the same protocol as the native helpers (PROTOCOL.md)
// without capturing anything. Run with `node fake-helper.ts` (Node 24 strips the types), so
// only erasable TypeScript here and nothing but Node built-ins. Never bundled into the app.
//
// Environment switches:
//   KAMO_FAKE_TIME_SCALE=20             video time runs 20× faster than wall time (default 1)
//   KAMO_FAKE_FAIL_START=<code>         answer `start` with a fatal error and exit 1
//   KAMO_FAKE_START_DELAY_MS=500        wall ms before answering `start` (slow start)
//   KAMO_FAKE_CRASH_AFTER_MS=1000       exit 3 with no `stopped` after this much video time
//   KAMO_FAKE_AUTOSTOP_AFTER_MS=1500    stop by itself after this much video time, with
//   KAMO_FAKE_AUTOSTOP_CODE=display_lost  this error code (display_lost or disk_full)
//   KAMO_FAKE_EXTRA_EVENTS=1            also send an event type main does not know yet
//   KAMO_FAKE_SIZE=1920x1080@1.5        width x height @ scaleFactor reported in `started`
//   KAMO_FAKE_MOUSE_UNAVAILABLE=1       no mouse events, a non-fatal `mouse_unavailable` instead
//   KAMO_FAKE_BAD_MOUSE=1               also send mouse events main must refuse: a key-looking
//                                       one after `started`, and one while paused (x = 7777)
//   KAMO_FAKE_REQUIRE_MONITOR_POINT=1   like the Windows helper: `start` without `monitorPoint`
//                                       is a fatal display_not_found (otherwise it is ignored)
//
// Mouse (F-03): unless `start` says `mouse: false`, moves at 60Hz of video time along a curve
// inside the video, plus a drag (down at 1000ms, up at 1200ms), a scroll at 1500ms and one move
// outside the display at 2000ms. They are generated on the video timeline, so none falls in a
// pause, like the native helpers.
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { HelperCommand, HelperEvent, StartCommand } from './protocol.ts'

const env = process.env
const numberEnv = (name: string): number | undefined => {
  const value = env[name]
  return value === undefined || value === '' ? undefined : Number(value)
}

const timeScale = numberEnv('KAMO_FAKE_TIME_SCALE') ?? 1
const crashAfterMs = numberEnv('KAMO_FAKE_CRASH_AFTER_MS')
const autostopAfterMs = numberEnv('KAMO_FAKE_AUTOSTOP_AFTER_MS')
const autostopCode = env.KAMO_FAKE_AUTOSTOP_CODE === 'disk_full' ? 'disk_full' : 'display_lost'
const [, width = '1920', height = '1080', scale = '1'] =
  /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(env.KAMO_FAKE_SIZE ?? '') ?? []

// Smallest thing that starts and ends like a JPEG; nobody decodes it in tests.
const FAKE_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
])
const TICK_MS = 5
const MOVE_INTERVAL_MS = 1000 / 60
const videoWidth = Number(width)
const videoHeight = Number(height)

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Where the fake pointer is at video time `t`: a slow curve that stays inside the video. */
function pointer(t: number): { x: number; y: number } {
  return {
    x: round1(videoWidth / 2 + (videoWidth / 3) * Math.sin(t / 700)),
    y: round1(videoHeight / 2 + (videoHeight / 3) * Math.cos(t / 900)),
  }
}

/** Scripted non-move events, by video time. */
const SCRIPT: { t: number; event: (t: number) => Record<string, unknown> }[] = [
  { t: 1000, event: (t) => ({ t, type: 'down', button: 'left', ...pointer(t) }) },
  { t: 1200, event: (t) => ({ t, type: 'up', button: 'left', ...pointer(t) }) },
  { t: 1500, event: (t) => ({ t, type: 'scroll', dx: 0, dy: -120, ...pointer(t) }) },
  {
    t: 2000,
    event: (t) => ({
      t,
      type: 'move',
      x: videoWidth + 100,
      y: round1(videoHeight / 2),
      outside: true,
    }),
  },
]

function emit(event: HelperEvent | Record<string, unknown>, done?: () => void): void {
  process.stdout.write(`${JSON.stringify(event)}\n`, done)
}

let started: StartCommand | null = null
let fd: number | null = null
let paused = false
let videoMs = 0
let lastTick = 0
let nextFrameMs = 0
let frames = 0
let timer: NodeJS.Timeout | null = null
let finished = false
let mouse = false
let nextMoveMs = 0
let nextScripted = 0

/** Mouse events due up to the current video time, in order. */
function emitMouse(): void {
  while (videoMs >= nextMoveMs) {
    const t = round1(nextMoveMs)
    while (nextScripted < SCRIPT.length && SCRIPT[nextScripted]!.t <= t) {
      const step = SCRIPT[nextScripted++]!
      emit({ event: 'mouse', ...step.event(step.t) })
    }
    emit({ event: 'mouse', t, type: 'move', ...pointer(t) })
    nextMoveMs += MOVE_INTERVAL_MS
  }
}

/** Advances video time to now. Paused time is not video time. */
function tick(): void {
  const now = performance.now()
  if (!paused) videoMs += (now - lastTick) * timeScale
  lastTick = now
  if (!started || fd === null || finished) return

  writeSync(fd, new Uint8Array(256).fill(frames % 256))
  while (videoMs >= nextFrameMs) {
    const file = `${String(Math.round(nextFrameMs / 1000)).padStart(4, '0')}.jpg`
    writeFileSync(join(started.framesDir, file), FAKE_JPEG)
    frames++
    emit({ event: 'frame', file, tMs: nextFrameMs })
    nextFrameMs += started.frameIntervalMs
  }
  if (mouse && !paused) emitMouse()
  if (crashAfterMs !== undefined && videoMs >= crashAfterMs) {
    process.stderr.write('fake helper: simulated crash\n')
    process.exit(3)
  }
  if (autostopAfterMs !== undefined && videoMs >= autostopAfterMs) {
    emit({ event: 'error', code: autostopCode, message: 'simulated', fatal: false })
    finish()
  }
}

/** Finalizes the output and exits 0 once `stopped` is flushed. */
function finish(): void {
  if (finished) return
  if (timer) clearInterval(timer)
  if (fd !== null) {
    fsyncSync(fd)
    closeSync(fd)
    fd = null
  }
  finished = true
  emit({ event: 'stopped', durationMs: Math.round(videoMs), frames }, () => process.exit(0))
}

function start(command: StartCommand): void {
  const failCode =
    env.KAMO_FAKE_FAIL_START ||
    (env.KAMO_FAKE_REQUIRE_MONITOR_POINT && !command.monitorPoint ? 'display_not_found' : '')
  if (failCode) {
    emit({ event: 'error', code: failCode, message: 'simulated', fatal: true }, () =>
      process.exit(1),
    )
    return
  }
  started = command
  mkdirSync(command.framesDir, { recursive: true })
  fd = openSync(command.output, 'w')
  writeSync(fd, new TextEncoder().encode('\0\0\0\x18ftypisom'))
  lastTick = performance.now()
  emit({
    event: 'started',
    width: Number(width),
    height: Number(height),
    scaleFactor: Number(scale),
    fps: command.fps,
  })
  if (env.KAMO_FAKE_EXTRA_EVENTS) emit({ event: 'webcam', t: 0 })
  if (command.mouse !== false) {
    if (env.KAMO_FAKE_MOUSE_UNAVAILABLE) {
      emit({ event: 'error', code: 'mouse_unavailable', message: 'simulated', fatal: false })
    } else {
      mouse = true
    }
  }
  if (env.KAMO_FAKE_BAD_MOUSE) {
    emit({ event: 'mouse', t: 0, type: 'key', x: 0, y: 0, key: 'a' })
  }
  timer = setInterval(tick, TICK_MS)
  tick()
}

function handle(command: HelperCommand): void {
  if (command.cmd === 'start') {
    if (started) return
    const delay = numberEnv('KAMO_FAKE_START_DELAY_MS') ?? 0
    if (delay > 0) setTimeout(() => start(command), delay)
    else start(command)
    return
  }
  if (!started || finished) return
  tick()
  if (command.cmd === 'pause' && !paused) {
    paused = true
    emit({ event: 'paused', tMs: videoMs })
    // a buggy helper: main must drop mouse events between `paused` and `resumed`
    if (env.KAMO_FAKE_BAD_MOUSE) emit({ event: 'mouse', t: videoMs, type: 'move', x: 7777, y: 1 })
  } else if (command.cmd === 'resume' && paused) {
    paused = false
    emit({ event: 'resumed', tMs: videoMs })
  } else if (command.cmd === 'stop') {
    finish()
  }
}

process.stderr.write(`fake helper pid ${process.pid}, time scale ${timeScale}\n`)
emit({ event: 'ready', version: 'fake-0.0.0' })

const input = createInterface({ input: process.stdin })
input.on('line', (line) => {
  if (line.trim() === '') return
  try {
    handle(JSON.parse(line) as HelperCommand)
  } catch (error) {
    emit({ event: 'error', code: 'internal', message: String(error), fatal: false })
  }
})
// stdin EOF (main went away) means stop
input.on('close', () => {
  if (started) {
    tick()
    finish()
  } else process.exit(0)
})
