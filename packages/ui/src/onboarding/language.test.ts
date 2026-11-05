import { LOCALES, resolveLocale } from '@kamo/i18n'
import { describe, expect, it } from 'vitest'
import {
  initialLanguage,
  languageKeyCommand,
  languageSetting,
  moveLanguage,
  systemLanguage,
} from './language.ts'

describe('systemLanguage', () => {
  it('maps the OS language list to one Kamo speaks', () => {
    expect(systemLanguage(['pt-BR', 'en-US'])).toBe('pt-BR')
    expect(systemLanguage(['pt-PT'])).toBe('pt-BR')
    expect(systemLanguage(['zh-TW', 'en-US'])).toBe('zh-CN')
    expect(systemLanguage(['ja-JP'])).toBe('ja')
    expect(systemLanguage(['es-419'])).toBe('es')
    expect(systemLanguage(['en-GB'])).toBe('en')
    // A second preference counts too, like the UI language itself.
    expect(systemLanguage(['de-DE', 'es-ES'])).toBe('es')
  })

  it('is undefined when the OS speaks none of the five', () => {
    expect(systemLanguage(['de-DE', 'fr-FR'])).toBeUndefined()
    expect(systemLanguage([])).toBeUndefined()
    expect(systemLanguage(['not a tag'])).toBeUndefined()
  })
})

describe('initialLanguage', () => {
  it('preselects the system language when Kamo speaks it', () => {
    expect(initialLanguage(undefined, 'pt-BR')).toBe('pt-BR')
    expect(initialLanguage('system', 'ja')).toBe('ja')
    expect(initialLanguage(undefined, systemLanguage(['zh-TW', 'en-US']))).toBe('zh-CN')
    // The same language the app's UI starts in (boot resolves the OS list the same way).
    expect(initialLanguage(undefined, systemLanguage(['pt-PT']))).toBe(resolveLocale(['pt-PT']))
  })

  it('falls back to English for any other system language', () => {
    expect(initialLanguage(undefined, systemLanguage(['fr-FR', 'de-DE']))).toBe('en')
    expect(initialLanguage(undefined, 'de')).toBe('en')
    expect(initialLanguage(undefined, undefined)).toBe('en')
  })

  it('keeps a language already saved (Kamo closed during the onboarding)', () => {
    expect(initialLanguage('ja', 'pt-BR')).toBe('ja')
    expect(initialLanguage('es', 'de')).toBe('es')
  })
})

describe('languageSetting', () => {
  it("saves 'system' when the system's language is kept", () => {
    expect(languageSetting('pt-BR', 'pt-BR')).toBe('system')
    expect(languageSetting('en', 'en')).toBe('system')
  })

  it('saves the locale when another one is picked', () => {
    expect(languageSetting('ja', 'pt-BR')).toBe('ja')
    // A system language Kamo doesn't speak: even English is an explicit choice.
    expect(languageSetting('en', 'de')).toBe('en')
    expect(languageSetting('es', undefined)).toBe('es')
  })
})

describe('languageKeyCommand', () => {
  it('moves with the arrows, jumps with Home and End and continues with Enter', () => {
    expect(languageKeyCommand('ArrowDown')).toBe('next')
    expect(languageKeyCommand('ArrowRight')).toBe('next')
    expect(languageKeyCommand('ArrowUp')).toBe('previous')
    expect(languageKeyCommand('ArrowLeft')).toBe('previous')
    expect(languageKeyCommand('Home')).toBe('first')
    expect(languageKeyCommand('End')).toBe('last')
    expect(languageKeyCommand('Enter')).toBe('continue')
    expect(languageKeyCommand('Enter', { onChoice: true, onControl: true })).toBe('continue')
    expect(languageKeyCommand('a')).toBeNull()
  })

  it('leaves other buttons their own keys and ignores held keys', () => {
    expect(languageKeyCommand('Enter', { onControl: true })).toBeNull()
    expect(languageKeyCommand('ArrowDown', { onControl: true })).toBeNull()
    expect(languageKeyCommand('ArrowDown', { repeat: true })).toBeNull()
  })
})

describe('moveLanguage', () => {
  it('follows the launch languages in order and wraps around', () => {
    expect(LOCALES).toEqual(['en', 'pt-BR', 'es', 'zh-CN', 'ja'])
    expect(moveLanguage('en', 'next')).toBe('pt-BR')
    expect(moveLanguage('ja', 'next')).toBe('en')
    expect(moveLanguage('en', 'previous')).toBe('ja')
    expect(moveLanguage('es', 'first')).toBe('en')
    expect(moveLanguage('es', 'last')).toBe('ja')
  })
})
