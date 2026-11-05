// Runs the native capture helper (D-023) as a child process and speaks the JSON Lines
// protocol with it (PROTOCOL.md). Knows nothing about projects: recording.ts does that.
import { spawn, type ChildProcess } from 'node:child_process'
import {
  encodeCommand,
  parseEvent,
  type HelperCommand,
  type HelperErrorCode,
  type HelperEvent,
  type HelperEventOf,
  type HelperEventType,
} from './protocol.ts'

/** Same shape as the main-process Logger (log/logger.ts), so tests can pass a stub. */
export interface CaptureLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, data?: Record<string, unknown>): void
}

/** How to start the helper: the real binary, or `node fake-helper.ts` in tests. */
export interface HelperLaunch {
  executable: string
  args?: readonly string[]
  /** Extra environment variables, merged over the current environment. */
  env?: Record<string, string>
}

export interface HelperExit {
  code: number | null
  signal: NodeJS.Signals | null
}

/** The helper exited (or never started) before the awaited event arrived. */
export class HelperExitError extends Error {
  constructor(
    readonly exit: HelperExit,
    readonly waitingFor?: HelperEventType,
  ) {
    super(
      `capture helper exited (code ${exit.code}, signal ${exit.signal})` +
        (waitingFor ? ` while waiting for "${waitingFor}"` : ''),
    )
    this.name = 'HelperExitError'
  }
}

/** The helper reported an error with `fatal: true`. */
export class HelperFatalError extends Error {
  constructor(
    readonly code: HelperErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HelperFatalError'
  }
}

export class HelperTimeoutError extends Error {
  constructor(
    readonly waitingFor: HelperEventType,
    readonly timeoutMs: number,
  ) {
    super(`capture helper did not send "${waitingFor}" within ${timeoutMs}ms`)
    this.name = 'HelperTimeoutError'
  }
}

/** A line longer than this is a broken helper; it is dropped instead of filling memory. */
export const MAX_LINE_LENGTH = 64 * 1024

/**
 * Splits a text stream into lines. Chunks can end mid-line (and mid-character: feed it text
 * that went through a StringDecoder, e.g. `stream.setEncoding('utf8')`). Handles `\r\n`.
 */
export class LineSplitter {
  private buffer = ''
  private overflow = false

  constructor(private readonly onOverflow: (length: number) => void = () => {}) {}

  push(chunk: string): string[] {
    const parts = (this.buffer + chunk).split('\n')
    this.buffer = parts.pop() ?? ''
    const lines: string[] = []
    for (const part of parts) {
      if (this.overflow) {
        // tail of a line that was already dropped
        this.overflow = false
        continue
      }
      lines.push(part.endsWith('\r') ? part.slice(0, -1) : part)
    }
    if (this.buffer.length > MAX_LINE_LENGTH) {
      this.onOverflow(this.buffer.length)
      this.buffer = ''
      this.overflow = true
    }
    return lines.filter((line) => line.trim() !== '')
  }

  /** Whatever is left when the stream ends (a last line without `\n`). */
  flush(): string[] {
    const rest = this.overflow ? '' : this.buffer
    this.buffer = ''
    this.overflow = false
    const line = rest.endsWith('\r') ? rest.slice(0, -1) : rest
    return line.trim() === '' ? [] : [line]
  }
}

export interface WaitOptions {
  timeoutMs: number
}

export type HelperEventListener = (event: HelperEvent) => void
export type HelperExitListener = (exit: HelperExit) => void

export interface HelperProcessOptions {
  logger: CaptureLogger
  /** Overridable for tests; defaults to child_process.spawn. */
  spawnFn?: typeof spawn
}

export class HelperProcess {
  /** Resolves when the process is gone and its stdout/stderr are drained. Never rejects. */
  readonly exited: Promise<HelperExit>
  private readonly child: ChildProcess
  private readonly logger: CaptureLogger
  private readonly listeners = new Set<HelperEventListener>()
  private readonly exitListeners = new Set<HelperExitListener>()
  private exitInfo: HelperExit | null = null
  private stoppedSeen = false
  /** Main closed stdin on purpose (closeInput): exit 0 then is the expected end. */
  private inputClosed = false

