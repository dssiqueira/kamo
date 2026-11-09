// CI (.github/workflows/packs.yml): turns the assembled pack files into release assets with
// unique names plus packs-manifest.json (sizes and SHA-256 computed here). Run from apps/desktop:
//
//   node scripts/make-packs-manifest.ts <in> <out> <version> <base-url>
//
// <in> holds one folder per platform (`win32-x64/`, `darwin-arm64/`: whisper-cli and its
// libraries), `models/` (ggml-base.bin, ggml-small.bin) and, when CI built FFmpeg for the
// "Video compatibility" pack (D-040), `ffmpeg-win32-x64/` and `ffmpeg-darwin-arm64/` (the
// program and its license notices). A platform without its folder is left out; with no FFmpeg
// folder at all the manifest does not list the compatibility pack.
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  buildManifest,
  type BuiltFile,
  type BuiltPlatform,
} from '../src/main/packs/make-manifest.ts'
import { parseManifest } from '../src/main/packs/manifest.ts'

const [input, output, version, baseUrl] = process.argv.slice(2)
if (!input || !output || !version || !baseUrl) {
  console.error('usage: make-packs-manifest.ts <in> <out> <version> <base-url>')
  process.exit(2)
}
mkdirSync(output, { recursive: true })

function asset(source: string, path: string, name: string, executable = false): BuiltFile {
  const body = readFileSync(source)
  copyFileSync(source, join(output!, name))
  return {
    path,
    asset: name,
    size: statSync(source).size,
    sha256: createHash('sha256').update(body).digest('hex'),
    ...(executable ? { executable: true } : {}),
  }
}

const platforms: BuiltPlatform[] = []
for (const key of ['win32-x64', 'darwin-arm64']) {
  const dir = join(input, key)
  let names: string[]
  try {
    names = readdirSync(dir).sort()
  } catch {
    console.warn(`no ${key} build; skipped`)
    continue
  }
  const entry = names.find((name) => /^whisper-cli(\.exe)?$/.test(name))
  if (!entry) throw new Error(`${key}: whisper-cli missing`)
  platforms.push({
    key,
    entry: `bin/${entry}`,
    binaries: names.map((name) =>
      asset(
        join(dir, name),
        `bin/${name}`,
        `kamo-pack-whisper-${version}-${key}-${name}`,
        name === entry,
      ),
    ),
  })
}

// The compatibility pack (D-040): FFmpeg in bin/, its LGPL notices in licenses/.
const ffmpegPlatforms: BuiltPlatform[] = []
for (const key of ['win32-x64', 'darwin-arm64']) {
  const dir = join(input, `ffmpeg-${key}`)
  let names: string[]
  try {
    names = readdirSync(dir).sort()
  } catch {
    console.warn(`no FFmpeg for ${key}; the compatibility pack skips it`)
    continue
  }
  const entry = names.find((name) => /^ffmpeg(\.exe)?$/.test(name))
  if (!entry) throw new Error(`ffmpeg-${key}: ffmpeg missing`)
  ffmpegPlatforms.push({
    key,
    entry: `bin/${entry}`,
    binaries: names.map((name) =>
      asset(
        join(dir, name),
        name === entry ? `bin/${name}` : `licenses/${name}`,
        `kamo-pack-ffmpeg-${version}-${key}-${name}`,
        name === entry,
      ),
    ),
  })
}

const model = (file: string, name: string) => ({
  name,
  file: asset(join(input, 'models', file), `models/${file}`, `kamo-pack-model-${version}-${file}`),
})
const manifest = buildManifest({
  version,
  baseUrl,
  platforms,
  packs: [
    { id: 'transcribe-light', model: model('ggml-base.bin', 'whisper-base') },
    { id: 'transcribe-accurate', model: model('ggml-small.bin', 'whisper-small') },
  ],
  compatibility: { id: 'video-compatibility', platforms: ffmpegPlatforms },
})
// The app's own parser must accept every platform, or the release would ship a broken list.
const parsed = parseManifest(manifest, `${baseUrl}/packs-manifest.json`)
for (const pack of parsed.packs) {
  const expected = pack.kind === 'compatibility' ? ffmpegPlatforms.length : platforms.length
  if (Object.keys(pack.platforms).length !== expected) {
    throw new Error(`${pack.id}: a platform did not pass the app's checks`)
  }
}
writeFileSync(join(output, 'packs-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  `packs-manifest.json: whisper ${platforms.map((p) => p.key).join(', ')}; ` +
    `ffmpeg ${ffmpegPlatforms.map((p) => p.key).join(', ') || 'none'}`,
)
