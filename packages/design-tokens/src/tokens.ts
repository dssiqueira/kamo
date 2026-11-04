// Reads DESIGN.md and generates the tokens. Source of truth: the front matter (light theme)
// and the table in the "Dark theme" section.
import { parse } from 'yaml'

type Scalar = string | number
type Group = Record<string, Scalar>

export interface DesignTokens {
  name: string
  colors: { light: Record<string, string>; dark: Record<string, string> }
  typography: Record<string, Group>
  rounded: Record<string, string>
  spacing: Record<string, string>
  components: Record<string, Record<string, string>>
}

// Tokens the dark theme leaves out on purpose ("no need for the strong variant here").
const DARK_FALLBACKS: Record<string, string> = {
  'tertiary-strong': 'tertiary',
  success: 'primary-strong',
}

const CJK_STACKS: Record<string, string> = {
  'zh-CN': '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"',
  ja: '"Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP"',
  ko: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"',
}

const GENERIC_FAMILY: Record<string, string> = {
  'Instrument Serif': 'serif',
  Inter: 'sans-serif',
  'JetBrains Mono': 'monospace',
}

export function parseDesign(markdown: string): DesignTokens {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  if (!match?.[1]) throw new Error('DESIGN.md has no YAML front matter')
  const front = parse(match[1]) as {
    name: string
    colors: Record<string, string>
    typography: Record<string, Group>
    rounded: Record<string, string>
    spacing: Record<string, string>
    components: Record<string, Record<string, string>>
  }

  const light = front.colors
  const dark = parseDarkTable(markdown)
  for (const token of Object.keys(light)) {
    if (dark[token]) continue
    const fallback = DARK_FALLBACKS[token]
    const value = fallback ? dark[fallback] : undefined
    if (!value) throw new Error(`Dark theme has no value for token "${token}"`)
    dark[token] = value
  }
  for (const token of Object.keys(dark)) {
    if (!(token in light)) throw new Error(`Dark theme has an unknown token: "${token}"`)
  }

  const refs: Record<string, Record<string, Scalar>> = {
    colors: light,
    rounded: front.rounded,
    spacing: front.spacing,
  }
  const components: Record<string, Record<string, string>> = {}
  for (const [name, props] of Object.entries(front.components)) {
    const resolved: Record<string, string> = {}
    for (const [prop, value] of Object.entries(props)) {
      // Typography references stay as the style name ("title"), not as an object.
      resolved[prop] = resolveRef(String(value), refs)
    }
    components[name] = resolved
  }

  return {
    name: front.name,
    colors: { light, dark: sortLike(dark, light) },
    typography: front.typography,
    rounded: front.rounded,
    spacing: front.spacing,
    components,
  }
}

function parseDarkTable(markdown: string): Record<string, string> {
  const section = /## Dark theme\r?\n([\s\S]*?)(?=\r?\n## )/.exec(markdown)?.[1]
  if (!section) throw new Error('DESIGN.md has no "Dark theme" section')
  const dark: Record<string, string> = {}
  for (const line of section.split(/\r?\n/)) {
    const row = /^\|\s*([a-z0-9\s/-]+?)\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/.exec(line)
    if (!row?.[1] || !row[2]) continue
    for (const token of row[1].split('/')) dark[token.trim()] = row[2].toUpperCase()
  }
  return dark
}

function resolveRef(value: string, refs: Record<string, Record<string, Scalar>>): string {
  const ref = /^\{(\w+)\.([\w-]+)\}$/.exec(value)
  if (!ref?.[1] || !ref[2]) return value
  if (ref[1] === 'typography') return ref[2]
  const resolved = refs[ref[1]]?.[ref[2]]
  if (resolved === undefined) throw new Error(`Broken reference in DESIGN.md: ${value}`)
  return String(resolved)
}

function sortLike(target: Record<string, string>, order: Record<string, string>) {
  return Object.fromEntries(Object.keys(order).map((key) => [key, target[key] as string]))
}

function fontStack(family: string): string {
  return `"${family}", ${GENERIC_FAMILY[family] ?? 'sans-serif'}`
}

const HEADER =
  '/* Generated from DESIGN.md by `pnpm --filter design-tokens build`. Do not edit. */\n'

