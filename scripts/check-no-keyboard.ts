// Usage: node scripts/check-no-keyboard.ts  (run from the repo root; uses `git ls-files`)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findKeyboardCapture, isScanned } from './keyboard-guard.ts'

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(isScanned)

const violations = files.flatMap((file) => findKeyboardCapture(file, readFileSync(file, 'utf8')))

for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}\n    ${v.text}`)
if (violations.length) {
  console.error(`\nKamo never captures the keyboard (AGENTS.md rule 2, D-003).`)
  process.exit(1)
}
console.log(`keyboard guard: ${files.length} files, no system-wide keyboard capture`)
