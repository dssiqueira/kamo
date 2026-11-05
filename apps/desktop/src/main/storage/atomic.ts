// Atomic file writes shared by the project store and the app settings.
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, rename, rm, stat } from 'node:fs/promises'
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

// Recordings, transcripts, click logs and settings are private: on Mac and Linux the folders
// Kamo creates are 0700 and its files 0600, whatever the umask, so another account on the same
// computer cannot read them. Windows ignores these modes (profile ACLs already do this).
export const PRIVATE_DIR_MODE = 0o700
export const PRIVATE_FILE_MODE = 0o600

/**
 * Creates the folder (and missing parents) as 0700. An existing folder owned by this user
 * that others can open is tightened to 0700; one owned by someone else is left as it is.
 * Only the folder's own mode changes, never what is inside. No-op beyond mkdir on Windows.
 */
export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE })
  if (process.platform === 'win32') return
  const info = await stat(dir)
  if (info.uid === process.getuid?.() && (info.mode & 0o077) !== 0) {
    // Some volumes (exFAT, network shares) refuse chmod: recording there must still work.
    await chmod(dir, PRIVATE_DIR_MODE).catch(() => {})
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
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE })
  const temp = join(dir, `.${basename(file)}.${randomUUID()}.tmp`)
  try {
    const handle = await open(temp, 'w', PRIVATE_FILE_MODE)
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
