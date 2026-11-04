// Usage: node scripts/check-i18n-usage.ts  (from the repo root; uses `git ls-files`)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findMissingKeys, flattenKeys, isUiSource } from './i18n-usage.ts'

const source = JSON.parse(readFileSync('packages/i18n/src/locales/en.json', 'utf8'))
const keys = flattenKeys(source)

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(isUiSource)

const missing = files.flatMap((file) => findMissingKeys(file, readFileSync(file, 'utf8'), keys))
for (const m of missing) console.error(`${m.file}:${m.line}  missing i18n key "${m.key}"`)
if (missing.length) {
  console.error('\nAdd the keys to packages/i18n/src/locales/*.json (rule 14).')
  process.exit(1)
}
console.log(`i18n usage: ${files.length} files, every literal key exists`)
