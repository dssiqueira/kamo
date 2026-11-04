import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { helperCandidates, resolveHelperPath } from './helper-path.ts'

const base = { resourcesPath: join('R', 'resources'), appPath: join('A', 'desktop') }

describe('resolveHelperPath', () => {
  it('uses resources/helpers/<os>/ when packaged', () => {
    const win = { ...base, packaged: true, platform: 'win32' as const }
    const mac = { ...base, packaged: true, platform: 'darwin' as const }
    expect(resolveHelperPath({ ...win, isFile: () => true })).toBe(
      join('R', 'resources', 'helpers', 'win', 'kamo-capture.exe'),
    )
    expect(resolveHelperPath({ ...mac, isFile: () => true })).toBe(
      join('R', 'resources', 'helpers', 'mac', 'kamo-capture'),
    )
  })

  it('looks in native/<os>/build in development, release before debug', () => {
    const win = { ...base, packaged: false, platform: 'win32' as const }
    expect(helperCandidates(win)).toEqual([
      join('A', 'desktop', 'native', 'win', 'build', 'release', 'kamo-capture.exe'),
      join('A', 'desktop', 'native', 'win', 'build', 'debug', 'kamo-capture.exe'),
    ])
    const debugOnly = (path: string) => path.includes(join('build', 'debug'))
    expect(
      resolveHelperPath({ ...base, packaged: false, platform: 'darwin', isFile: debugOnly }),
    ).toBe(join('A', 'desktop', 'native', 'mac', 'build', 'debug', 'kamo-capture'))
  })

  it('returns null when the helper is missing or the OS is unsupported', () => {
    expect(
      resolveHelperPath({ ...base, packaged: true, platform: 'win32', isFile: () => false }),
    ).toBeNull()
    expect(
      resolveHelperPath({ ...base, packaged: true, platform: 'linux', isFile: () => true }),
    ).toBeNull()
    // real file system: nothing exists under this made-up relative path
    expect(resolveHelperPath({ ...base, packaged: false })).toBeNull()
  })
})
