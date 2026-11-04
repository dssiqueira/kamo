import { DEFAULT_CURSOR, DEFAULT_STYLE } from '@kamo/core'
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
  publicSettings,
} from './settings.ts'

describe('parseSettings', () => {
  it('falls back to defaults when the file is missing, not JSON or not an object', () => {
    for (const text of [null, '', '{', '[]', '42', 'null']) {
      expect(parseSettings(text)).toEqual({ version: 1 })
    }
  })

  it('reads the known fields', () => {
    const text = JSON.stringify({
      version: 1,
      lastDisplayId: '42',
      lastStyle: DEFAULT_STYLE,
      lastCursor: DEFAULT_CURSOR,
    })
    expect(parseSettings(text)).toEqual({
      version: 1,
      lastDisplayId: '42',
      lastStyle: DEFAULT_STYLE,
      lastCursor: DEFAULT_CURSOR,
    })
  })

  it('drops only the invalid field and keeps the rest', () => {
    const text = JSON.stringify({
      lastDisplayId: 7,
      lastStyle: { ...DEFAULT_STYLE, padding: 99 },
      lastCursor: DEFAULT_CURSOR,
    })
    expect(parseSettings(text)).toEqual({ version: 1, lastCursor: DEFAULT_CURSOR })
  })

  it('keeps unknown fields from other versions, but never shows them to the renderer', () => {
    const settings = parseSettings(JSON.stringify({ version: 1, projectsDir: '/x', beta: true }))
    expect(settings).toMatchObject({ projectsDir: '/x', beta: true })
    expect(publicSettings(settings)).toEqual({ version: 1 })
  })
})

describe('parseSettingsUpdate', () => {
  it('accepts the known fields', () => {
    expect(parseSettingsUpdate({ lastDisplayId: '1', lastStyle: DEFAULT_STYLE })).toEqual({
      lastDisplayId: '1',
      lastStyle: DEFAULT_STYLE,
    })
  })

  it('rejects unknown fields, wrong types and invalid styles', () => {
    for (const update of [
      null,
      'x',
      { version: 2 },
      { projectsDir: '/etc' },
      { lastDisplayId: '' },
      { lastDisplayId: 1 },
      { lastStyle: { ...DEFAULT_STYLE, shadow: 'yes' } },
    ]) {
      expect(() => parseSettingsUpdate(update)).toThrow(SettingsError)
    }
  })
})

describe('mergeSettings', () => {
  it('replaces the given fields and keeps the others', () => {
    const current = { version: 1 as const, lastDisplayId: 'a', other: 1 }
    const next = mergeSettings(current, { lastStyle: DEFAULT_STYLE })
    expect(next).toEqual({ version: 1, lastDisplayId: 'a', other: 1, lastStyle: DEFAULT_STYLE })
    expect(next.lastStyle).not.toBe(DEFAULT_STYLE)
    expect(current).toEqual({ version: 1, lastDisplayId: 'a', other: 1 })
  })
})

describe('SettingsStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kamo-settings-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts with defaults and persists updates', async () => {
    const store = new SettingsStore(join(dir, 'app-data'))
    expect(await store.get()).toEqual({ version: 1 })
    await store.update({ lastDisplayId: '2' })
    await store.update({ lastCursor: DEFAULT_CURSOR })
    const reopened = new SettingsStore(join(dir, 'app-data'))
    expect(await reopened.get()).toEqual({
      version: 1,
      lastDisplayId: '2',
      lastCursor: DEFAULT_CURSOR,
    })
  })

  it('serializes concurrent updates', async () => {
    const store = new SettingsStore(dir)
    await Promise.all([
      store.update({ lastDisplayId: '1' }),
      store.update({ lastStyle: DEFAULT_STYLE }),
      store.update({ lastCursor: DEFAULT_CURSOR }),
    ])
    const saved = JSON.parse(await readFile(join(dir, SETTINGS_FILE), 'utf8'))
    expect(saved).toEqual({
      version: 1,
      lastDisplayId: '1',
      lastStyle: DEFAULT_STYLE,
      lastCursor: DEFAULT_CURSOR,
    })
  })

  it('keeps unknown fields on disk when it writes', async () => {
    await writeFile(join(dir, SETTINGS_FILE), JSON.stringify({ version: 1, future: 'x' }))
    const store = new SettingsStore(dir)
    await store.update({ lastDisplayId: '3' })
    const saved = JSON.parse(await readFile(join(dir, SETTINGS_FILE), 'utf8'))
    expect(saved).toEqual({ version: 1, future: 'x', lastDisplayId: '3' })
  })
})
