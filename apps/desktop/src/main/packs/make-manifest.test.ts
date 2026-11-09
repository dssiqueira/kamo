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

  it('lists the compatibility pack (FFmpeg, no model) only when CI built it', () => {
    const base = 'https://github.com/dssiqueira/kamo/releases/download/packs'
    const common = { version: '1.1.0', baseUrl: base, platforms: [], packs: [] }
    const ffmpeg = {
      key: 'win32-x64',
      entry: 'bin/ffmpeg.exe',
      binaries: [
        {
          path: 'bin/ffmpeg.exe',
          asset: 'kamo-pack-ffmpeg-1.1.0-win32-x64-ffmpeg.exe',
          size: 20,
          sha256: sha('f'),
          executable: true,
        },
        {
          path: 'NOTICE.txt',
          asset: 'kamo-pack-ffmpeg-1.1.0-win32-x64-NOTICE.txt',
          size: 2,
          sha256: sha('0'),
        },
      ],
    }
    const withPack = buildManifest({
      ...common,
      compatibility: { id: 'video-compatibility', platforms: [ffmpeg] },
    })
    const parsed = parseManifest(withPack, `${base}/packs-manifest.json`)
    expect(parsed.packs).toHaveLength(1)
    const pack = parsed.packs[0]!
    expect(pack).toMatchObject({ id: 'video-compatibility', kind: 'compatibility' })
    expect(pack.model).toBeUndefined()
    expect(pack.platforms['win32-x64']!.files.map((f) => f.path)).toEqual([
      'bin/ffmpeg.exe',
      'NOTICE.txt',
    ])

    expect(buildManifest(common).packs).toEqual([])
    expect(
      buildManifest({ ...common, compatibility: { id: 'video-compatibility', platforms: [] } })
        .packs,
    ).toEqual([])
  })

  it('refuses a transcription pack without a model and a compatibility pack with one', () => {
    const base = 'https://example.test/packs'
    const platform = {
      entry: 'bin/x',
      files: [{ path: 'bin/x', url: `${base}/x`, size: 1, sha256: sha('a') }],
    }
    const manifest = {
      schema: 1,
      packs: [
        { id: 'transcribe-light', version: '1', kind: 'transcription', platforms: { k: platform } },
        {
          id: 'video-compatibility',
          version: '1',
          kind: 'compatibility',
          model: { name: 'm', path: 'bin/x' },
          platforms: { k: platform },
        },
      ],
    }
    expect(parseManifest(manifest, `${base}/packs-manifest.json`).packs).toEqual([])
  })
})
