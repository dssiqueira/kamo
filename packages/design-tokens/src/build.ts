import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generate } from './tokens.ts'

const designPath = fileURLToPath(new URL('../../../DESIGN.md', import.meta.url))
const outDir = new URL('../generated/', import.meta.url)

for (const [file, content] of Object.entries(generate(readFileSync(designPath, 'utf8')))) {
  writeFileSync(new URL(file, outDir), content)
  console.log(`generated/${file}`)
}
