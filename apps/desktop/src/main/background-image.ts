// Wallpaper with your own image (A-04): the picked file is checked and COPIED into the project
// folder, so the project keeps working when the original is moved or deleted. The copy is
// named after a hash of its bytes (`background-<hash>.<ext>`, core background-image.ts).
import { createHash, randomUUID } from 'node:crypto'
import { open, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_BACKGROUND_IMAGE_BYTES,
  backgroundImageName,
  isBackgroundImageFile,
  sniffImageType,
} from '@kamo/core'
import { renameWithRetry, syncDirectory } from './storage/atomic.ts'

export type BackgroundImageCode = 'image_unsupported' | 'image_too_big' | 'image_unreadable'

export class BackgroundImageError extends Error {
  constructor(readonly code: BackgroundImageCode) {
    super(code)
    this.name = 'BackgroundImageError'
  }
}

/** What the native dialog offers. The bytes decide, not the extension. */
export const BACKGROUND_IMAGE_FILTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

/**
 * Copies the image at `sourcePath` into `projectDir` and returns its project-relative name.
 * - not a PNG, JPEG or WebP by its magic bytes → `image_unsupported`
 * - bigger than 25 MB → `image_too_big`
 * - not a readable file → `image_unreadable`
 * The copy is atomic (temp file + rename). Picking the same image again reuses the file.
 * Earlier images stay until the project is opened again (pruneBackgroundImages), so undo
 * can go back to them in this session.
 */
export async function importBackgroundImage(
  projectDir: string,
  sourcePath: string,
): Promise<string> {
  let bytes: Buffer
  try {
    const info = await stat(sourcePath)
    if (!info.isFile()) throw new BackgroundImageError('image_unreadable')
    if (info.size > MAX_BACKGROUND_IMAGE_BYTES) throw new BackgroundImageError('image_too_big')
    if (info.size === 0) throw new BackgroundImageError('image_unsupported')
    const handle = await open(sourcePath, 'r')
    try {
      // Read at most one byte past the limit: the file may have grown since stat.
      const buffer = Buffer.alloc(Math.min(info.size, MAX_BACKGROUND_IMAGE_BYTES) + 1)
      let read = 0
      while (read < buffer.length) {
        const { bytesRead } = await handle.read(buffer, read, buffer.length - read, read)
        if (bytesRead === 0) break
        read += bytesRead
      }
      bytes = buffer.subarray(0, read)
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof BackgroundImageError) throw error
    throw new BackgroundImageError('image_unreadable')
  }
  if (bytes.length > MAX_BACKGROUND_IMAGE_BYTES) throw new BackgroundImageError('image_too_big')
  const type = sniffImageType(bytes)
  if (!type) throw new BackgroundImageError('image_unsupported')

  const name = backgroundImageName(type, createHash('sha256').update(bytes).digest('hex'))
  const target = join(projectDir, name)
  const existing = await stat(target).catch(() => null)
  if (existing?.isFile() && existing.size === bytes.length) return name

  const temp = join(projectDir, `.${name}.${randomUUID()}.tmp`)
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await renameWithRetry(temp, target)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
  await syncDirectory(projectDir)
  return name
}

/**
 * Deletes the background images of a project except `keep` (the one project.json uses).
 * Runs when the editor opens a project: images replaced in an earlier session are gone for
 * good, the current one stays.
 */
export async function pruneBackgroundImages(
  projectDir: string,
  keep: string | null,
): Promise<string[]> {
  const names = await readdir(projectDir).catch(() => [] as string[])
  const removed: string[] = []
  for (const name of names) {
    if (name === keep || !isBackgroundImageFile(name)) continue
    await rm(join(projectDir, name), { force: true })
      .then(() => removed.push(name))
      .catch(() => {})
  }
  return removed
}
