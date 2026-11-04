// Runs the transcription pack's whisper.cpp CLI (A-05) as a low-priority child process, so the
// app, the editor and the export keep running at full speed.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import type { TranscriptionLanguage } from '../../shared/packs.ts'

export interface WhisperArgsOptions {
  /** Paths relative to the working directory (see `relativeForWhisper`). */
  model: string
  wav: string
  /** Output name without extension: whisper writes `<outBase>.json`. */
  outBase: string
  language: TranscriptionLanguage
  threads: number
}

/**
 * whisper-cli arguments: JSON with token timings (`-oj -ojf`), progress on stderr (`-pp`),
 * automatic language detection unless the user pinned one.
 */
export function whisperArgs(options: WhisperArgsOptions): string[] {
  return [
    '-m',
    options.model,
    '-f',
    options.wav,
    '-l',
    options.language,
    '-t',
    String(Math.max(1, Math.floor(options.threads))),
    '-oj',
    '-ojf',
    '-of',
    options.outBase,
    '-pp',
  ]
}

/** Half the cores (at least 1, at most 8): fast enough, and the computer stays usable. */
export function whisperThreads(cpuCount: number): number {
  return Math.min(8, Math.max(1, Math.floor(cpuCount / 2)))
}

/** `whisper_print_progress_callback: progress =  42%` → 0.42; null for any other line. */
export function parseWhisperProgress(line: string): number | null {
  const match = /progress\s*=\s*(\d{1,3})\s*%/.exec(line)
  if (!match) return null
  return Math.min(100, Number(match[1])) / 100
}

/**
 * whisper.cpp opens files with narrow-char APIs on Windows, so a path with non-ASCII letters
 * (a user folder named "João") would fail. It runs with the app-data folder as its working
 * directory and gets paths relative to it, which are plain ASCII under Kamo's own folders.
 */
export function relativeForWhisper(cwd: string, path: string, sep = '/'): string {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = normalize(cwd)
  const target = normalize(path)
  const lower = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  if (!lower(target).startsWith(`${lower(base)}/`)) return path
  return target
    .slice(base.length + 1)
    .split('/')
    .join(sep)
}

export interface WhisperCommand {
  command: string
  prefix: string[]
  env: NodeJS.ProcessEnv
}

/**
 * The program to start. Unpackaged builds also accept a `.mjs` entry, run with Electron as
 * Node: the fake pack the tests and local checks use (no real whisper binary needed).
 */
export function whisperCommand(
  entry: string,
  options: { allowScripts: boolean; execPath: string; env: NodeJS.ProcessEnv },
): WhisperCommand {
  if (options.allowScripts && /\.m?js$/.test(entry)) {
    return {
      command: options.execPath,
      prefix: [entry],
      env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
    }
  }
  return { command: entry, prefix: [], env: options.env }
}

export class WhisperError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message)
    this.name = 'WhisperError'
  }
}

export type SpawnLike = (command: string, args: string[], options: SpawnOptions) => ChildProcess

export interface RunWhisperOptions {
  command: WhisperCommand
  args: string[]
  cwd: string
  signal: AbortSignal
  onProgress(fraction: number): void
  spawn?: SpawnLike
}

/** Resolves when whisper exits 0; an abort kills it and rejects with the abort reason. */
export function runWhisper(options: RunWhisperOptions): Promise<void> {
  const { signal } = options
  signal.throwIfAborted()
  const spawn = options.spawn ?? nodeSpawn
  return new Promise<void>((resolve, reject) => {
    const child = spawn(options.command.command, [...options.command.prefix, ...options.args], {
      cwd: options.cwd,
      env: options.command.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // not allowed on this system: it still runs, at normal priority
      }
    }
    let tail = ''
    let pending = ''
    const onStderr = (chunk: Buffer) => {
      const text = pending + chunk.toString('utf8')
      const lines = text.split(/\r?\n|\r/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const progress = parseWhisperProgress(line)
        if (progress !== null) options.onProgress(progress)
      }
      tail = (tail + chunk.toString('utf8')).slice(-2000)
    }
    child.stderr?.on('data', onStderr)
    // stdout carries the transcript as text too; read and dropped so the pipe never fills.
    child.stdout?.on('data', () => {})
    const onAbort = () => child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    child.once('error', (error) => {
      signal.removeEventListener('abort', onAbort)
      reject(new WhisperError(`whisper could not start: ${error.message}`, tail))
    })
    child.once('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(signal.reason)
      else if (code === 0) resolve()
      else reject(new WhisperError(`whisper exited with ${code}`, tail))
    })
  })
}
