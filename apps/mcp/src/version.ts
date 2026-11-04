import { readFileSync } from 'node:fs'

/** Version from package.json, which sits next to both `src/` and the published `dist/`. */
export const VERSION: string = (() => {
  try {
    const pkg: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    const version = (pkg as { version?: unknown }).version
    return typeof version === 'string' ? version : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()
