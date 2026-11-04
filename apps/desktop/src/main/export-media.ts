// Raw media for the export (F-11): the renderer decodes the recording with WebCodecs and
// reads its bytes through here, in ranges, instead of fetching kamo-media:// (which would
// need CORS and connect-src). Only the recording files, only inside the projects folder.
import { open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { resolveInProject } from './storage/paths.ts'

/** What the export reads: the screen and the two audio tracks (data-model.md). */
export const EXPORT_MEDIA_FILES = ['screen.mp4', 'audio.m4a', 'system.m4a', 'webcam.mp4'] as const
export type ExportMediaFile = (typeof EXPORT_MEDIA_FILES)[number]

/** Biggest single read; mediabunny asks for far less. */
export const MAX_MEDIA_READ_BYTES = 64 * 2 ** 20

export function isExportMediaFile(name: unknown): name is ExportMediaFile {
  return typeof name === 'string' && (EXPORT_MEDIA_FILES as readonly string[]).includes(name)
}

/** Extra project-relative names a caller allows (the smoke test reads its own exports). */
export type MediaAllowance = (name: string) => boolean

async function resolveMedia(
  root: string,
  projectId: string,
  name: unknown,
  allow?: MediaAllowance,
): Promise<string> {
  if (!isExportMediaFile(name) && !(typeof name === 'string' && allow?.(name))) {
    throw new TypeError('not an export media file')
  }
  const file = resolveInProject(root, projectId, name)
  // A link inside a project must not point outside the projects folder (like media.ts).
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)])
  const rel = relative(realRoot, realFile)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new TypeError('outside')
  return realFile
}

/** Size in bytes, or null when the project has no such file (e.g. no microphone). */
export async function mediaSize(
  root: string,
  projectId: string,
  name: unknown,
  allow?: MediaAllowance,
): Promise<number | null> {
  try {
    const file = await resolveMedia(root, projectId, name, allow)
    const stats = await stat(file)
    return stats.isFile() ? stats.size : null
  } catch (error) {
    if (error instanceof TypeError) throw error
    return null
  }
}

/** Bytes [start, end) of a project media file. */
export async function readMedia(
  root: string,
  projectId: string,
  name: unknown,
  start: unknown,
  end: unknown,
  allow?: MediaAllowance,
): Promise<Uint8Array> {
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start > MAX_MEDIA_READ_BYTES
  ) {
    throw new TypeError('invalid range')
  }
  const file = await resolveMedia(root, projectId, name as string, allow)
  const handle = await open(file, 'r')
  try {
    const buffer = new Uint8Array(end - start)
    let read = 0
    while (read < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, read, buffer.byteLength - read, start + read)
      if (bytesRead === 0) break
      read += bytesRead
    }
    return read === buffer.byteLength ? buffer : buffer.subarray(0, read)
  } finally {
    await handle.close()
  }
}
