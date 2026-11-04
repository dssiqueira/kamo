// Free disk space checks for F-02: warn before recording when less than 1GB is free.
import { statfs } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const MIN_FREE_BYTES = 1_000_000_000

/**
 * Bytes available to the current user on the volume holding `dir`. The projects folder is
 * created lazily, so a missing folder is measured on its nearest existing parent.
 */
export async function freeDiskSpace(dir: string): Promise<number> {
  let current = resolve(dir)
  for (;;) {
    try {
      const stats = await statfs(current)
      return stats.bavail * stats.bsize
    } catch (error) {
      const parent = dirname(current)
      const code = (error as { code?: string }).code
      if ((code !== 'ENOENT' && code !== 'ENOTDIR') || parent === current) throw error
      current = parent
    }
  }
}

export async function hasEnoughSpace(dir: string, minBytes = MIN_FREE_BYTES): Promise<boolean> {
  return (await freeDiskSpace(dir)) >= minBytes
}
