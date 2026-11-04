// whisper.cpp's JSON (`-oj -ojf`) → transcript.json (A-05). Pure, so it is tested in Node.
// The audio fed to whisper is already aligned to the video (speech-pcm.ts), so its times are
// video times; this only cleans them up.
import { z } from 'zod'
import {
  TRANSCRIPT_VERSION,
  type Transcript,
  type TranscriptSegment,
  type TranscriptWord,
} from './transcript.ts'

const Offsets = z.object({ from: z.number(), to: z.number() })

/** Only the parts Kamo reads; whisper writes much more (system info, params...). */
const WhisperJson = z.object({
  result: z.object({ language: z.string().optional() }).optional(),
  params: z.object({ language: z.string().optional() }).optional(),
  transcription: z.array(
    z.object({
      offsets: Offsets,
      text: z.string(),
      tokens: z.array(z.object({ text: z.string(), offsets: Offsets.optional() })).optional(),
    }),
  ),
})

export interface WhisperConversion {
  /** e.g. `whisper-base` */
  model: string
  /** ISO date */
  createdAt: string
  /** Video duration: nothing ends after it. */
  durationMs: number
  /** Used when whisper does not say which language it heard. */
  fallbackLanguage?: string
}

/** Languages written without spaces between words: each token is its own word. */
const NO_SPACE_LANGUAGES = new Set(['zh', 'ja', 'th', 'lo', 'my', 'km', 'yue'])

/**
 * Converts whisper.cpp's JSON. Drops what is not speech (`[BLANK_AUDIO]`, `(music)`, `♪`,
 * empty text), clamps every time to the video and keeps segments sorted. Throws when the
 * text is not whisper's JSON at all.
 */
export function transcriptFromWhisper(json: unknown, options: WhisperConversion): Transcript {
  const parsed = WhisperJson.parse(json)
  const detected = parsed.result?.language ?? parsed.params?.language
  const language =
    detected && detected !== 'auto' ? detected : (options.fallbackLanguage ?? 'unknown')
  const spaced = !NO_SPACE_LANGUAGES.has(language)
  const segments: TranscriptSegment[] = []
  for (const raw of parsed.transcription) {
    const text = cleanText(raw.text)
    if (!isSpeech(text)) continue
    const range = clampRange(raw.offsets.from, raw.offsets.to, options.durationMs)
    if (!range) continue
    const segment: TranscriptSegment = { ...range, text }
    const words = raw.tokens ? wordsFromTokens(raw.tokens, range, spaced) : []
    if (words.length > 0) segment.words = words
    segments.push(segment)
  }
  segments.sort((a, b) => a.startMs - b.startMs)
  return {
    version: TRANSCRIPT_VERSION,
    language,
    model: options.model,
    createdAt: options.createdAt,
    segments,
    edited: false,
  }
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Whisper's markers for silence, music and noise are not speech. */
const NON_SPEECH = /^(?:\[[^\]]*\]|\([^)]*\)|（[^）]*）|【[^】]*】|[♪♫\s*-])+$/u

export function isSpeech(text: string): boolean {
  return text !== '' && !NON_SPEECH.test(text) && /[\p{L}\p{N}]/u.test(text)
}

function clampRange(
  from: number,
  to: number,
  durationMs: number,
): { startMs: number; endMs: number } | null {
  const startMs = Math.max(0, Math.round(from))
  const endMs = Math.min(Math.max(0, Math.round(durationMs)), Math.round(to))
  return endMs > startMs ? { startMs, endMs } : null
}

interface Token {
  text: string
  offsets?: { from: number; to: number } | undefined
}

/**
 * Joins whisper's sub-word tokens into words: a token starting with a space starts a new
 * word (except in languages without spaces, where each token is a word); punctuation sticks
 * to the word before it. Special tokens (`[_BEG_]`, `[_TT_42]`) are skipped. A token cut in
 * the middle of a multi-byte character comes out as U+FFFD: words are then left out for that
 * segment rather than shown broken.
 */
function wordsFromTokens(
  tokens: readonly Token[],
  range: { startMs: number; endMs: number },
  spaced: boolean,
): TranscriptWord[] {
  const words: TranscriptWord[] = []
  for (const token of tokens) {
    if (token.text.startsWith('[_') || !token.offsets) continue
    if (token.text.includes('�')) return []
    const piece = token.text
    const trimmed = piece.trim()
    if (trimmed === '') continue
    // Inside the segment (which is already clamped to the video): a token after it is dropped.
    const startMs = Math.min(range.endMs, Math.max(range.startMs, Math.round(token.offsets.from)))
    const endMs = Math.min(range.endMs, Math.max(startMs, Math.round(token.offsets.to)))
    const last = words[words.length - 1]
    const punctuation = !/[\p{L}\p{N}]/u.test(trimmed)
    const startsWord = spaced ? /^\s/.test(piece) : true
    if (last && (punctuation || !startsWord)) {
      last.text += spaced ? piece.replace(/\s+/g, ' ') : trimmed
      last.endMs = Math.max(last.endMs, endMs)
      continue
    }
    if (startMs >= range.endMs) continue
    words.push({ startMs, endMs, text: trimmed })
  }
  return words
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text !== '')
}
