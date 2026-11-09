// Where optional packs come from (A-07, D-019). The only place with a pack URL: everything
// else gets it from here. Nothing is fetched until the user opens Settings → Packs or asks to
// transcribe; there is no telemetry and no background check.
import type { PackId, PackKind } from '../../shared/packs.ts'

/**
 * `packs-manifest.json` on this repository's rolling `packs` release (a prerelease, so
 * electron-updater never takes it for an app version). `.github/workflows/packs.yml` builds
 * the packs and replaces the manifest; the pack files keep versioned names.
 */
export const DEFAULT_MANIFEST_URL =
  'https://github.com/dssiqueira/kamo/releases/download/packs/packs-manifest.json'

/** Development and tests: point the app at another manifest (e.g. a local fake server). */
export const MANIFEST_URL_ENV = 'KAMO_PACKS_MANIFEST_URL'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * The manifest URL: the env override when it is https (or plain http on this machine, for a
 * local test server in an unpackaged build), otherwise the default.
 */
export function manifestUrl(
  env: Record<string, string | undefined>,
  options: { packaged: boolean },
): string {
  const override = env[MANIFEST_URL_ENV]
  if (!override) return DEFAULT_MANIFEST_URL
  try {
    const url = new URL(override)
    if (url.protocol === 'https:') return url.href
    if (url.protocol === 'http:' && !options.packaged && LOOPBACK.has(url.hostname)) {
      return url.href
    }
  } catch {
    // not a URL: the default
  }
  return DEFAULT_MANIFEST_URL
}

/** `win32-x64`, `darwin-arm64`... the key of a platform in the manifest. */
export function platformKey(platform: string = process.platform, arch: string = process.arch) {
  return `${platform}-${arch}`
}

export interface KnownPack {
  id: PackId
  kind: PackKind
  /** Transcription packs only. */
  quality: 'light' | 'accurate' | null
  /** Shown before the list loads (features.md A-05: ~150MB / ~500MB). */
  approxBytes: number
}

/**
 * The packs Kamo knows how to use. The manifest adds versions, files and exact sizes; a pack
 * in the manifest that is not here is ignored (a newer app's pack).
 * Light: whisper `base` multilingual (148MB), Accurate: `small` multilingual (488MB) — see
 * the packs workflow for why these two. Video compatibility: an LGPL FFmpeg build (D-040),
 * only offered when an export fails for lack of an encoder (features.md A-07: ~70MB).
 */
export const KNOWN_PACKS: readonly KnownPack[] = [
  { id: 'transcribe-light', kind: 'transcription', quality: 'light', approxBytes: 152_000_000 },
  {
    id: 'transcribe-accurate',
    kind: 'transcription',
    quality: 'accurate',
    approxBytes: 492_000_000,
  },
  {
    id: 'video-compatibility',
    kind: 'compatibility',
    quality: null,
    approxBytes: 70_000_000,
  },
]

/** Extra free space asked for on top of the download (the WAV, the transcript, the OS). */
export const DISK_MARGIN_BYTES = 200_000_000
