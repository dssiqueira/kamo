// packs-manifest.json (A-07): which packs exist, their version and, per platform, every file
// with its URL, size and SHA-256. Fetched from GitHub Releases only on a user action.
import { z } from 'zod'

export const MANIFEST_SCHEMA = 1

/**
 * A path inside the pack folder: relative, `/`-separated, plain names only, so a manifest can
 * never write outside `packs/<id>/<version>/`.
 */
export const PackPath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/)
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'))

/**
 * A pack version. It names a folder (`packs/<id>/<version>/`), so it starts with a letter or
 * a digit and has no separator: `.`, `..` and anything with a slash or a backslash are refused.
 */
export const PackVersion = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/)

export const PackFile = z.object({
  path: PackPath,
  url: z.url(),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Mac: gets the executable bit after the download. */
  executable: z.boolean().optional(),
})
export type PackFile = z.infer<typeof PackFile>

export const PackPlatform = z.object({
  /** The program to run, e.g. `bin/whisper-cli.exe`; must be one of `files`. */
  entry: PackPath,
  files: z.array(PackFile).min(1),
})
export type PackPlatform = z.infer<typeof PackPlatform>

export const ManifestPack = z
  .object({
    id: z.string().min(1).max(64),
    version: PackVersion,
    /** `transcription`: whisper.cpp + a model (A-05); `compatibility`: FFmpeg (D-040). */
    kind: z.enum(['transcription', 'compatibility']),
    /** Transcription: the model inside the pack, its name for transcript.json and its file. */
    model: z.object({ name: z.string().min(1).max(64), path: PackPath }).optional(),
    platforms: z.record(z.string(), PackPlatform),
  })
  .refine((pack) => (pack.kind === 'transcription') === (pack.model !== undefined))
export type ManifestPack = z.infer<typeof ManifestPack>

const Manifest = z.object({
  schema: z.literal(MANIFEST_SCHEMA),
  packs: z.array(z.unknown()),
})

export interface PacksManifest {
  packs: ManifestPack[]
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestError'
  }
}

/**
 * Validates the manifest. Packs that do not parse (a newer format) are skipped; file URLs
 * must be on the manifest's own origin (GitHub's release downloads, or the local test
 * server), the entry and the model (a transcription pack's) must be listed files, and paths
 * must not repeat.
 */
export function parseManifest(json: unknown, manifestUrl: string): PacksManifest {
  const top = Manifest.safeParse(json)
  if (!top.success) throw new ManifestError('not a packs manifest')
  const origin = new URL(manifestUrl).origin
  const packs: ManifestPack[] = []
  for (const raw of top.data.packs) {
    const parsed = ManifestPack.safeParse(raw)
    if (!parsed.success) continue
    const pack = parsed.data
    const platforms = Object.entries(pack.platforms).filter(([, platform]) =>
      isConsistent(platform, pack.model?.path ?? null, origin),
    )
    packs.push({ ...pack, platforms: Object.fromEntries(platforms) })
  }
  return { packs }
}

function isConsistent(platform: PackPlatform, modelPath: string | null, origin: string): boolean {
  const paths = platform.files.map((file) => file.path.toLowerCase())
  if (new Set(paths).size !== paths.length) return false
  if (!paths.includes(platform.entry.toLowerCase())) return false
  if (modelPath !== null && !paths.includes(modelPath.toLowerCase())) return false
  return platform.files.every((file) => new URL(file.url).origin === origin)
}

/** Total download size of a pack on one platform. */
export function platformSize(platform: PackPlatform): number {
  return platform.files.reduce((sum, file) => sum + file.size, 0)
}
