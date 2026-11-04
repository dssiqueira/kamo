// events.jsonl: one mouse event per line (docs/data-model.md). Mouse only, never keyboard
// (rule 2, D-003): the schema has no way to express a key.
import { z } from 'zod'

export const MouseButton = z.enum(['left', 'right', 'middle'])
export type MouseButton = z.infer<typeof MouseButton>

const base = {
  /** ms since the start of the recording, with pauses removed */
  t: z.number().nonnegative(),
  /** pixels of the recorded video */
  x: z.number(),
  y: z.number(),
}

export const MouseEventRecord = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('move'),
    /** pointer is outside the recorded area (another display); the camera ignores it */
    outside: z.literal(true).optional(),
  }),
  z.strictObject({ ...base, type: z.literal('down'), button: MouseButton }),
  z.strictObject({ ...base, type: z.literal('up'), button: MouseButton }),
  z.strictObject({ ...base, type: z.literal('scroll'), dx: z.number(), dy: z.number() }),
])
export type MouseEventRecord = z.infer<typeof MouseEventRecord>

export interface ParsedEvents {
  /** valid events, sorted by `t` (stable) */
  events: MouseEventRecord[]
  /** 1-based line numbers that were skipped (invalid or truncated) */
  skippedLines: number[]
}

/**
 * Parses an events.jsonl file. Tolerant on purpose: a crash mid-recording can leave a
 * truncated last line, and one bad line must not lose the whole recording.
 */
export function parseEvents(text: string): ParsedEvents {
  const events: MouseEventRecord[] = []
  const skippedLines: number[] = []
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const event = parseLine(trimmed)
    if (event) events.push(event)
    else skippedLines.push(index + 1)
  })
  // Array#sort is stable, so events with the same `t` keep their file order.
  return { events: events.sort((a, b) => a.t - b.t), skippedLines }
}

/** Streams events from a large file without holding all the text in memory. */
export async function* readEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<MouseEventRecord> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const event = line.trim() ? parseLine(line) : null
      if (event) yield event
    }
  }
  const last = buffer.trim() ? parseLine(buffer) : null
  if (last) yield last
}

export function formatEvent(event: MouseEventRecord): string {
  return `${JSON.stringify(MouseEventRecord.parse(event))}\n`
}

export function formatEvents(events: readonly MouseEventRecord[]): string {
  return events.map(formatEvent).join('')
}

function parseLine(line: string): MouseEventRecord | null {
  try {
    const result = MouseEventRecord.safeParse(JSON.parse(line))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
