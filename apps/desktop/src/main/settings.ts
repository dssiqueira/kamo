// App settings (docs/data-model.md: `app-data/settings.json`, Electron's userData folder).
// The file lives on the user's disk and may come from an older or newer Kamo: every field is
// validated on its own, a bad field falls back to its default, and unknown fields are kept.
import { CursorSettings, Style } from '@kamo/core'
import { LOCALES } from '@kamo/i18n'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import type { AppSettings, SettingsUpdate, StoredSettingsUpdate } from '../shared/api.ts'
import { TRANSCRIPTION_LANGUAGES, TRANSCRIPTION_PACK_IDS } from '../shared/packs.ts'
import { isValidAccelerator } from './accelerator.ts'
import { writeFileAtomic } from './storage/atomic.ts'

export const SETTINGS_VERSION = 1
export const SETTINGS_FILE = 'settings.json'

const DisplayId = z.string().min(1).max(256)
// A-08: what Home records (display, window or region), the last region and the last window.
const CaptureKind = z.enum(['display', 'window', 'region'])
const LastRegion = z.strictObject({
  displayId: DisplayId,
  rect: z.strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
})
const WindowId = z.string().regex(/^[0-9]{1,20}$/)
// F-15. Light is the default (DESIGN.md), so a missing theme means light.
const Theme = z.enum(['light', 'dark', 'system'])
// 'system' follows the OS language (D-021); a locale pins the UI language.
const Language = z.union([z.literal('system'), z.enum(LOCALES)])
// Folders are only ever set by main from a native folder dialog, never by the renderer.
const FolderPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => isAbsolute(path))
const Accelerator = z.string().refine(isValidAccelerator)
// MediaDeviceInfo.deviceId (an opaque hash); '' means the system default device.
const DeviceId = z.string().max(512)
const TranscriptionLanguageSchema = z.enum(TRANSCRIPTION_LANGUAGES)
// The pack that transcribes: only a transcription pack (not the compatibility one, D-040).
const PackIdSchema = z.enum(TRANSCRIPTION_PACK_IDS)
// Home's selected playlist (D-028): a playlist id, or '' for All.
const HomePlaylistId = z.union([z.literal(''), z.uuid()])
// A-01: the frame rate Home records at.
const RecordingFps = z.union([z.literal(30), z.literal(60)])

// `.catch(undefined)`: one broken field never resets the others.
const StoredSettings = z.looseObject({
  lastDisplayId: DisplayId.optional().catch(undefined),
  lastCaptureKind: CaptureKind.optional().catch(undefined),
  lastRegion: LastRegion.optional().catch(undefined),
  lastWindowId: WindowId.optional().catch(undefined),
  lastStyle: Style.optional().catch(undefined),
  lastCursor: CursorSettings.optional().catch(undefined),
  theme: Theme.optional().catch(undefined),
  language: Language.optional().catch(undefined),
  projectsDir: FolderPath.optional().catch(undefined),
  exportDir: FolderPath.optional().catch(undefined),
  stopShortcut: Accelerator.optional().catch(undefined),
  onboardingDone: z.boolean().optional().catch(undefined),
  // F-04 audio toggles and the chosen microphone (F-01: toggles are remembered).
  micEnabled: z.boolean().optional().catch(undefined),
  micDeviceId: DeviceId.optional().catch(undefined),
  micNoiseSuppression: z.boolean().optional().catch(undefined),
  systemAudioEnabled: z.boolean().optional().catch(undefined),
  // A-03 webcam toggle and the chosen camera ('' = the system default).
  cameraEnabled: z.boolean().optional().catch(undefined),
  cameraDeviceId: DeviceId.optional().catch(undefined),
  // F-15 close to tray, and whether its one-time notice was shown (main only).
  closeToTray: z.boolean().optional().catch(undefined),
  countdownSound: z.boolean().optional().catch(undefined),
  trayNoticeShown: z.boolean().optional().catch(undefined),
  // A-05 local transcription: automatic mode, language and which installed pack.
  autoTranscribe: z.boolean().optional().catch(undefined),
  transcriptionLanguage: TranscriptionLanguageSchema.optional().catch(undefined),
  transcriptionPack: PackIdSchema.optional().catch(undefined),
  homePlaylistId: HomePlaylistId.optional().catch(undefined),
  recordingFps: RecordingFps.optional().catch(undefined),
})

/**
 * What the renderer may change. Strict: anything else is a programming error. Folders and the
 * stop shortcut have their own IPC calls (native folder dialog; OS registration check).
 */
