// Rule 14: every UI text comes from packages/i18n. `check-keys` makes the locales agree with
// each other; this makes sure the keys the code uses exist in the English source.

export interface MissingKey {
  file: string
  line: number
  key: string
}

/** `t('a.b')`, `t("a.b", …)`, `i18n.t('a.b')` — the first argument when it is a literal. */
const T_CALL = /\bt\(\s*(['"`])([^'"`$]+?)\1/g
/** Any string literal shaped like a key (`'recording.errors.lowDisk'`), e.g. in lookup tables. */
const KEY_LITERAL = /(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g
/** `project.json`, `recording.lock`: file names, not keys. */
const FILE_NAME = /\.(json|jsonl|lock|mp4|webm|m4a|jpg|jpeg|png|webp|svg|partial|tmp)$/
/** Comment-only lines, including the `* …` lines of doc comments. */
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/
/** The main process uses dotted strings for log events (`recording.started`). */
const MAIN_PROCESS = /^apps\/desktop\/src\/main\//

export function flattenKeys(messages: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') {
      for (const nested of flattenKeys(value as Record<string, unknown>, path)) keys.add(nested)
    } else keys.add(path)
  }
  return keys
}

/**
 * Keys used in one source file that the locale doesn't have. `t('…')` arguments are always
 * checked. Other literals that look like a key are checked when their first segment is one of
 * the locale's namespaces (so `'node:fs'` or `'a.b'` in unrelated code are ignored), except in
 * the main process, where only t() calls are UI text. Keys built at runtime (template literals
 * with `${}`) can't be checked here.
 */
export function findMissingKeys(file: string, text: string, keys: Set<string>): MissingKey[] {
  const namespaces = new Set([...keys].map((key) => key.split('.')[0]))
  const literalsAreKeys = !MAIN_PROCESS.test(file)
  const missing = new Map<string, MissingKey>()
  text.split('\n').forEach((raw, index) => {
    const line = withoutComment(raw)
    const report = (key: string) => {
      if (!keys.has(key) && !missing.has(`${index}:${key}`)) {
        missing.set(`${index}:${key}`, { file, line: index + 1, key })
      }
    }
    for (const match of line.matchAll(T_CALL)) report(match[2] as string)
    if (!literalsAreKeys) return
    for (const match of line.matchAll(KEY_LITERAL)) {
      const key = match[2] as string
      if (FILE_NAME.test(key)) continue
      if (namespaces.has(key.split('.')[0] as string)) report(key)
    }
  })
  return [...missing.values()]
}

function withoutComment(line: string): string {
  if (COMMENT_LINE.test(line)) return ''
  const comment = line.indexOf(' // ')
  return comment === -1 ? line : line.slice(0, comment)
}

/** Source files whose strings reach the UI. Tests and build output are skipped. */
export function isUiSource(file: string): boolean {
  if (/(^|\/)(node_modules|dist|out|build|release)\//.test(file)) return false
  if (/\.test\.(ts|tsx)$/.test(file)) return false
  return (
    /^packages\/(ui|core)\/src\/.+\.(ts|tsx)$/.test(file) ||
    /^apps\/(desktop|extension)\/src\/.+\.(ts|tsx)$/.test(file)
  )
}
