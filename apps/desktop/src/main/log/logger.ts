// Local rotating log for F-17 ("Copy diagnostics"). It never leaves the machine on its own
// (rule 3): the user sees the last lines and decides to paste them somewhere.
//
// Technical events only: never project names, transcripts or screen content. Callers pass an
// event name plus technical fields; every string is passed through redact() so paths do not
// reveal the user name.
//
// Writes are synchronous on purpose: lines are tiny, and the line logged right before a
// crash is the one that matters most.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error'

export const LOG_FILE = 'kamo.log'
export const PREVIOUS_LOG_FILE = 'kamo.1.log'
export const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_STRING_LENGTH = 2000

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces the home folder with `~` in any spelling it may appear in a message or a stack
 * (native separators, forward slashes, JSON-escaped backslashes; case-insensitive on Windows).
 */
export function redact(text: string, home: string = homedir()): string {
  const trimmed = home.replace(/[\\/]+$/, '')
  if (trimmed.length < 2) return text
  const forward = trimmed.replace(/\\/g, '/')
  const variants = new Set([
    trimmed,
    forward,
    forward.replace(/\//g, '\\'),
    forward.replace(/\//g, '\\\\'),
  ])
  const windowsLike = /^[A-Za-z]:/.test(trimmed) || trimmed.includes('\\')
  const pattern = new RegExp(
    [...variants]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|'),
    windowsLike ? 'gi' : 'g',
  )
  return text.replace(pattern, '~')
}

function sanitize(value: unknown, home: string, depth = 0): unknown {
  if (typeof value === 'string') {
    const clean = redact(value, home)
    return clean.length > MAX_STRING_LENGTH ? `${clean.slice(0, MAX_STRING_LENGTH)}…` : clean
  }
  if (value instanceof Error) {
    return sanitize({ name: value.name, message: value.message, stack: value.stack }, home, depth)
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= 4) return '[nested]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, home, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitize(item, home, depth + 1)]),
  )
}

export interface LoggerOptions {
  maxBytes?: number
  /** Home folder to redact; defaults to os.homedir(). */
  home?: string
  now?: () => Date
}

export class Logger {
  readonly file: string
  readonly previousFile: string
  private readonly maxBytes: number
  private readonly home: string
  private readonly now: () => Date
  private size: number | undefined

  /** `dir` is the logs folder; main passes `app.getPath('logs')`. */
  constructor(
    readonly dir: string,
    options: LoggerOptions = {},
  ) {
    this.file = join(dir, LOG_FILE)
    this.previousFile = join(dir, PREVIOUS_LOG_FILE)
    this.maxBytes = options.maxBytes ?? MAX_LOG_BYTES
    this.home = options.home ?? homedir()
    this.now = options.now ?? (() => new Date())
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.write('info', event, data)
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.write('warn', event, data)
  }

  error(event: string, data?: Record<string, unknown>): void {
    this.write('error', event, data)
  }

  /** Last `lines` lines across the current and the previous file, oldest first. */
  async tail(lines = 200): Promise<string[]> {
    if (lines <= 0) return []
    const read = async (file: string) => {
      try {
        return (await readFile(file, 'utf8')).split('\n').filter((line) => line !== '')
      } catch {
        return []
      }
    }
    const current = await read(this.file)
    const previous = current.length >= lines ? [] : await read(this.previousFile)
    return [...previous, ...current].slice(-lines)
  }

  /** Logging must never break the app: any failure here is swallowed. */
  private write(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    try {
      // `t`, `level` and `event` are reserved: data cannot overwrite them.
      const {
        t: _t,
        level: _level,
        event: _event,
        ...fields
      } = data ? (sanitize(data, this.home) as Record<string, unknown>) : {}
      const entry = {
        t: this.now().toISOString(),
        level,
        event: sanitize(event, this.home),
        ...fields,
      }
      const line = `${JSON.stringify(entry)}\n`
      const bytes = Buffer.byteLength(line)
      mkdirSync(this.dir, { recursive: true })
      if (this.size === undefined) {
        try {
          this.size = statSync(this.file).size
        } catch {
          this.size = 0
        }
      }
      if (this.size > 0 && this.size + bytes > this.maxBytes) {
        renameSync(this.file, this.previousFile)
        this.size = 0
      }
      appendFileSync(this.file, line)
      this.size += bytes
    } catch {
      // nowhere safer to report it
    }
  }
}
