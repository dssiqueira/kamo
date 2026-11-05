// Is a recorded file worth keeping? The camera and the audio are streamed to disk in 1s
// MediaRecorder chunks by hidden pages; when a page reloads, crashes or stops answering, the
// file just ends where the last chunk did. That is still a good file when it has complete
// fragments, and junk when it is only the header (a 757-byte webcam.mp4 with no frame).
// Nothing is attached to a project, at the end of a recording or by recovery, unless it
// passes `checkRecordedMedia`.
import { open, stat, truncate } from 'node:fs/promises'

/** Below this, a file cannot hold a header plus a single frame of audio or video. */
export const MIN_MEDIA_BYTES = 1024

/**
 * Length of the playable prefix of a (fragmented) MP4: up to the end of the last complete
 * top-level box, where a `moof` only counts together with a complete `mdat` after it. A crash
 * cuts the file inside the last fragment; everything before it is intact. 0 when the header
 * (`moov`) itself is incomplete.
 */
export async function playableMp4Length(path: string): Promise<number> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    const header = Buffer.alloc(16)
    let offset = 0
    let playable = 0
    let hasMoov = false
    let pendingMoof = false
    while (offset + 8 <= size) {
      const { bytesRead } = await handle.read(header, 0, 16, offset)
      if (bytesRead < 8) break
      let boxSize = header.readUInt32BE(0)
      const type = header.toString('latin1', 4, 8)
      if (boxSize === 1) {
        if (bytesRead < 16) break
        boxSize = Number(header.readBigUInt64BE(8))
      } else if (boxSize === 0) {
        // "extends to the end of the file": nothing tells where it really ends
        boxSize = size - offset
      }
      if (boxSize < 8 || offset + boxSize > size) break
      offset += boxSize
      if (type === 'moov') hasMoov = true
      if (type === 'moof') {
        pendingMoof = true
        continue
      }
      if (type === 'mdat') pendingMoof = false
      if (!pendingMoof) playable = offset
    }
    return hasMoov ? playable : 0
  } finally {
    await handle.close()
  }
}

export type MediaKind = 'audio' | 'video'

export interface MediaCheck {
  /** Bytes kept (the file was cut to this when it ended inside a fragment). */
  bytes: number
  durationMs: number
}

/** MediaRecorder's MP4 (`video/mp4…`, `audio/mp4…`) rather than its WebM fallback. */
export function isMp4MimeType(mimeType: string): boolean {
  return /^(audio|video)\/mp4\b/.test(mimeType)
}

/** Reads the first `length` bytes as media: the duration of its first `kind` track, or null. */
async function probeTrack(path: string, length: number, kind: MediaKind): Promise<number | null> {
  // Loaded on first use: mediabunny is most of the main bundle and startup never needs it.
  const { ALL_FORMATS, CustomSource, Input } = await import('mediabunny')
  const handle = await open(path, 'r')
  const input = new Input({
    source: new CustomSource({
      getSize: () => length,
      read: async (start, end) => {
        const buffer = new Uint8Array(end - start)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
        return buffer.subarray(0, bytesRead)
      },
    }),
    formats: ALL_FORMATS,
  })
  try {
    const track =
      kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack()
    if (!track) return null
    const first = await track.getFirstTimestamp()
    const end = await track.computeDuration()
    const stats = await track.computePacketStats(10)
    const durationMs = Math.round((end - Math.max(0, first)) * 1000)
    return durationMs > 0 && stats.packetCount > 0 ? durationMs : null
  } catch {
    return null
  } finally {
    input.dispose()
    await handle.close()
  }
}

/**
 * Whether a recorded file holds a `kind` track that plays for more than 0ms. An MP4 cut inside
 * its last fragment is truncated to the complete ones first (the file on disk changes). Null
 * when the file is missing, too small or unreadable: the caller leaves it out and warns.
 */
export async function checkRecordedMedia(
  path: string,
  mimeType: string,
  kind: MediaKind,
): Promise<MediaCheck | null> {
  const size = await stat(path).then(
    (info) => (info.isFile() ? info.size : 0),
    () => 0,
  )
  if (size < MIN_MEDIA_BYTES) return null
  const length = isMp4MimeType(mimeType) ? await playableMp4Length(path).catch(() => 0) : size
  if (length < MIN_MEDIA_BYTES) return null
  const durationMs = await probeTrack(path, length, kind)
  if (durationMs === null) return null
  if (length < size) await truncate(path, length)
  return { bytes: length, durationMs }
}
