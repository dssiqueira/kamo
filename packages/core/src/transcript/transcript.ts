// transcript.json (A-05, docs/data-model.md → Transcript): what local transcription wrote,
// in video time. Captions (A-06), search and the MCP (M-01) read the same file.
import { z } from 'zod'

export const TRANSCRIPT_VERSION = 1

const nonNegative = z.number().nonnegative()

/** One word with its own timing (from whisper's tokens); optional, captions can highlight it. */
export const TranscriptWord = z.object({
  startMs: nonNegative,
  endMs: nonNegative,
  text: z.string().min(1),
})
export type TranscriptWord = z.infer<typeof TranscriptWord>

export const TranscriptSegment = z.object({
  startMs: nonNegative,
  endMs: nonNegative,
  text: z.string().min(1),
  words: z.array(TranscriptWord).optional(),
})
export type TranscriptSegment = z.infer<typeof TranscriptSegment>

export const Transcript = z.object({
  version: z.literal(TRANSCRIPT_VERSION),
  /** ISO 639-1 code detected by Whisper (or the one the user pinned), e.g. `pt`. */
  language: z.string().min(1),
  /** e.g. `whisper-base`. */
  model: z.string().min(1),
  createdAt: z.iso.datetime(),
  /** Sorted by startMs, in continuous video time (the audio offset already applied). */
  segments: z.array(TranscriptSegment),
  /** True once the user corrected it through the captions (A-06). */
  edited: z.boolean(),
})
export type Transcript = z.infer<typeof Transcript>

export function serializeTranscript(transcript: Transcript): string {
  return `${JSON.stringify(Transcript.parse(transcript), null, 2)}\n`
}

/** Null when the text is not a valid transcript (never throws). */
export function parseTranscript(text: string): Transcript | null {
  try {
    const result = Transcript.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
