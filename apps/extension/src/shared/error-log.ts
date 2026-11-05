// The extension's local error log for "Copy diagnostics" (F-17). No telemetry (rule 3): the last
// errors stay in chrome.storage.session (memory only, gone when the browser closes) and leave
// only if the user copies them. Technical events only: never page content. Messages lose every
// URL (a tab's address is browsing history) and user folder, and are cut short.

/** chrome.storage.session key. */
export const ERROR_LOG_KEY = 'kamo.errors'
/** A small ring buffer: enough to see what went wrong, little enough to read at a glance. */
export const MAX_ERROR_ENTRIES = 50
const MAX_MESSAGE_LENGTH = 300

/** One line, shaped like the desktop log's (`{"t","level","event",...}`). */
export interface ErrorEntry {
  /** ISO 8601 */
  t: string
  level: 'error'
  /** What failed, e.g. `recording.failed` or `page.error`. */
  event: string
  /** Which part of the extension: `service-worker`, `popup`, `editor`… */
  where: string
  /** Technical, redacted; absent when there is nothing useful to say. */
  message?: string
}

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]*/gi
const DATA_URL_PATTERN = /\bdata:[^\s"'<>)]*/gi
const HOME_PATTERNS = [/[a-z]:\\users\\[^\\\s"']+/gi, /\/Users\/[^/\s"']+/g, /\/home\/[^/\s"']+/g]

/** Strips URLs and home folders, flattens lines and cuts it short. */
export function redactMessage(text: string): string {
  let result = text.replace(URL_PATTERN, '<url>').replace(DATA_URL_PATTERN, '<data>')
  for (const pattern of HOME_PATTERNS) result = result.replace(pattern, '<home>')
  result = result.replace(/\s+/g, ' ').trim()
  return result.length > MAX_MESSAGE_LENGTH ? `${result.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : result
}

/** The message of anything thrown (Error, DOMException, string…), redacted; '' when none. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactMessage(
      error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message,
    )
  }
  if (typeof error === 'string') return redactMessage(error)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return redactMessage(String((error as { message: unknown }).message))
  }
  return ''
}

export function errorEntry(
  event: string,
  where: string,
  error: unknown,
  now = new Date(),
): ErrorEntry {
  const message = errorMessage(error)
  return {
    t: now.toISOString(),
    level: 'error',
    event: redactMessage(event),
    where: redactMessage(where),
    ...(message ? { message } : {}),
  }
}

/** Appends, keeping the newest MAX_ERROR_ENTRIES. Anything malformed in storage is dropped. */
export function appendEntry(stored: unknown, entry: ErrorEntry): ErrorEntry[] {
  const list = Array.isArray(stored) ? stored.filter(isEntry) : []
  return [...list, entry].slice(-MAX_ERROR_ENTRIES)
}

function isEntry(value: unknown): value is ErrorEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ErrorEntry).t === 'string' &&
    typeof (value as ErrorEntry).event === 'string'
  )
}

/** The lines as the diagnostics show them (one JSON object per line, like the desktop log). */
export function formatEntries(entries: readonly ErrorEntry[]): string[] {
  return entries.map((entry) => JSON.stringify(entry))
}

// ---------------------------------------------------------------------------------------------
// chrome.storage.session side. Logging must never break anything: nothing here throws.

let queue: Promise<unknown> = Promise.resolve()

/** Keeps one error. Writes are serialized within this context. */
export function recordError(event: string, where: string, error?: unknown): Promise<void> {
  const write = queue.then(async () => {
    const session = globalThis.chrome?.storage?.session
    if (!session) return
    const stored = (await session.get(ERROR_LOG_KEY))[ERROR_LOG_KEY]
    await session.set({ [ERROR_LOG_KEY]: appendEntry(stored, errorEntry(event, where, error)) })
  })
  queue = write.catch(() => undefined)
  return queue as Promise<void>
}

/** The kept errors, oldest first; [] when there are none or storage is out of reach. */
export async function readErrors(): Promise<ErrorEntry[]> {
  try {
    const stored = (await chrome.storage.session.get(ERROR_LOG_KEY))[ERROR_LOG_KEY]
    return Array.isArray(stored) ? stored.filter(isEntry) : []
  } catch {
    return []
  }
}

/** Uncaught errors and rejections of this page or worker go to the log. */
export function installErrorLog(where: string): void {
  globalThis.addEventListener?.('error', (event: ErrorEvent) => {
    void recordError('uncaught.error', where, event.error ?? event.message)
  })
  globalThis.addEventListener?.('unhandledrejection', (event: PromiseRejectionEvent) => {
    void recordError('uncaught.rejection', where, event.reason)
  })
}
