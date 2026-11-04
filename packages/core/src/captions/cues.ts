// Caption cues (A-06): the transcript's segments cut into what fits on screen, with lines
// already broken. Pure, shared by the preview, the burned-in export and the .srt file, so
// all three show the same text at the same time (rule 11).
//
// Decisions:
// - Width is counted in units: a Latin letter, digit or space is 1, a CJK or full-width
//   character 2 (it is about twice as wide). One budget then works in every language.
// - Breaks go between words; in Chinese and Japanese (no spaces) between any two characters,
//   except before closing punctuation and small kana or after opening punctuation (kinsoku),
//   so a line never starts with "。" or ends with "「".
// - A segment longer than `maxLines` lines becomes several cues of about equal length, cut
//   preferably after punctuation. Each cue starts when its first word is spoken (from the
//   word timings); without them, the segment's time is shared out by width.
// - Cues never overlap: one ends at the latest when the next one starts.
import type { Transcript, TranscriptSegment } from '../transcript/transcript.ts'

export interface CaptionCue {
  /** video time, ms */
  startMs: number
  endMs: number
  /** the text as shown, line by line */
  lines: string[]
  /** index of the transcript segment it comes from */
  segment: number
}

export interface CueOptions {
  /** width budget of one line, in units (Latin letter 1, CJK character 2) */
  maxUnits: number
  /** lines per cue */
  maxLines: number
  /** keeps only what falls inside, clipped to it (the export's trim, F-16) */
  trim?: { startMs: number; endMs: number } | null
}

/** Cues shorter than this are dropped (a clip at the trim edge, a rounding leftover). */
export const MIN_CUE_MS = 100

/** Characters broken one by one: Han and kana (Hangul keeps its spaces). */
const SPLITTABLE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
/** Twice as wide as a Latin letter. */
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/u
/** Never at the start of a line: closing punctuation, small kana, prolonged sound mark. */
const NO_START =
  /[、。，．！？：；）」』】〉》〕”’…‥・ー々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ.,!?;:)\]}%]/u
