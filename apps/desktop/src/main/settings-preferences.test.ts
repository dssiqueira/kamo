// F-13/F-15 fields of settings.json: theme, language, folders, stop shortcut, onboarding.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SETTINGS_FILE,
  SettingsError,
  SettingsStore,
  mergeSettings,
  parseSettings,
  parseSettingsUpdate,
  parseStoredSettingsUpdate,
  publicSettings,
} from './settings.ts'

const folder = join(tmpdir(), 'Kamo Projects')

describe('settings.json preferences', () => {
  it('reads theme, language, folders, shortcut and onboarding', () => {
    const stored = {
      version: 1,
      theme: 'dark',
      language: 'pt-BR',
      projectsDir: folder,
      exportDir: folder,
      stopShortcut: 'CommandOrControl+Alt+S',
      onboardingDone: true,
    }
    const settings = parseSettings(JSON.stringify(stored))
    expect(settings).toEqual(stored)
    expect(publicSettings(settings)).toEqual(stored)
  })

  it('drops each invalid value on its own (an old or hand-edited file keeps working)', () => {
    const text = JSON.stringify({
      theme: 'sepia',
      language: 'de',
      projectsDir: 'relative/path',
      exportDir: '',
      stopShortcut: 'A',
      onboardingDone: 'yes',
      lastDisplayId: '7',
    })
    expect(parseSettings(text)).toEqual({ version: 1, lastDisplayId: '7' })
  })

  it('accepts every theme and every launch language plus system', () => {
    for (const theme of ['light', 'dark', 'system']) {
      expect(parseSettings(JSON.stringify({ theme }))).toEqual({ version: 1, theme })
    }
    for (const language of ['system', 'en', 'pt-BR', 'es', 'zh-CN', 'ja']) {
      expect(parseSettings(JSON.stringify({ language }))).toEqual({ version: 1, language })
    }
  })

  it('a file from before these fields existed migrates to the defaults', () => {
    const settings = parseSettings(JSON.stringify({ version: 1, lastDisplayId: '1' }))
    expect(settings).toEqual({ version: 1, lastDisplayId: '1' })
    // Absent fields mean: light, system language, default folders and shortcut, onboarding.
    expect(settings.theme).toBeUndefined()
    expect(settings.onboardingDone).toBeUndefined()
  })
})

describe('renderer updates', () => {
  it('may change theme, language and onboarding', () => {
    expect(parseSettingsUpdate({ theme: 'system', language: 'ja', onboardingDone: true })).toEqual({
      theme: 'system',
      language: 'ja',
      onboardingDone: true,
    })
  })

  it('may not set folders or the shortcut directly (dialog and OS check in main only)', () => {
    for (const update of [
      { projectsDir: folder },
      { exportDir: folder },
      { stopShortcut: 'CommandOrControl+Shift+3' },
      { theme: 'blue' },
      { language: 'fr' },
      { onboardingDone: 1 },
    ]) {
      expect(() => parseSettingsUpdate(update)).toThrow(SettingsError)
    }
  })
})

describe('main-side updates', () => {
  it('validates folders and shortcuts and lets null through as a reset', () => {
    expect(
      parseStoredSettingsUpdate({ projectsDir: folder, stopShortcut: null, exportDir: null }),
    ).toEqual({ projectsDir: folder, stopShortcut: null, exportDir: null })
    expect(() => parseStoredSettingsUpdate({ projectsDir: 'not/absolute' })).toThrow(SettingsError)
    expect(() => parseStoredSettingsUpdate({ stopShortcut: 'Shift+2' })).toThrow(SettingsError)
  })

  it('null removes the field (back to the default)', () => {
    const current = { version: 1 as const, stopShortcut: 'Alt+F9', theme: 'dark' as const }
    expect(mergeSettings(current, { stopShortcut: null })).toEqual({ version: 1, theme: 'dark' })
  })
})

describe('SettingsStore with preferences', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kamo-settings-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('saves, resets and notifies listeners', async () => {
    const store = new SettingsStore(dir)
    const seen: unknown[] = []
    store.onChange((settings) => seen.push(settings.theme))
    await store.update({ theme: 'dark', stopShortcut: 'Alt+F9' })
    await store.update({ stopShortcut: null })
    const saved = JSON.parse(await readFile(join(dir, SETTINGS_FILE), 'utf8'))
    expect(saved).toEqual({ version: 1, theme: 'dark' })
    expect(seen).toEqual(['dark', 'dark'])
  })

  it('refuses an invalid main-side write and leaves the file alone', async () => {
    await writeFile(join(dir, SETTINGS_FILE), JSON.stringify({ version: 1, theme: 'dark' }))
    const store = new SettingsStore(dir)
    await expect(store.update({ projectsDir: 'relative' })).rejects.toThrow(SettingsError)
    expect(await store.get()).toEqual({ version: 1, theme: 'dark' })
  })
})
