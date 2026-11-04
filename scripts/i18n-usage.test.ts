import { describe, expect, it } from 'vitest'
import { findMissingKeys, flattenKeys, isUiSource } from './i18n-usage.ts'

const keys = flattenKeys({
  home: { record: 'Record', displays: 'Screen' },
  recording: { errors: { lowDisk: 'Low disk' } },
})

const missing = (text: string) => findMissingKeys('x.tsx', text, keys).map((m) => m.key)

describe('i18n usage', () => {
  it('flattens nested messages', () => {
    expect([...keys]).toEqual(['home.record', 'home.displays', 'recording.errors.lowDisk'])
  })

  it('accepts keys that exist', () => {
    expect(missing('t(\'home.record\') + t("recording.errors.lowDisk", { x: 1 })')).toEqual([])
  })

  it('reports t() calls with unknown keys, in any namespace', () => {
    expect(missing("t('home.recrod'); i18n.t('export.title')")).toEqual([
      'home.recrod',
      'export.title',
    ])
  })

  it('reports key-shaped literals in known namespaces (lookup tables)', () => {
    expect(missing("const ERRORS = { low_disk: 'recording.errors.lowDsik' }")).toEqual([
      'recording.errors.lowDsik',
    ])
  })

  it('ignores unrelated dotted strings and runtime-built keys', () => {
    expect(
      missing("import x from 'node:fs'; const v = 'a.b'; t(`style.wallpapers.${id}`)"),
    ).toEqual([])
  })

  it('picks UI sources only', () => {
    expect(isUiSource('packages/ui/src/home/Home.tsx')).toBe(true)
    expect(isUiSource('apps/desktop/src/renderer/src/editor.tsx')).toBe(true)
    expect(isUiSource('packages/ui/src/home/pickDisplay.test.ts')).toBe(false)
    expect(isUiSource('apps/desktop/out/renderer/index.js')).toBe(false)
    expect(isUiSource('scripts/i18n-usage.ts')).toBe(false)
  })
})

describe('i18n usage: false positives', () => {
  it('skips comments, file names and main-process log events', () => {
    const text = [
      "// see 'recording.errors.nope' in docs",
      " * '{@link recording.lock}'",
      "store.readText(id, 'recording.lock')",
      "const file = 'project.json'",
    ].join('\n')
    expect(findMissingKeys('packages/ui/src/x.tsx', text, keys)).toEqual([])
    expect(
      findMissingKeys('apps/desktop/src/main/x.ts', "log.info('recording.started')", keys),
    ).toEqual([])
    expect(
      findMissingKeys('apps/desktop/src/main/x.ts', "i18n.t('home.nope')", keys).map((m) => m.key),
    ).toEqual(['home.nope'])
  })
})
