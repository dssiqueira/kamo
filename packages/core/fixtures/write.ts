import { writeFileSync } from 'node:fs'
import { generateFixtures } from './generate.ts'

for (const [file, content] of Object.entries(generateFixtures())) {
  writeFileSync(new URL(file, import.meta.url), content)
  console.log(`fixtures/${file}`)
}
