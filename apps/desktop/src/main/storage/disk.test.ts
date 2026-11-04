import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { freeDiskSpace, hasEnoughSpace } from './disk.ts'

describe('freeDiskSpace', () => {
  it('returns the bytes available on the volume', async () => {
    const free = await freeDiskSpace(tmpdir())
    expect(Number.isFinite(free)).toBe(true)
    expect(free).toBeGreaterThan(0)
  })

  it('measures a folder that does not exist yet on its nearest parent', async () => {
    const missing = join(tmpdir(), 'kamo-missing', 'Kamo', 'projects')
    const [fromMissing, fromParent] = [await freeDiskSpace(missing), await freeDiskSpace(tmpdir())]
    // other processes write meanwhile; same volume means about the same number
    expect(Math.abs(fromMissing - fromParent)).toBeLessThan(100_000_000)
  })

  it('compares against the 1GB default or a custom minimum', async () => {
    expect(await hasEnoughSpace(tmpdir(), 1)).toBe(true)
    expect(await hasEnoughSpace(tmpdir(), Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})
