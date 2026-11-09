import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWhisperPath, whisperCandidates } from './whisper-path.ts'

const base = { resourcesPath: join('/app', 'resources'), appPath: join('/repo', 'apps', 'desktop') }

describe('whisper-cli path (D-042)', () => {
  it('is in the resources of a packaged app', () => {
    expect(whisperCandidates({ ...base, packaged: true, platform: 'win32' })).toEqual([
      join('/app', 'resources', 'whisper', 'whisper-cli.exe'),
    ])
    expect(whisperCandidates({ ...base, packaged: true, platform: 'darwin' })).toEqual([
      join('/app', 'resources', 'whisper', 'whisper-cli'),
    ])
  })

  it('is in the native build folder in development, after the dev override', () => {
    expect(
      whisperCandidates({ ...base, packaged: false, platform: 'win32', override: '/tmp/w.mjs' }),
    ).toEqual([
      '/tmp/w.mjs',
      join('/repo', 'apps', 'desktop', 'native', 'whisper', 'build', 'win', 'whisper-cli.exe'),
    ])
  })

  it('is null when it was not built (or on another OS)', () => {
    expect(resolveWhisperPath({ ...base, packaged: false, isFile: () => false })).toBeNull()
    expect(
      resolveWhisperPath({ ...base, packaged: true, platform: 'linux', isFile: () => true }),
    ).toBeNull()
    const found = resolveWhisperPath({
      ...base,
      packaged: true,
      platform: 'win32',
      isFile: (path) => path.endsWith('whisper-cli.exe'),
    })
    expect(found).toBe(join('/app', 'resources', 'whisper', 'whisper-cli.exe'))
  })
})
