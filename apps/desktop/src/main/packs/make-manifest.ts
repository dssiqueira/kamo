// Builds packs-manifest.json from the files CI assembled (.github/workflows/packs.yml). Pure, so
// the app's own parser checks its output in tests: a manifest CI writes is one the app reads.

export interface BuiltFile {
  /** Path inside the pack folder, e.g. `bin/whisper-cli.exe`. */
  path: string
  /** Release asset name (unique in the release). */
  asset: string
  size: number
  sha256: string
  executable?: boolean
}

export interface BuiltPlatform {
  /** `win32-x64`, `darwin-arm64`... */
  key: string
  entry: string
  binaries: BuiltFile[]
}

export interface BuiltModel {
  /** `whisper-base` */
  name: string
  file: BuiltFile
}

export interface ManifestInput {
  version: string
  /** `https://github.com/<owner>/<repo>/releases/download/<tag>` */
  baseUrl: string
  platforms: BuiltPlatform[]
  /** One model per pack. */
  packs: Array<{ id: string; model: BuiltModel }>
}

export function buildManifest(input: ManifestInput) {
  const url = (asset: string) => `${input.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(asset)}`
  const file = (f: BuiltFile) => ({
    path: f.path,
    url: url(f.asset),
    size: f.size,
    sha256: f.sha256,
    ...(f.executable ? { executable: true } : {}),
  })
  return {
    schema: 1,
    packs: input.packs.map((pack) => ({
      id: pack.id,
      version: input.version,
      kind: 'transcription',
      model: { name: pack.model.name, path: pack.model.file.path },
      platforms: Object.fromEntries(
        input.platforms.map((platform) => [
          platform.key,
          {
            entry: platform.entry,
            files: [...platform.binaries.map(file), file(pack.model.file)],
          },
        ]),
      ),
    })),
  }
}