export const SettingsUpdateSchema = z.strictObject({
  lastDisplayId: DisplayId.optional(),
  lastCaptureKind: CaptureKind.optional(),
  lastRegion: LastRegion.optional(),
  lastWindowId: WindowId.optional(),
  lastStyle: Style.optional(),
  lastCursor: CursorSettings.optional(),
  theme: Theme.optional(),
  language: Language.optional(),
  onboardingDone: z.boolean().optional(),
  micEnabled: z.boolean().optional(),
  micDeviceId: DeviceId.optional(),
  micNoiseSuppression: z.boolean().optional(),
  systemAudioEnabled: z.boolean().optional(),
  cameraEnabled: z.boolean().optional(),
  cameraDeviceId: DeviceId.optional(),
  closeToTray: z.boolean().optional(),
  countdownSound: z.boolean().optional(),
  autoTranscribe: z.boolean().optional(),
  transcriptionLanguage: TranscriptionLanguageSchema.optional(),
  transcriptionPack: PackIdSchema.optional(),
  homePlaylistId: HomePlaylistId.optional(),
  recordingFps: RecordingFps.optional(),
})

/** Every field main may write: the renderer's plus folders, the shortcut and the tray notice. */
const StoredSettingsUpdateSchema = SettingsUpdateSchema.extend({
  projectsDir: FolderPath.optional(),
  exportDir: FolderPath.optional(),
  stopShortcut: Accelerator.optional(),
  trayNoticeShown: z.boolean().optional(),
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

/** Validates a main-side update; `null` values (reset to default) pass through. */
export function parseStoredSettingsUpdate(update: StoredSettingsUpdate): StoredSettingsUpdate {
  const entries = Object.entries(update)
  const values = Object.fromEntries(entries.filter(([, value]) => value !== null))
  const resets = Object.fromEntries(entries.filter(([, value]) => value === null))
  const result = StoredSettingsUpdateSchema.safeParse(values)
  if (!result.success) throw new SettingsError('invalid_settings')
  return { ...(result.data as StoredSettingsUpdate), ...resets }
}

/**
 * Applies an update. `null` removes a field (back to its default, e.g. resetting the
 * shortcut); `undefined` leaves it as it is.
 */
export function mergeSettings(
  current: StoredSettings,
  update: StoredSettingsUpdate,
): StoredSettings {
  const next: StoredSettings = { ...current, version: SETTINGS_VERSION }
  for (const [key, value] of Object.entries(update)) {
    if (value === null) delete next[key]
    else if (value !== undefined) next[key] = structuredClone(value)
  }
  return next
}

const PUBLIC_KEYS = [
  'lastDisplayId',
  'lastCaptureKind',
  'lastRegion',
  'lastWindowId',
  'lastStyle',
  'lastCursor',
  'theme',
  'language',
  'projectsDir',
  'exportDir',
  'stopShortcut',
  'onboardingDone',
  'micEnabled',
  'micDeviceId',
  'micNoiseSuppression',
  'systemAudioEnabled',
  'cameraEnabled',
  'cameraDeviceId',
  'closeToTray',
  'countdownSound',
  'trayNoticeShown',
  'autoTranscribe',
  'transcriptionLanguage',
  'transcriptionPack',
  'homePlaylistId',
  'recordingFps',
] as const satisfies readonly (keyof AppSettings)[]

/** Only the known fields go to the renderer. */
export function publicSettings(settings: StoredSettings): AppSettings {
  const result: Record<string, unknown> = { version: SETTINGS_VERSION }
  for (const key of PUBLIC_KEYS) {
    if (settings[key] !== undefined) result[key] = settings[key]
  }
  return result as unknown as AppSettings
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
  private readonly listeners = new Set<(settings: AppSettings) => void>()

  constructor(dir: string) {
    this.file = join(dir, SETTINGS_FILE)
  }

  async get(): Promise<AppSettings> {
    return publicSettings(await this.load())
  }

  /** Validated here too, so a bug in main cannot write a broken file. */
  async update(update: StoredSettingsUpdate): Promise<AppSettings> {
    const run = this.queue.then(async () => {
      const next = mergeSettings(await this.load(), parseStoredSettingsUpdate(update))
      await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`)
      this.current = Promise.resolve(next)
      const settings = publicSettings(next)
      for (const listener of this.listeners) {
        try {
          listener(settings)
        } catch {
          // A listener (window broadcast) must never fail a saved update.
        }
      }
      return settings
    })
    this.queue = run.catch(() => {})
    return run
  }

  /** Called after every saved update (main broadcasts it to the windows). */
  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private load(): Promise<StoredSettings> {
    // Missing on first run; anything else unreadable (permissions, a folder) also means
    // defaults: settings are conveniences and must never block the app.
    this.current ??= readFile(this.file, 'utf8').then(parseSettings, () => defaultSettings())
    return this.current
  }
}
