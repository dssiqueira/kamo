// What the popup remembers between recordings (chrome.storage.local, data-model.md "In the
// extension"). Nothing here ever leaves the browser.

export interface Preferences {
  microphone: boolean
  tabAudio: boolean
}

const KEY = 'kamo.preferences'
export const DEFAULT_PREFERENCES: Preferences = { microphone: false, tabAudio: true }

export async function loadPreferences(): Promise<Preferences> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<Preferences> | undefined
  return { ...DEFAULT_PREFERENCES, ...stored }
}

export async function savePreferences(change: Partial<Preferences>): Promise<Preferences> {
  const next = { ...(await loadPreferences()), ...change }
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

/** The microphone permission of the extension's origin (granted once on microphone.html). */
export async function microphonePermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state
  } catch {
    return 'prompt'
  }
}
