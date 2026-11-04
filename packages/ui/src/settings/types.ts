// Data Settings and the onboarding show. The UI does not know where it runs (rule 1): each app
// maps its own platform API onto these shapes.
import type { Locale } from '@kamo/i18n'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type LanguageChoice = 'system' | Locale
export type FolderKind = 'projects' | 'export'

export type PermissionKind = 'screen' | 'microphone' | 'camera' | 'inputMonitoring'

/**
 * Listed in Settings but never a first-run onboarding step: the camera is only asked for when
 * the user turns the webcam on (A-03).
 */
export const ONBOARDING_SKIPS: readonly PermissionKind[] = ['camera']
export type PermissionStatus = 'granted' | 'denied' | 'pending' | 'unknown'

export interface PermissionItem {
  kind: PermissionKind
  status: PermissionStatus
  /** Screen Recording: the onboarding cannot be skipped without it. */
  required: boolean
}

export type UpdateState =
  | { state: 'unsupported' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; checkedAt: number }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error' }

/**
 * Async actions resolve with an error code the UI explains (`busy`, `shortcut_taken`, ...),
 * or null when they worked.
 */
export type ActionResult = Promise<string | null>
