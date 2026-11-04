import { describe, expect, it } from 'vitest'
import { buildManifest } from './make-manifest.ts'
import { parseManifest } from './manifest.ts'

const sha = (c: string) => c.repeat(64)

describe('buildManifest', () => {
  it('writes a manifest the app accepts, sharing the binaries between the packs', () => {
    const base = 'https://github.com/dssiqueira/kamo/releases/download/packs'
    const manifest = buildManifest({
      version: '1.0.0',
      baseUrl: base,
      platforms: [
        {
          key: 'win32-x64',
          entry: 'bin/whisper-cli.exe',
          binaries: [
            {
              path: 'bin/whisper-cli.exe',
              asset: 'kamo-pack-whisper-1.0.0-win32-x64-whisper-cli.exe',
              size: 10,
              sha256: sha('a'),
              executable: true,
            },
            {
              path: 'bin/ggml.dll',
              asset: 'kamo-pack-whisper-1.0.0-win32-x64-ggml.dll',
              size: 5,
              sha256: sha('b'),
            },
          ],
        },
        {
          key: 'darwin-arm64',
          entry: 'bin/whisper-cli',
          binaries: [
            {
              path: 'bin/whisper-cli',
              asset: 'kamo-pack-whisper-1.0.0-darwin-arm64-whisper-cli',
              size: 9,
              sha256: sha('c'),
              executable: true,
            },
          ],
        },
      ],
      packs: [
        {
          id: 'transcribe-light',
          model: {
            name: 'whisper-base',
            file: {
              path: 'models/ggml-base.bin',
              asset: 'kamo-pack-model-1.0.0-ggml-base.bin',
              size: 100,
              sha256: sha('d'),
            },
          },
        },
        {
          id: 'transcribe-accurate',
          model: {
            name: 'whisper-small',
            file: {
              path: 'models/ggml-small.bin',
              asset: 'kamo-pack-model-1.0.0-ggml-small.bin',
              size: 300,
              sha256: sha('e'),
            },
          },
        },
      ],
    })
    const parsed = parseManifest(manifest, `${base}/packs-manifest.json`)
    expect(parsed.packs.map((p) => [p.id, Object.keys(p.platforms).sort()])).toEqual([
      ['transcribe-light', ['darwin-arm64', 'win32-x64']],
      ['transcribe-accurate', ['darwin-arm64', 'win32-x64']],
    ])
    const win = parsed.packs[0]!.platforms['win32-x64']!
    expect(win.files.map((f) => f.path)).toEqual([
      'bin/whisper-cli.exe',
      'bin/ggml.dll',
      'models/ggml-base.bin',
    ])
    expect(win.files[0]!.url).toBe(`${base}/kamo-pack-whisper-1.0.0-win32-x64-whisper-cli.exe`)
  })
})
