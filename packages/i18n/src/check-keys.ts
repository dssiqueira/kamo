// Ensures every locale has the same keys and arguments as English, and that every
// message is valid ICU. CI fails if anything is missing (rule 14).
import { IntlMessageFormat } from 'intl-messageformat'
import type { Messages } from './locales.ts'

export function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') flat.set(path, value)
    else for (const [k, v] of flatten(value, path)) flat.set(k, v)
  }
  return flat
}

interface AstNode {
  type: number
  value?: unknown
  options?: Record<string, { value: AstNode[] }>
  children?: AstNode[]
}

// formatjs parser node types that carry an argument: argument, number, date, time, select, plural.
const ARGUMENT_TYPES = new Set([1, 2, 3, 4, 5, 6])

function collectArguments(nodes: AstNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (ARGUMENT_TYPES.has(node.type) && typeof node.value === 'string') into.add(node.value)
    for (const option of Object.values(node.options ?? {})) collectArguments(option.value, into)
    if (node.children) collectArguments(node.children, into)
  }
  return into
}

function argumentsOf(message: string, locale: string): Set<string> {
  const ast = new IntlMessageFormat(message, locale).getAst() as unknown as AstNode[]
  return collectArguments(ast)
}

export function checkKeys(source: Messages, locales: Record<string, Messages>): string[] {
  const errors: string[] = []
  const sourceFlat = flatten(source)

  for (const [locale, messages] of Object.entries(locales)) {
    const flat = flatten(messages)
    for (const [key, sourceMessage] of sourceFlat) {
      const message = flat.get(key)
      if (message === undefined) {
        errors.push(`${locale}: missing key "${key}"`)
        continue
      }
      let args: Set<string>
      try {
        args = argumentsOf(message, locale)
      } catch (error) {
        errors.push(`${locale}: "${key}" is not valid ICU (${(error as Error).message})`)
        continue
      }
      const expected = argumentsOf(sourceMessage, 'en')
      const missing = [...expected].filter((a) => !args.has(a))
      const extra = [...args].filter((a) => !expected.has(a))
      if (missing.length)
        errors.push(`${locale}: "${key}" is missing argument ${missing.join(', ')}`)
      if (extra.length) errors.push(`${locale}: "${key}" has extra argument ${extra.join(', ')}`)
    }
    for (const key of flat.keys()) {
      if (!sourceFlat.has(key)) errors.push(`${locale}: key "${key}" does not exist in English`)
    }
  }
  return errors
}
