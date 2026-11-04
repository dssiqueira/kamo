// The recording marker (`recording.lock`) of the extension. Same name and role as the
// desktop's: present while recording, removed once project.json is saved. The extension
// keeps everything recovery needs in it, rewritten every 5s with the recorded time, so an
// interrupted recording can become a project without decoding the video.
import type { Source } from '@kamo/core'

export interface RecordingMarker {
  /** ISO date of the first recorded frame. */
  startedAt: string
  /** Default project name, already translated when the recording started. */
  name: string
  source: Source
  /** Recorded time (pauses excluded) at the last heartbeat. */
  durationMs: number
  audio: { mic: boolean; system: boolean; micOffsetMs?: number }
  /** The webcam file (`webcam.mp4`, or `webcam.webm` in a browser without MP4) and its offset. */
  webcam?: { file: string; offsetMs: number }
}

/**
 * Reads a marker without the engine (the popup lists interrupted recordings with it).
 * `null` when it is not a marker this version wrote; recovery validates the project for real.
 */
export function parseMarker(text: string): RecordingMarker | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const marker = raw as Partial<RecordingMarker>
  const valid =
    typeof marker.startedAt === 'string' &&
    !Number.isNaN(Date.parse(marker.startedAt)) &&
    typeof marker.name === 'string' &&
    typeof marker.durationMs === 'number' &&
    typeof marker.source === 'object' &&
    marker.source !== null &&
    typeof marker.audio === 'object' &&
    marker.audio !== null
  return valid ? (marker as RecordingMarker) : null
}

export function serializeMarker(marker: RecordingMarker): string {
  return JSON.stringify(marker)
}
