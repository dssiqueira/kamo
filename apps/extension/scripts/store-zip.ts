// The Chrome Web Store package (E-06): dist/ zipped with the manifest at the root, written to
// out-store/kamo-extension-<version>.zip. No zip dependency: a plain ZIP (deflate, no
// extras) is a few lines with node:zlib. It never uploads anything; publishing stays a person's
// call (or the release workflow's, with the store secrets).
// Usage: pnpm --filter @kamo/extension store:zip   (builds, checks the budget, then zips)
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

interface Entry {
  name: string
  data: Buffer
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
}

/** A ZIP archive of `entries` (deflated; fixed 1980-01-01 timestamps so builds are repeatable). */
export function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  const DOS_DATE = (0 << 9) | (1 << 5) | 1
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // made by
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, packed)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const dist = join(root, 'dist')
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as {
    version_name?: string
    version: string
  }
  const entries = walk(dist)
    // Source maps only exist in development builds and never ship.
    .filter((file) => !file.endsWith('.map'))
    .map((file) => ({ name: relative(dist, file).split('\\').join('/'), data: readFileSync(file) }))
  const out = join(root, 'out-store')
  mkdirSync(out, { recursive: true })
  const file = join(out, `kamo-extension-${manifest.version_name ?? manifest.version}.zip`)
  const archive = zip(entries)
  writeFileSync(file, archive)
  console.log(
    `${relative(root, file)}: ${entries.length} files, ${(archive.length / 1024 / 1024).toFixed(2)}MB`,
  )
}
