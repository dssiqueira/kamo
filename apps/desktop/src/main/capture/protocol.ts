// Wire protocol between the Electron main process and the native capture helper (D-023).
// JSON Lines: one command per line on the helper's stdin, one event per line on its stdout.
// The human-readable version lives in PROTOCOL.md next to this file; keep both in sync.
import { z } from 'zod'

/** Reference frames: one JPEG every 5s of video time, 480px wide (D-023, data-model.md). */
export const FRAME_INTERVAL_MS = 5000
export const FRAME_WIDTH = 480

const Fps = z.union([z.literal(30), z.literal(60)])
const nonNegative = z.number().finite().nonnegative()
const positiveInt = z.number().int().positive()

// ---- commands (main → helper) ----

export const StartCommand = z.strictObject({
  cmd: z.literal('start'),
  displayId: z.string().min(1),
  fps: Fps,
  /** Absolute path of `screen.mp4.partial`; main renames it after `stopped`. */
  output: z.string().min(1),
  /** Absolute path of the project's `frames/` folder (already created by main). */
  framesDir: z.string().min(1),
  frameIntervalMs: positiveInt,
  frameWidth: positiveInt,
  /** Emit `mouse` events (F-03). Absent means true; false records video only. */
  mouse: z.boolean().optional(),
})
export type StartCommand = z.infer<typeof StartCommand>

export const HelperCommand = z.discriminatedUnion('cmd', [
  StartCommand,
  z.strictObject({ cmd: z.literal('pause') }),
  z.strictObject({ cmd: z.literal('resume') }),
  z.strictObject({ cmd: z.literal('stop') }),
])
export type HelperCommand = z.infer<typeof HelperCommand>

/** One line for the helper's stdin. Validates first, so a bad command never leaves main. */
export function encodeCommand(command: HelperCommand): string {
  return `${JSON.stringify(HelperCommand.parse(command))}\n`
}

// ---- events (helper → main) ----

export const HelperErrorCode = z.enum([
  'display_not_found',
  'permission_denied',
  'encoder_failed',
  'disk_full',
  'display_lost',
  /** Non-fatal: the mouse cannot be observed (no event tap); the video goes on without it. */
  'mouse_unavailable',
  'internal',
])
export type HelperErrorCode = z.infer<typeof HelperErrorCode>

// Events are parsed leniently (extra fields are dropped), so a newer helper can add fields.
export const HelperEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('ready'), version: z.string() }),
  z.object({
    event: z.literal('started'),
    width: positiveInt,
    height: positiveInt,
    scaleFactor: z.number().finite().positive(),
    fps: Fps,
  }),
  z.object({ event: z.literal('paused'), tMs: nonNegative }),
  z.object({ event: z.literal('resumed'), tMs: nonNegative }),
  z.object({
    event: z.literal('frame'),
    // zero-padded seconds of video time; a plain name, never a path
    file: z.string().regex(/^\d{4,}\.jpg$/),
    tMs: nonNegative,
  }),
  // One mouse event (F-03), in video time like `frame`. Only the shape is checked here: the
  // fields are those of a line of events.jsonl, and recording.ts validates them with the
  // MouseEventRecord schema of @kamo/core before writing them, so anything that is not a
  // mouse move/down/up/scroll (rule 2: never a key) is dropped there.
  z.object({
    event: z.literal('mouse'),
    t: z.number(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    button: z.string().optional(),
    dx: z.number().optional(),
    dy: z.number().optional(),
    outside: z.boolean().optional(),
  }),
  z.object({
    event: z.literal('stopped'),
    durationMs: nonNegative,
    frames: z.number().int().min(0),
  }),
  z.object({
    event: z.literal('error'),
    code: HelperErrorCode,
    message: z.string(),
    fatal: z.boolean(),
  }),
])
export type HelperEvent = z.infer<typeof HelperEvent>
export type HelperEventType = HelperEvent['event']
export type HelperEventOf<T extends HelperEventType> = Extract<HelperEvent, { event: T }>

const KNOWN_EVENTS: ReadonlySet<string> = new Set<HelperEventType>([
  'ready',
  'started',
  'paused',
  'resumed',
  'frame',
  'mouse',
  'stopped',
  'error',
])

export type ParsedLine =
  | { event: HelperEvent; reason: null }
  /** `unknownType` is set for a well-formed event of a type this build does not know. */
  | { event: null; reason: string; unknownType?: string }

/**
 * Parses one stdout line. Never throws: an invalid line or an unknown event type comes back
 * with `event: null` and a reason, and the caller logs it and carries on.
 */
export function parseEvent(line: string): ParsedLine {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return { event: null, reason: 'not JSON' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { event: null, reason: 'not an object' }
  }
  const type = (raw as { event?: unknown }).event
  if (typeof type !== 'string') return { event: null, reason: 'missing event type' }
  if (!KNOWN_EVENTS.has(type)) {
    return { event: null, reason: `unknown event type`, unknownType: type.slice(0, 64) }
  }
  const result = HelperEvent.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    return { event: null, reason: `invalid ${type} event: ${issues.join('; ')}` }
  }
  return { event: result.data, reason: null }
}
