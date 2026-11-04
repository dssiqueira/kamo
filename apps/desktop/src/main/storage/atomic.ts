// Atomic file writes shared by the project store and the app settings.
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

// Windows: antivirus, the indexer or a preview handler can hold a file for a moment and make
// rename fail with EPERM/EBUSY/EACCES. Retry briefly (about 1s in total) before giving up.
const RENAME_RETRIES = 10

export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = errorCode(error)
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transient || attempt >= RENAME_RETRIES) throw error
      await sleep(10 * (attempt + 1))
    }
  }
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

/** POSIX: fsync the folder so the rename itself survives a power loss. No-op on Windows. */
export async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(dir, 'r')
  try {
    await handle.sync()
  } catch {
    // some file systems do not support fsync on folders; the rename is still atomic
  } finally {
    await handle.close()
  }
}

/**
 * Atomic replace: write a temp file in the same folder, fsync it, then rename it over the
 * target. Rename within a folder is atomic on NTFS, APFS and ext4, so readers see either
 * the old file or the new one, never half of it. Creates the folder if needed.
 */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  const dir = dirname(file)
  await mkdir(dir, { recursive: true })
  const temp = join(dir, `.${basename(file)}.${randomUUID()}.tmp`)
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await renameWithRetry(temp, file)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
  await syncDirectory(dir)
}
