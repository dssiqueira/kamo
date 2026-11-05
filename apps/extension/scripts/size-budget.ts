// Size budget of the built extension (E-06, AGENTS.md rule 6): the whole package ≤ 5MB and the
// popup ≤ 150KB, counted as what the popup loads to open (its script, every chunk it imports
// statically, its stylesheet), gzipped, the way the store and Chrome's disk cache see them.
// Dynamic imports (recovery, languages other than the one in use) are left out on purpose.
// Usage: node scripts/size-budget.ts [dist]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

export const PACKAGE_BUDGET = 5 * 1024 * 1024
export const POPUP_BUDGET = 150 * 1024

export interface Budget {
  packageBytes: number
  popup: { files: string[]; rawBytes: number; gzipBytes: number }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Static imports of a built ES module: `import … from "./x.js"` and `import "./x.js"`. */
export function staticImports(code: string): string[] {
  const found = new Set<string>()
  for (const match of code.matchAll(
    /(?:^|[;}\s])import\s*(?:[^"'`()]*?from\s*)?["'`]([^"'`]+)["'`]/g,
  )) {
    if (match[1]) found.add(match[1])
  }
  return [...found]
}

/** Every file a page loads before it runs: its module graph (static only) and stylesheets. */
export function pageFiles(dist: string, page: string): string[] {
  const html = readFileSync(join(dist, page), 'utf8')
  const seen = new Set<string>()
  const queue = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => join(dist, m[1] ?? ''))
  while (queue.length) {
    const file = queue.shift() as string
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.endsWith('.js')) continue
    for (const spec of staticImports(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec))
    }
  }
  return [...seen]
}

export function measure(dist: string): Budget {
  const packageBytes = walk(dist).reduce((sum, file) => sum + statSync(file).size, 0)
  const files = pageFiles(dist, 'popup.html')
  let rawBytes = 0
  let gzipBytes = 0
  for (const file of files) {
    const data = readFileSync(file)
    rawBytes += data.length
    gzipBytes += gzipSync(data, { level: 9 }).length
  }
  return {
    packageBytes,
    popup: { files: files.map((f) => relative(dist, f)), rawBytes, gzipBytes },
  }
}

if (import.meta.main) {
  const dist = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist'))
  const { packageBytes, popup } = measure(dist)
  const kb = (n: number) => `${(n / 1024).toFixed(1)}KB`
  console.log(`package: ${(packageBytes / 1024 / 1024).toFixed(2)}MB (budget 5MB)`)
  console.log(
    `popup: ${kb(popup.gzipBytes)} gzipped, ${kb(popup.rawBytes)} raw (budget 150KB gzipped)`,
  )
  for (const file of popup.files) console.log(`  ${file}`)
  const over = packageBytes > PACKAGE_BUDGET || popup.gzipBytes > POPUP_BUDGET
  if (over) {
    console.error('Over the extension size budget (E-06).')
    process.exit(1)
  }
}
