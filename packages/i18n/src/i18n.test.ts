import { describe, expect, it } from 'vitest'
import { checkKeys } from './check-keys.ts'
import {
  LOCALES,
  changeLocale,
  createI18n,
  formatDuration,
  formatFileSize,
  formatProjectDate,
  formatTimecode,
  loadMessages,
  resolveLocale,
  type Messages,
} from './index.ts'

describe('keys', () => {
  it('every locale has the same keys and arguments as English', async () => {
    const locales: Record<string, Messages> = {}
    for (const locale of LOCALES) locales[locale] = await loadMessages(locale)
    expect(checkKeys(locales.en as Messages, locales)).toEqual([])
  })

  it('reports missing keys, renamed arguments and broken ICU', () => {
    const source = { a: 'Hi {name}', b: 'Bye', c: '{n, plural, other {#}}' }
    const errors = checkKeys(source, { xx: { a: 'Oi {nome}', c: '{n, plural, other {#}' } })
    expect(errors).toEqual([
      'xx: "a" is missing argument name',
      'xx: "a" has extra argument nome',
      'xx: missing key "b"',
      expect.stringContaining('xx: "c" is not valid ICU'),
    ])
  })
})

describe('createI18n', () => {
  it('formats ICU plurals in each language', async () => {
    const i18n = await createI18n('pt-BR')
    expect(i18n.t('project.count', { count: 0 })).toBe('Nenhum projeto ainda')
    expect(i18n.t('project.count', { count: 1 })).toBe('1 projeto')
    expect(i18n.t('project.count', { count: 3 })).toBe('3 projetos')
    await changeLocale(i18n, 'ja')
    expect(i18n.t('project.count', { count: 3 })).toBe('3 件のプロジェクト')
  })

  it('default project name uses the locale date format (I-4)', async () => {
    const i18n = await createI18n('pt-BR')
    const date = new Date(2026, 10, 3, 22, 38)
    expect(i18n.t('project.defaultName', { date: formatProjectDate('pt-BR', date) })).toBe(
      'Gravação 03/11, 22:38',
    )
  })
})

describe('resolveLocale', () => {
  it.each([
    [['pt-BR'], 'pt-BR'],
    [['pt-PT'], 'pt-BR'],
    [['es-MX'], 'es'],
    [['zh-TW'], 'zh-CN'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['ja-JP'], 'ja'],
    [['de-DE', 'es-ES'], 'de'],
    [['de-AT'], 'de'],
    [['fr-CA'], 'fr'],
    [['ko-KR'], 'ko'],
    [['it-IT', 'es-ES'], 'es'],
    [['it'], 'en'],
    [['not a locale'], 'en'],
    [[], 'en'],
  ])('%j → %s', (preferred, expected) => {
    expect(resolveLocale(preferred)).toBe(expected)
  })
})

describe('formatters', () => {
  it('timecode hh:mm:ss:ff', () => {
    expect(formatTimecode(0)).toBe('00:00:00:00')
    expect(formatTimecode(3_723_500)).toBe('01:02:03:15')
    expect(formatTimecode(999, 60)).toBe('00:00:00:59')
  })

  it('duration and file size via Intl', () => {
    expect(formatDuration('en', 125_000)).toBe('2m 5s')
    expect(formatFileSize('en', 150_000_000)).toBe('150 MB')
    expect(formatFileSize('en', 1_500)).toBe('1.5 kB')
  })
})