export function toCss(tokens: DesignTokens): string {
  const colorVars = (colors: Record<string, string>) =>
    Object.entries(colors).map(([k, v]) => `  --kamo-color-${k}: ${v};`)

  const staticVars = [
    ...Object.entries(tokens.rounded).map(([k, v]) => `  --kamo-radius-${k}: ${v};`),
    ...Object.entries(tokens.spacing).map(([k, v]) => `  --kamo-space-${k}: ${v};`),
    ...Object.entries(tokens.typography).flatMap(([k, t]) => [
      `  --kamo-font-${k}: ${fontStack(String(t.fontFamily))};`,
      `  --kamo-text-${k}-size: ${t.fontSize};`,
      `  --kamo-text-${k}-weight: ${t.fontWeight};`,
      `  --kamo-text-${k}-line-height: ${t.lineHeight};`,
      ...(t.letterSpacing ? [`  --kamo-text-${k}-letter-spacing: ${t.letterSpacing};`] : []),
    ]),
  ]

  // Inter stays in front of the CJK stacks so Latin letters and digits look the same everywhere.
  const cjk = Object.entries(CJK_STACKS).map(
    ([lang, stack]) => `:lang(${lang}) {\n  --kamo-font-cjk: ${stack};\n}`,
  )

  return [
    HEADER.trimEnd(),
    `:root,\n[data-theme='light'] {\n  color-scheme: light;\n${colorVars(tokens.colors.light).join('\n')}\n}`,
    `[data-theme='dark'] {\n  color-scheme: dark;\n${colorVars(tokens.colors.dark).join('\n')}\n}`,
    `@media (prefers-color-scheme: dark) {\n  [data-theme='system'] {\n    color-scheme: dark;\n${colorVars(
      tokens.colors.dark,
    )
      .map((l) => `  ${l}`)
      .join('\n')}\n  }\n}`,
    `:root {\n  --kamo-font-cjk: sans-serif;\n${staticVars.join('\n')}\n}`,
    ...cjk,
    // Redefined on every element with `lang`: an inherited variable carries the value already
    // resolved on the parent, and user content may be in a different language than the UI.
    `:root,\n[lang] {\n  --kamo-font-ui: "Inter", var(--kamo-font-cjk), sans-serif;\n}`,
    '',
  ].join('\n\n')
}

export function toTailwind(tokens: DesignTokens): string {
  const lines = [
    ...Object.keys(tokens.colors.light).map((k) => `  --color-${k}: var(--kamo-color-${k});`),
    ...Object.keys(tokens.rounded).map((k) => `  --radius-${k}: var(--kamo-radius-${k});`),
    ...Object.keys(tokens.spacing).map((k) => `  --spacing-${k}: var(--kamo-space-${k});`),
    `  --font-sans: var(--kamo-font-ui);`,
    `  --font-serif: "Instrument Serif", var(--kamo-font-cjk), serif;`,
    `  --font-mono: "JetBrains Mono", monospace;`,
    ...Object.keys(tokens.typography).flatMap((k) => [
      `  --text-${k}: var(--kamo-text-${k}-size);`,
      `  --text-${k}--line-height: var(--kamo-text-${k}-line-height);`,
      `  --text-${k}--font-weight: var(--kamo-text-${k}-weight);`,
    ]),
  ]
  return `${HEADER}@import './tokens.css';\n\n@theme inline {\n${lines.join('\n')}\n}\n`
}

export function toJs(tokens: DesignTokens): string {
  return `${HEADER.replace('/*', '//').replace(' */', '')}export const tokens = ${JSON.stringify(tokens, null, 2)}\n`
}

export function toDts(tokens: DesignTokens): string {
  return `${HEADER.replace('/*', '//').replace(' */', '')}export declare const tokens: ${typeLiteral(tokens, '')}\n`
}

function typeLiteral(value: unknown, indent: string): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return String(value)
  const inner = indent + '  '
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([k, v]) => `${inner}readonly ${JSON.stringify(k)}: ${typeLiteral(v, inner)}`,
  )
  return `{\n${entries.join('\n')}\n${indent}}`
}

export function generate(markdown: string): Record<string, string> {
  const tokens = parseDesign(markdown)
  return {
    'tokens.css': toCss(tokens),
    'tailwind.css': toTailwind(tokens),
    'tokens.js': toJs(tokens),
    'tokens.d.ts': toDts(tokens),
  }
}
