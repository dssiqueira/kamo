// app-data/packs.json (docs/data-model.md): which models are installed, the Hugging Face
// revision they came from, and the size and SHA-256 of the file. Written atomically after each
// install or removal.
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { writeFileAtomic } from '../storage/atomic.ts'

/** 2 since D-042 (model only, no program); a version 1 file counts as nothing installed. */
export const REGISTRY_VERSION = 2

/** A plain file name inside the pack folder: no separator, never `.` or `..`. */
export const PackFileName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/)

/**
 * A pack version (the Hugging Face revision). It names a folder (`packs/<id>/<version>/`), so
 * it starts with a letter or a digit and has no separator.
 */
export const PackVersion = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/)

// packs.json is a local file any program running as the user can edit: names and versions
// follow the rules again, so they can never point outside the pack folder.
export const InstalledPack = z.object({
  version: PackVersion,
  installedAt: z.string(),
  model: z.object({
    /** Its name in transcript.json (`whisper-base`). */
    name: z.string().min(1).max(64),
    file: PackFileName,
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
})
export type InstalledPack = z.infer<typeof InstalledPack>

const Registry = z.object({
  version: z.literal(REGISTRY_VERSION),
  packs: z.record(z.string(), InstalledPack.optional().catch(undefined)),
})

export type InstalledPacks = Record<string, InstalledPack>

/** Missing or unreadable → nothing installed (the folders are then left for a reinstall). */
export async function readRegistry(file: string): Promise<InstalledPacks> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return {}
  }
  try {
    const parsed = Registry.safeParse(JSON.parse(text))
    if (!parsed.success) return {}
    const packs: InstalledPacks = {}
    for (const [id, pack] of Object.entries(parsed.data.packs)) if (pack) packs[id] = pack
    return packs
  } catch {
    return {}
  }
}

export async function writeRegistry(file: string, packs: InstalledPacks): Promise<void> {
  const body = { version: REGISTRY_VERSION, packs }
  await writeFileAtomic(file, `${JSON.stringify(body, null, 2)}\n`)
}
