// app-data/packs.json (docs/data-model.md): which packs are installed, their version and the
// SHA-256 of every file. Written atomically after each install or removal.
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { writeFileAtomic } from '../storage/atomic.ts'

export const REGISTRY_VERSION = 1

const InstalledFile = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
})

export const InstalledPack = z.object({
  version: z.string().min(1),
  installedAt: z.string(),
  /** Program to run, relative to the pack folder. */
  entry: z.string().min(1),
  model: z.object({ name: z.string().min(1), path: z.string().min(1) }),
  files: z.array(InstalledFile),
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
