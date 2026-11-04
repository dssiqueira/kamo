// What the popup remembers between recordings (chrome.storage.local, data-model.md "In the
// extension"). Nothing here ever leaves the browser.

export interface Preferences {
  microphone: boolean
  /** Microphone to record; '' follows the browser's default one. */
  microphoneId: string
  tabAudio: boolean
  /** Webcam bubble (A-03): off by default. */
  camera: boolean
  /** Camera to record; '' follows the browser's default one. */
  cameraId: string
}

const KEY = 'kamo.preferences'
export const DEFAULT_PREFERENCES: Preferences = {
  microphone: false,
  microphoneId: '',
  tabAudio: true,
  camera: false,
  cameraId: '',
}

/** Stored preferences from any earlier version (or garbage) become a complete, valid set. */
export function normalizePreferences(stored: unknown): Preferences {
  const raw =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  const flag = (key: 'microphone' | 'tabAudio' | 'camera') =>
    typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_PREFERENCES[key]
  const id = (key: 'microphoneId' | 'cameraId') => (typeof raw[key] === 'string' ? raw[key] : '')
  return {
    microphone: flag('microphone'),
    microphoneId: id('microphoneId'),
    tabAudio: flag('tabAudio'),
    camera: flag('camera'),
    cameraId: id('cameraId'),
  }
}

export async function loadPreferences(): Promise<Preferences> {
  return normalizePreferences((await chrome.storage.local.get(KEY))[KEY])
}

export async function savePreferences(change: Partial<Preferences>): Promise<Preferences> {
  const next = normalizePreferences({ ...(await loadPreferences()), ...change })
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

/** A device the extension asks for once, on permission.html (E-01, A-03). */
export type MediaDevice = 'microphone' | 'camera'

/** The extension origin's permission for `device` (granted once on permission.html). */
export async function devicePermission(device: MediaDevice): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: device as PermissionName })
    return status.state
  } catch {
    return 'prompt'
  }
}
