// Fails when a build artifact goes over its size budget (AGENTS.md rule 6).
// Usage: node scripts/check-size.ts <budget-in-MB> <file-or-directory>...
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [budgetArg, ...paths] = process.argv.slice(2)
const budgetMb = Number(budgetArg)
if (!budgetMb || paths.length === 0) {
  console.error('usage: node scripts/check-size.ts <budget-in-MB> <file-or-directory>...')
  process.exit(2)
}

function sizeOf(path: string): number {
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((total, entry) => total + sizeOf(join(path, entry)), 0)
}

let failed = false
for (const path of paths) {
  const mb = sizeOf(path) / 1_000_000
  const ok = mb <= budgetMb
  failed ||= !ok
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${mb.toFixed(1)}MB / ${budgetMb}MB  ${path}`)
}
process.exit(failed ? 1 : 0)