/** Never at the end of a line: opening punctuation. */
const NO_END = /[（「『【〈《〔“‘([{]/u
/** A good place to end a cue or a line. */
const PUNCTUATION_END = /[.,!?;:…。，！？；：、]$/u

interface Token {
  text: string
  units: number
  /** a space follows (between words); false inside CJK text and after the last token */
  space: boolean
}

function charUnits(ch: string): number {
  return WIDE.test(ch) ? 2 : 1
}

function unitsOf(text: string): number {
  let units = 0
  for (const ch of text) units += charUnits(ch)
  return units
}

/** Words and, in CJK text, characters (with their attached punctuation). */
export function captionTokens(text: string): Token[] {
  const tokens: Token[] = []
  const words = text.split(/\s+/).filter((word) => word !== '')
  words.forEach((word, w) => {
    const chars = Array.from(word)
    let piece = chars[0] ?? ''
    for (let i = 1; i < chars.length; i++) {
      const a = chars[i - 1] as string
      const b = chars[i] as string
      const breakable =
        (SPLITTABLE.test(a) || SPLITTABLE.test(b)) && !NO_START.test(b) && !NO_END.test(a)
      if (breakable) {
        tokens.push({ text: piece, units: unitsOf(piece), space: false })
        piece = b
      } else {
        piece += b
      }
    }
    tokens.push({ text: piece, units: unitsOf(piece), space: w < words.length - 1 })
  })
  return tokens
}

/** Width of tokens [from, to) laid on one line. */
function widthOf(tokens: readonly Token[], from: number, to: number): number {
  let units = 0
  for (let i = from; i < to; i++) {
    const token = tokens[i] as Token
    units += token.units
    if (i < to - 1 && token.space) units += 1
  }
  return units
}

function joinTokens(tokens: readonly Token[], from: number, to: number): string {
  let text = ''
  for (let i = from; i < to; i++) {
    const token = tokens[i] as Token
    text += token.text
    if (i < to - 1 && token.space) text += ' '
  }
  return text
}

/** Greedy lines: as many tokens per line as fit (a token too wide gets a line of its own). */
function greedyBreaks(tokens: readonly Token[], from: number, to: number, maxUnits: number) {
  const breaks: number[] = []
  let start = from
  for (let i = from + 1; i <= to; i++) {
    if (i < to && widthOf(tokens, start, i + 1) <= maxUnits) continue
    if (i === to) break
    breaks.push(i)
    start = i
  }
  return breaks
}

/**
 * Line breaks for tokens [from, to): one line when it fits; two lines as balanced as
 * possible (a short last line reads badly), preferring a break after punctuation; more lines
 * greedily. Returns the token indexes where new lines start.
 */
function lineBreaks(
  tokens: readonly Token[],
  from: number,
  to: number,
  maxUnits: number,
): number[] {
  if (widthOf(tokens, from, to) <= maxUnits) return []
  const greedy = greedyBreaks(tokens, from, to, maxUnits)
  if (greedy.length !== 1) return greedy
  let best = greedy[0] as number
  let bestScore = Infinity
  for (let k = from + 1; k < to; k++) {
    const first = widthOf(tokens, from, k)
    const second = widthOf(tokens, k, to)
    if (first > maxUnits || second > maxUnits) continue
    const after = tokens[k - 1] as Token
    const score = Math.max(first, second) - (PUNCTUATION_END.test(after.text) ? maxUnits * 0.15 : 0)
    if (score < bestScore) {
      bestScore = score
      best = k
    }
  }
  return [best]
}

/** Lines of tokens [from, to). */
function wrap(tokens: readonly Token[], from: number, to: number, maxUnits: number): string[] {
  const starts = [from, ...lineBreaks(tokens, from, to, maxUnits), to]
  const lines: string[] = []
  for (let i = 0; i < starts.length - 1; i++) {
    lines.push(joinTokens(tokens, starts[i] as number, starts[i + 1] as number))
  }
  return lines
}

/** Wraps a text into lines of at most `maxUnits` (a word wider than that keeps its line). */
export function wrapCaption(text: string, maxUnits: number): string[] {
  const tokens = captionTokens(text)
  return tokens.length === 0 ? [] : wrap(tokens, 0, tokens.length, Math.max(1, maxUnits))
}

function fits(tokens: readonly Token[], from: number, to: number, o: CueOptions): boolean {
  return lineBreaks(tokens, from, to, o.maxUnits).length < o.maxLines
}

/**
 * Splits tokens into chunks that each fit in `maxLines` lines: as many chunks as greedy
 * filling needs, cut near equal widths (after punctuation when one is close).
 */
function chunkTokens(tokens: readonly Token[], o: CueOptions): number[] {
  const n = tokens.length
  if (n === 0 || fits(tokens, 0, n, o)) return [0, n]
  // Greedy: how many chunks are needed at least.
  const greedy = [0]
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i < n && fits(tokens, start, i + 1, o)) continue
    if (i === n) break
    greedy.push(i)
    start = i
  }
  greedy.push(n)
  const count = greedy.length - 1
  // Balanced: cut where the running width passes each k/count of the total.
  const total = widthOf(tokens, 0, n)
  const cuts = [0]
  for (let k = 1; k < count; k++) {
    const target = (total * k) / count
    const previous = cuts[cuts.length - 1] as number
    let best = -1
    let bestScore = Infinity
    for (let i = previous + 1; i < n; i++) {
      const distance = Math.abs(widthOf(tokens, 0, i) - target)
      const bonus = PUNCTUATION_END.test((tokens[i - 1] as Token).text) ? total / count / 3 : 0
      const score = distance - bonus
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best <= previous) return greedy
    cuts.push(best)
  }
  cuts.push(n)
  for (let k = 0; k < cuts.length - 1; k++) {
    if (!fits(tokens, cuts[k] as number, cuts[k + 1] as number, o)) return greedy
  }
  return cuts
}

/**
 * Char offset in `text` where each token starts (tokens come from `text` in order, so a
 * forward search finds them).
 */
function tokenOffsets(text: string, tokens: readonly Token[]): number[] {
  const offsets: number[] = []
  let cursor = 0
  for (const token of tokens) {
    const at = text.indexOf(token.text, cursor)
    offsets.push(at === -1 ? cursor : at)
    cursor = (at === -1 ? cursor : at) + token.text.length
  }
  return offsets
}

/**
 * Where each word starts in the text, with its start time; null when the words do not match
 * the text (e.g. edited without them), then times are shared out by width.
 */
function wordStarts(segment: TranscriptSegment): { offset: number; startMs: number }[] | null {
  const words = segment.words
  if (!words || words.length === 0) return null
  const starts: { offset: number; startMs: number }[] = []
  let cursor = 0
  for (const word of words) {
    const at = segment.text.indexOf(word.text, cursor)
    if (at === -1) return null
    starts.push({ offset: at, startMs: word.startMs })
    cursor = at + word.text.length
  }
  return starts
}

/** Start time of the chunk that begins at `offset` in the text. */
function chunkStart(
  segment: TranscriptSegment,
  starts: readonly { offset: number; startMs: number }[] | null,
  offset: number,
  unitsBefore: number,
  totalUnits: number,
): number {
  if (starts) {
    // The word that contains the chunk's first character, or the first one after it.
    let found: number | null = null
    for (let i = starts.length - 1; i >= 0; i--) {
      const start = starts[i] as { offset: number; startMs: number }
      if (start.offset <= offset) {
        found = start.startMs
        break
      }
    }
    if (found !== null) return clamp(found, segment.startMs, segment.endMs)
  }
  const span = segment.endMs - segment.startMs
  return segment.startMs + (totalUnits > 0 ? (span * unitsBefore) / totalUnits : 0)
}

/** The cues of one segment (several when it does not fit in `maxLines` lines). */
function segmentCues(segment: TranscriptSegment, index: number, o: CueOptions): CaptionCue[] {
  const tokens = captionTokens(segment.text)
  if (tokens.length === 0 || !(segment.endMs > segment.startMs)) return []
  const cuts = chunkTokens(tokens, o)
  const offsets = tokenOffsets(segment.text, tokens)
  const total = widthOf(tokens, 0, tokens.length)
  const words = wordStarts(segment)
  const starts = cuts
    .slice(0, -1)
    .map((cut) =>
      chunkStart(segment, words, offsets[cut] as number, widthOf(tokens, 0, cut), total),
    )
  // Word timings that do not move forward: share the time out by width instead.
  const monotonic = starts.every((s, i) => i === 0 || s > (starts[i - 1] as number))
  const times = monotonic
    ? starts
    : cuts.slice(0, -1).map((cut) => chunkStart(segment, null, 0, widthOf(tokens, 0, cut), total))
  const cues: CaptionCue[] = []
  for (let k = 0; k < cuts.length - 1; k++) {
    const startMs = k === 0 ? segment.startMs : (times[k] as number)
    const endMs = k === cuts.length - 2 ? segment.endMs : (times[k + 1] as number)
    cues.push({
      startMs,
      endMs,
      lines: wrap(tokens, cuts[k] as number, cuts[k + 1] as number, o.maxUnits),
      segment: index,
    })
  }
  return cues
}

/**
 * The cues of a transcript: each segment wrapped into at most `maxLines` lines of
 * `maxUnits`, split into several cues when longer, sorted and never overlapping. With
 * `trim`, only what is inside it, clipped to its edges (still in video time).
 */
export function captionCues(
  transcript: Pick<Transcript, 'segments'>,
  options: CueOptions,
): CaptionCue[] {
  const o: CueOptions = {
    ...options,
    maxUnits: Math.max(1, Math.floor(options.maxUnits)),
    maxLines: Math.max(1, Math.floor(options.maxLines)),
  }
  const all = transcript.segments
    .flatMap((segment, index) => segmentCues(segment, index, o))
    .sort((a, b) => a.startMs - b.startMs)
  const cues: CaptionCue[] = []
  for (let i = 0; i < all.length; i++) {
    const cue = all[i] as CaptionCue
    const next = all[i + 1]
    let { startMs, endMs } = cue
    if (next && endMs > next.startMs) endMs = next.startMs
    if (o.trim) {
      startMs = Math.max(startMs, o.trim.startMs)
      endMs = Math.min(endMs, o.trim.endMs)
    }
    if (endMs - startMs < MIN_CUE_MS) continue
    cues.push({ ...cue, startMs, endMs })
  }
  return cues
}

/** `HH:MM:SS,mmm` (SubRip). */
export function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor(total / 60_000) % 60
  const s = Math.floor(total / 1000) % 60
  const milli = total % 1000
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(h)}:${two(m)}:${two(s)},${String(milli).padStart(3, '0')}`
}

/**
 * A SubRip (.srt) file of the cues, times measured from `originMs` (the trim start, so it
 * lines up with the exported video, which starts at 0). UTF-8, one blank line between cues.
 */
export function toSrt(cues: readonly CaptionCue[], originMs = 0): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${srtTimestamp(cue.startMs - originMs)} --> ${srtTimestamp(cue.endMs - originMs)}\n${cue.lines.join('\n')}\n`,
    )
    .join('\n')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
