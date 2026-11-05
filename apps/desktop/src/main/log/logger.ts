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
  return replaceFolder(text, home, '~')
}

/**
 * Also hides folders the user chose outside the home folder (a projects folder on another
 * drive, `D:\Users\Maria Silva\Videos`), in "Copy diagnostics" and the issue link. Each one
 * becomes its label, e.g. `<projects>`; then the home folder becomes `~`.
 */
export function redactFolders(
  text: string,
  folders: ReadonlyArray<readonly [path: string, label: string]>,
  home: string = homedir(),
): string {
  // Folders inside the home folder already read `~/…`, with no name in them: left as they are.
  const homeRedacted = (path: string) => redact(path, home) !== path
  // Longest first, so a folder inside another one keeps its own label.
  const sorted = folders
    .filter(([path]) => !homeRedacted(path))
    .sort((a, b) => b[0].length - a[0].length)
  let clean = text
  for (const [path, label] of sorted) clean = replaceFolder(clean, path, label)
  return redact(clean, home)
}

function replaceFolder(text: string, folder: string, replacement: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '')
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
  return text.replace(pattern, replacement)
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

/** Lines kept in memory while the file cannot be written, so "Copy diagnostics" still has them. */
export const MAX_PENDING_LINES = 500

/**
 * The documented place (docs/data-model.md: `app-data/logs/`): `logs` inside Electron's userData
 * folder, on every OS. `app.getPath('logs')` is not used: on Mac it points to ~/Library/Logs.
 */
export function logsDir(userData: string): string {
  return join(userData, 'logs')
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown'
}

export interface LoggerOptions {
  maxBytes?: number
  /** Home folder to redact; defaults to os.homedir(). */
  home?: string
  now?: () => Date
  /**
   * Called once, on the first line that cannot be written (default: one line on stderr, which
   * the dev terminal shows). Later failures are only counted.
   */
  onWriteFailure?: (code: string, file: string) => void
}

export class Logger {
  readonly file: string
  readonly previousFile: string
  private readonly maxBytes: number
  private readonly home: string
  private readonly now: () => Date
  private readonly onWriteFailure: (code: string, file: string) => void
  /** Bytes in the file, as last seen by this process (other Kamo processes may append too). */
  private size: number | undefined
  /** Lines that could not be written yet, oldest first. */
  private readonly pending: string[] = []
  private failures = 0
  private lastFailureCode: string | undefined

  /** `dir` is the logs folder; main passes `logsDir(app.getPath('userData'))`. */
  constructor(
    readonly dir: string,
    options: LoggerOptions = {},
  ) {
    this.file = join(dir, LOG_FILE)
    this.previousFile = join(dir, PREVIOUS_LOG_FILE)
    this.maxBytes = options.maxBytes ?? MAX_LOG_BYTES
    this.home = options.home ?? homedir()
    this.now = options.now ?? (() => new Date())
    this.onWriteFailure =
      options.onWriteFailure ??
      ((code, file) =>
        console.error(`kamo: cannot write the log ${redact(file, this.home)}: ${code}`))
  }

  /** Lines that could not be written since the process started (0 when all is well). */
  get writeFailures(): number {
    return this.failures
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
    // Lines this process could not write still belong in a problem report, with a note why.
    const unwritten = this.failures
      ? [
          ...this.pending.map((line) => line.trimEnd()),
          JSON.stringify({
            t: this.now().toISOString(),
            level: 'error',
            event: 'log.write_failed',
            code: this.lastFailureCode,
            count: this.failures,
          }),
        ]
      : []
    const own = [...current, ...unwritten]
    const previous = own.length >= lines ? [] : await read(this.previousFile)
    return [...previous, ...own].slice(-lines)
  }

  private currentSize(): number {
    try {
      return statSync(this.file).size
    } catch {
      return 0
    }
  }

  /**
   * Moves a full file aside. The cached size is checked against the disk first, because other
   * Kamo processes (a dev run, a smoke test) append to the same file. A failed rename (Windows:
   * the file is held open elsewhere) never stops logging: the file grows a little past the limit
   * and the next line tries again.
   */
  private rotateIfFull(bytes: number): void {
    if (this.size === undefined || this.size + bytes > this.maxBytes) this.size = this.currentSize()
    if (this.size === 0 || this.size + bytes <= this.maxBytes) return
    try {
      renameSync(this.file, this.previousFile)
      this.size = 0
    } catch {
      // keep appending to the current file
    }
  }

  private format(level: LogLevel, event: string, data?: Record<string, unknown>): string {
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
    return `${JSON.stringify(entry)}\n`
  }

  /**
   * Logging must never break the app, so nothing here throws. A line that cannot be written is
   * kept in memory (written later, and shown by tail()) and the first failure is reported.
   */
  private write(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    let line: string
    try {
      line = this.format(level, event, data)
    } catch {
      return
    }
    const text = this.pending.length ? `${this.pending.join('')}${line}` : line
    try {
      const bytes = Buffer.byteLength(text)
      mkdirSync(this.dir, { recursive: true })
      this.rotateIfFull(bytes)
      appendFileSync(this.file, text)
      this.size = (this.size ?? 0) + bytes
      this.pending.length = 0
    } catch (error) {
      this.pending.push(line)
      if (this.pending.length > MAX_PENDING_LINES) this.pending.shift()
      this.failures += 1
      this.lastFailureCode = errorCode(error)
      if (this.failures === 1) {
        try {
          this.onWriteFailure(this.lastFailureCode, this.file)
        } catch {
          // nowhere safer to report it
        }
      }
    }
  }
}