  constructor(launch: HelperLaunch, options: HelperProcessOptions) {
    this.logger = options.logger
    const spawnFn = options.spawnFn ?? spawn
    let resolveExited!: (exit: HelperExit) => void
    this.exited = new Promise((resolve) => (resolveExited = resolve))

    this.child = spawnFn(launch.executable, [...(launch.args ?? [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...launch.env },
      // the Windows helper is a console program; no window should flash
      windowsHide: true,
    })

    const stdout = new LineSplitter((length) =>
      this.logger.warn('capture.helper.line_too_long', { stream: 'stdout', length }),
    )
    const stderr = new LineSplitter((length) =>
      this.logger.warn('capture.helper.line_too_long', { stream: 'stderr', length }),
    )
    this.child.stdout?.setEncoding('utf8')
    this.child.stderr?.setEncoding('utf8')
    this.child.stdout?.on('data', (chunk: string) => stdout.push(chunk).forEach(this.handleLine))
    this.child.stderr?.on('data', (chunk: string) => stderr.push(chunk).forEach(this.handleStderr))
    // EPIPE when the helper dies while main writes; the exit path reports the real problem
    this.child.stdin?.on('error', (error) =>
      this.logger.warn('capture.helper.stdin_error', { message: error.message }),
    )

    const finish = (exit: HelperExit) => {
      if (this.exitInfo) return
      stdout.flush().forEach(this.handleLine)
      stderr.flush().forEach(this.handleStderr)
      this.exitInfo = exit
      const level = exit.code === 0 && (this.stoppedSeen || this.inputClosed) ? 'info' : 'warn'
      this.logger[level]('capture.helper.exit', { code: exit.code, signal: exit.signal })
      for (const listener of [...this.exitListeners]) listener(exit)
      resolveExited(exit)
    }
    // 'close' fires after stdio is drained, so every event is delivered before the exit
    this.child.on('close', (code, signal) => finish({ code, signal }))
    this.child.on('error', (error) => {
      // spawn failed (missing or non-executable binary); 'close' may never come
      this.logger.error('capture.helper.spawn_failed', { message: error.message })
      finish({ code: null, signal: null })
    })
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  get hasExited(): boolean {
    return this.exitInfo !== null
  }

  /** Every valid, known event. Returns unsubscribe. */
  onEvent(listener: HelperEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Called once when the process is gone (immediately if it already is). */
  onExit(listener: HelperExitListener): () => void {
    if (this.exitInfo) {
      listener(this.exitInfo)
      return () => {}
    }
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  send(command: HelperCommand): void {
    const line = encodeCommand(command)
    if (this.exitInfo || !this.child.stdin || this.child.stdin.destroyed) {
      throw new HelperExitError(this.exitInfo ?? { code: null, signal: null })
    }
    this.child.stdin.write(line)
  }

  /**
   * Resolves with the next event of `type`. Rejects on a fatal helper error, when the
   * process exits first, or after `timeoutMs` (the process is left running: the caller
   * decides whether to kill it). Call it before sending the command that triggers the event.
   */
  waitFor<T extends HelperEventType>(type: T, options: WaitOptions): Promise<HelperEventOf<T>> {
    return new Promise((resolve, reject) => {
      if (this.exitInfo) {
        reject(new HelperExitError(this.exitInfo, type))
        return
      }
      const cleanup = () => {
        clearTimeout(timer)
        offEvent()
        offExit()
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new HelperTimeoutError(type, options.timeoutMs))
      }, options.timeoutMs)
      const offEvent = this.onEvent((event) => {
        if (event.event === type) {
          cleanup()
          resolve(event as HelperEventOf<T>)
        } else if (event.event === 'error' && event.fatal) {
          cleanup()
          reject(new HelperFatalError(event.code, event.message))
        }
      })
      const offExit = this.onExit((exit) => {
        cleanup()
        reject(new HelperExitError(exit, type))
      })
    })
  }

  /**
   * Closes stdin and lets the helper exit by itself: EOF means `stop`, and a helper that never
   * started recording just exits 0 (A-08: after `listWindows`).
   */
  closeInput(): void {
    if (this.exitInfo) return
    this.inputClosed = true
    this.child.stdin?.end()
  }

  /** Closes stdin (the helper treats EOF as `stop`) and kills it if it is still running. */
  dispose(): void {
    if (this.exitInfo) return
    this.child.stdin?.end()
    this.child.kill()
  }

  private readonly handleLine = (line: string): void => {
    const parsed = parseEvent(line)
    if (!parsed.event) {
      if (parsed.unknownType !== undefined) {
        // forward compatibility: a newer helper may send events this build does not know
        this.logger.warn('capture.helper.unknown_event', { type: parsed.unknownType })
      } else {
        this.logger.warn('capture.helper.invalid_line', { reason: parsed.reason })
      }
      return
    }
    const event = parsed.event
    if (event.event === 'stopped') this.stoppedSeen = true
    if (event.event === 'error') {
      this.logger[event.fatal ? 'error' : 'warn']('capture.helper.error', {
        code: event.code,
        message: event.message,
        fatal: event.fatal,
      })
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch (error) {
        this.logger.error('capture.helper.listener_failed', { error })
      }
    }
  }

  private readonly handleStderr = (line: string): void => {
    this.logger.info('capture.helper.stderr', { line })
  }
}
