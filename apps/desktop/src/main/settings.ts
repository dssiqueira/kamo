// App settings (docs/data-model.md: `app-data/settings.json`, Electron's userData folder).
// The file lives on the user's disk and may come from an older or newer Kamo: every field is
// validated on its own, a bad field falls back to its default, and unknown fields are kept.
import { CursorSettings, Style } from '@kamo/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { AppSettings, SettingsUpdate } from '../shared/api.ts'
import { writeFileAtomic } from './storage/atomic.ts'

export const SETTINGS_VERSION = 1
export const SETTINGS_FILE = 'settings.json'

const DisplayId = z.string().min(1).max(256)

// `.catch(undefined)`: one broken field never resets the others.
const StoredSettings = z.looseObject({
  lastDisplayId: DisplayId.optional().catch(undefined),
  lastStyle: Style.optional().catch(undefined),
  lastCursor: CursorSettings.optional().catch(undefined),
})

/** What the renderer may change. Strict: anything else is a programming error. */
export const SettingsUpdateSchema = z.strictObject({
  lastDisplayId: DisplayId.optional(),
  lastStyle: Style.optional(),
  lastCursor: CursorSettings.optional(),
})

/** Stored settings plus whatever unknown fields the file had (kept on write). */
export type StoredSettings = AppSettings & Record<string, unknown>

export function defaultSettings(): StoredSettings {
  return { version: SETTINGS_VERSION }
}

/** Parses settings.json text. Missing, unreadable or invalid → defaults, never throws. */
export function parseSettings(text: string | null): StoredSettings {
  if (text === null) return defaultSettings()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return defaultSettings()
  }
  const result = StoredSettings.safeParse(raw)
  if (!result.success) return defaultSettings()
  const settings: Record<string, unknown> = { ...result.data, version: SETTINGS_VERSION }
  for (const key of Object.keys(settings)) {
    if (settings[key] === undefined) delete settings[key]
  }
  return settings as StoredSettings
}

/** Validates an update from the renderer. Throws `SettingsError('invalid_settings')`. */
export function parseSettingsUpdate(update: unknown): SettingsUpdate {
  const result = SettingsUpdateSchema.safeParse(update)
  if (!result.success) throw new SettingsError('invalid_settings')
  return result.data as SettingsUpdate
}

export function mergeSettings(current: StoredSettings, update: SettingsUpdate): StoredSettings {
  const next: StoredSettings = { ...current, version: SETTINGS_VERSION }
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) next[key] = structuredClone(value)
  }
  return next
}

/** Only the known fields go to the renderer. */
export function publicSettings(settings: StoredSettings): AppSettings {
  return {
    version: SETTINGS_VERSION,
    ...(settings.lastDisplayId !== undefined ? { lastDisplayId: settings.lastDisplayId } : {}),
    ...(settings.lastStyle !== undefined ? { lastStyle: settings.lastStyle } : {}),
    ...(settings.lastCursor !== undefined ? { lastCursor: settings.lastCursor } : {}),
  }
}

export class SettingsError extends Error {
  constructor(readonly code: 'invalid_settings') {
    super(code)
    this.name = 'SettingsError'
  }
}

/** Reads once, then serves from memory; updates are serialized and written atomically. */
export class SettingsStore {
  readonly file: string
  private current: Promise<StoredSettings> | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(dir: string) {
    this.file = join(dir, SETTINGS_FILE)
  }

  async get(): Promise<AppSettings> {
    return publicSettings(await this.load())
  }

  async update(update: SettingsUpdate): Promise<AppSettings> {
    const run = this.queue.then(async () => {
      const next = mergeSettings(await this.load(), update)
      await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`)
      this.current = Promise.resolve(next)
      return publicSettings(next)
    })
    this.queue = run.catch(() => {})
    return run
  }

  private load(): Promise<StoredSettings> {
    // Missing on first run; anything else unreadable (permissions, a folder) also means
    // defaults: settings are conveniences and must never block the app.
    this.current ??= readFile(this.file, 'utf8').then(parseSettings, () => defaultSettings())
    return this.current
  }
}
