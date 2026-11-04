// Caption edits on the timeline (A-06): they correct transcript.json itself, so search and the
// local MCP read the fixed text too. Same contract as the project edits: pure, the result
// still passes the Transcript schema, `edited` turns true, and the same reference comes back
// when nothing changes (unknown index, no room), so callers skip the undo step.
//
// Segments stay sorted and never overlap, so a segment is addressed by its index and a drag
// never reorders them.
import type { ZoomEdge } from '../edit/zooms.ts'
import type { Transcript, TranscriptSegment, TranscriptWord } from '../transcript/transcript.ts'

/** Shortest caption a resize leaves (shorter ones flash by unread). */
export const MIN_CAPTION_MS = 300

function withSegments(transcript: Transcript, segments: TranscriptSegment[]): Transcript {
  return { ...transcript, segments, edited: true }
}

function replaceAt(
  transcript: Transcript,
  index: number,
  segment: TranscriptSegment | null,
): Transcript {
  const segments = [...transcript.segments]
  if (segment) segments[index] = segment
  else segments.splice(index, 1)
  return withSegments(transcript, segments)
}

/** Room a segment may use: from the previous one's end to the next one's start. */
function room(transcript: Transcript, index: number, durationMs: number) {
  const previous = transcript.segments[index - 1]
  const next = transcript.segments[index + 1]
  return {
    min: previous ? previous.endMs : 0,
    max: next ? next.startMs : Math.max(durationMs, transcript.segments[index]?.endMs ?? 0),
  }
}

/**
 * New text for a caption, trimmed and on one line. Empty deletes it. The word timings go when
 * the text changes (they no longer match); timing then comes from the segment alone.
 */
export function setCaptionText(transcript: Transcript, index: number, text: string): Transcript {
  const segment = transcript.segments[index]
  if (!segment) return transcript
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean === segment.text) return transcript
  if (clean === '') return replaceAt(transcript, index, null)
  const { words: _words, ...rest } = segment
  return replaceAt(transcript, index, { ...rest, text: clean })
}

export function deleteCaption(transcript: Transcript, index: number): Transcript {
  if (!transcript.segments[index]) return transcript
  return replaceAt(transcript, index, null)
}

/** Moves a caption by `deltaMs`, between its neighbours and inside the video. */
export function moveCaption(
  transcript: Transcript,
  index: number,
  deltaMs: number,
  durationMs: number,
): Transcript {
  const segment = transcript.segments[index]
  if (!segment || !Number.isFinite(deltaMs)) return transcript
  const { min, max } = room(transcript, index, durationMs)
  const length = segment.endMs - segment.startMs
  const startMs = Math.round(clamp(segment.startMs + deltaMs, min, Math.max(min, max - length)))
  const shift = startMs - segment.startMs
  if (shift === 0) return transcript
  return replaceAt(transcript, index, {
    ...segment,
    startMs,
    endMs: startMs + length,
    ...(segment.words ? { words: segment.words.map((w) => shiftWord(w, shift)) } : {}),
  })
}

/**
 * Moves one edge of a caption by `deltaMs`, keeping it at least MIN_CAPTION_MS long and
 * between its neighbours. Word timings stretch with it.
 */
export function resizeCaption(
  transcript: Transcript,
  index: number,
  edge: ZoomEdge,
  deltaMs: number,
  durationMs: number,
): Transcript {
  const segment = transcript.segments[index]
  if (!segment || !Number.isFinite(deltaMs)) return transcript
  const { min, max } = room(transcript, index, durationMs)
  let { startMs, endMs } = segment
  if (edge === 'start') {
    startMs = Math.round(clamp(startMs + deltaMs, min, endMs - MIN_CAPTION_MS))
  } else {
    endMs = Math.round(clamp(endMs + deltaMs, startMs + MIN_CAPTION_MS, max))
  }
  // No room for the minimum length: leave it as it is.
  if (
    startMs < min ||
    endMs > max ||
    endMs - startMs < Math.min(MIN_CAPTION_MS, segment.endMs - segment.startMs)
  ) {
    return transcript
  }
  if (startMs === segment.startMs && endMs === segment.endMs) return transcript
  const from = { startMs: segment.startMs, endMs: segment.endMs }
  return replaceAt(transcript, index, {
    ...segment,
    startMs,
    endMs,
    ...(segment.words
      ? { words: segment.words.map((w) => stretchWord(w, from, { startMs, endMs })) }
      : {}),
  })
}

function shiftWord(word: TranscriptWord, shift: number): TranscriptWord {
  return { ...word, startMs: word.startMs + shift, endMs: word.endMs + shift }
}

function stretchWord(
  word: TranscriptWord,
  from: { startMs: number; endMs: number },
  to: { startMs: number; endMs: number },
): TranscriptWord {
  const span = from.endMs - from.startMs
  const map = (t: number) =>
    span > 0
      ? Math.round(to.startMs + ((t - from.startMs) * (to.endMs - to.startMs)) / span)
      : to.startMs
  const startMs = clamp(map(word.startMs), to.startMs, to.endMs)
  return {
    ...word,
    startMs,
    endMs: Math.max(startMs, clamp(map(word.endMs), to.startMs, to.endMs)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
