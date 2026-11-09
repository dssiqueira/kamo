// Where the transcription models come from (A-07, D-042): the official whisper.cpp model
// repository on Hugging Face, at one pinned revision, each file pinned by size and SHA-256.
// The only place with a model URL. Nothing is fetched until the user asks for a model; there
// is no manifest, no telemetry and no background check: a plain GET of one file.
import { readFileSync } from 'node:fs'
import type { PackId } from '../../shared/packs.ts'

/** huggingface.co/ggerganov/whisper.cpp, the models whisper.cpp's own scripts download. */
export const MODEL_REPO = 'ggerganov/whisper.cpp'
/**
 * A commit of that repository ("Add automatic-speech-recognition tag", 2024-10-29). The
 * `resolve/<revision>/` URL always serves the file as it was in this commit, so a later push
 * to the repository never changes what Kamo downloads.
 */
export const MODEL_REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1'
export const MODEL_BASE_URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/`

export interface ModelSource {
  /** The download (Hugging Face redirects it to its CDN). */
  url: string
  /** File name inside the pack folder. */
  file: string
  size: number
  sha256: string
}

export interface KnownPack {
  id: PackId
  quality: 'light' | 'accurate'
  /** The model's name in transcript.json. */
  modelName: string
  /** Pack folder name (`packs/<id>/<version>/`): the pinned revision. */
  version: string
  source: ModelSource
}

/**
 * Light: whisper `base` multilingual (148MB), quick on any computer. Accurate: `small`
 * multilingual (488MB), clearly better in Portuguese, Chinese and Japanese (A-05). Sizes and
 * SHA-256 from the Hugging Face API (`/api/models/<repo>/tree/<revision>`, lfs.oid); the
 * SHA-1s whisper.cpp's models/README.md lists (465707469ff3…, 55356645c2b3…) match them.
 */
export const KNOWN_PACKS: readonly KnownPack[] = [
  {
    id: 'transcribe-light',
    quality: 'light',
    modelName: 'whisper-base',
    version: MODEL_REVISION,
    source: {
      url: `${MODEL_BASE_URL}ggml-base.bin`,
      file: 'ggml-base.bin',
      size: 147_951_465,
      sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    },
  },
  {
    id: 'transcribe-accurate',
    quality: 'accurate',
    modelName: 'whisper-small',
    version: MODEL_REVISION,
    source: {
      url: `${MODEL_BASE_URL}ggml-small.bin`,
      file: 'ggml-small.bin',
      size: 487_601_967,
      sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    },
  },
]

/** Extra free space asked for on top of the download (the WAV, the transcript, the OS). */
export const DISK_MARGIN_BYTES = 200_000_000

/**
 * Development and tests only (a debug hook, D-038): a JSON file that replaces the model
 * sources, `{ "<pack id>": { "url", "size", "sha256", "version"? } }`, written by
 * `scripts/fake-pack-server.ts`. URLs must be plain http on this machine.
 */
export const DEV_MODELS_ENV = 'KAMO_PACKS_DEV_MODELS'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** The packs with the dev override applied; anything wrong in it is ignored. */
export function knownPacks(env: Record<string, string | undefined>): readonly KnownPack[] {
  const file = env[DEV_MODELS_ENV]
  if (!file) return KNOWN_PACKS
  let override: Record<string, Partial<ModelSource & { version: string }>>
  try {
    override = JSON.parse(readFileSync(file, 'utf8')) as typeof override
  } catch {
    return KNOWN_PACKS
  }
  return KNOWN_PACKS.map((pack) => {
    const dev = override[pack.id]
    if (!dev || typeof dev.url !== 'string') return pack
    if (typeof dev.size !== 'number' || typeof dev.sha256 !== 'string') return pack
    try {
      const url = new URL(dev.url)
      if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) return pack
    } catch {
      return pack
    }
    return {
      ...pack,
      version: typeof dev.version === 'string' ? dev.version : 'dev',
      source: { ...pack.source, url: dev.url, size: dev.size, sha256: dev.sha256 },
    }
  })
}
