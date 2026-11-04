// OS permissions for the onboarding (F-13) and Settings → Permissions (F-15).
// Mac: Screen Recording (mandatory), Microphone, Camera and, if the mouse tap still needs it,
// Input Monitoring. Windows: Microphone and Camera. The camera is listed (status and a shortcut
// to the system settings) but never asked for in the onboarding: only the webcam toggle asks
// for it (A-03).
import { desktopCapturer, shell, systemPreferences } from 'electron'
import type { PermissionInfo, PermissionKind, PermissionStatus } from '../shared/api.ts'

/**
 * TODO(F-13): whether the Mac mouse tap needs Input Monitoring is still unverified (step 3).
 * Electron has no API to read that status, so it would show as `unknown` with a shortcut to
 * System Settings. Flip to true only if the helper's mouse tap turns out to need it.
 */
export const needsInputMonitoring = false

// Fixed URLs only: nothing from the renderer ever reaches openExternal.
const SETTINGS_URLS: Record<'darwin' | 'win32', Partial<Record<PermissionKind, string>>> = {
  darwin: {
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  },
  win32: {
    microphone: 'ms-settings:privacy-microphone',
    camera: 'ms-settings:privacy-webcam',
  },
}

/** Which permissions this OS asks for, in onboarding order (the camera comes last). */
export function permissionKinds(platform: NodeJS.Platform = process.platform): PermissionKind[] {
  if (platform === 'darwin') {
    return [
      'screen',
      'microphone',
      ...(needsInputMonitoring ? ['inputMonitoring' as const] : []),
      'camera',
    ]
  }
  if (platform === 'win32') return ['microphone', 'camera']
  return []
}

export function toPermissionStatus(status: string): PermissionStatus {
  if (status === 'granted') return 'granted'
  if (status === 'denied' || status === 'restricted') return 'denied'
  if (status === 'not-determined') return 'pending'
  return 'unknown'
}

function statusOf(kind: PermissionKind): PermissionStatus {
  if (kind === 'inputMonitoring') return 'unknown'
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'unknown'
  try {
    return toPermissionStatus(systemPreferences.getMediaAccessStatus(kind))
  } catch {
    return 'unknown'
  }
}

export function listPermissions(): PermissionInfo[] {
  return permissionKinds().map((kind) => ({
    kind,
    status: statusOf(kind),
    required: kind === 'screen',
  }))
}

export function isPermissionKind(value: unknown): value is PermissionKind {
  return (
    value === 'screen' ||
    value === 'microphone' ||
    value === 'camera' ||
    value === 'inputMonitoring'
  )
}

/**
 * Asks the OS when it has not decided yet (Mac shows its own prompt once). Screen Recording has
 * no prompt API in Electron: asking for a source makes macOS add Kamo to the list and show its
 * dialog. Windows has nothing to ask: the switch lives in Settings.
 */
export async function requestPermission(kind: PermissionKind): Promise<void> {
  if (process.platform !== 'darwin' || statusOf(kind) !== 'pending') return
  if (kind === 'microphone' || kind === 'camera') await systemPreferences.askForMediaAccess(kind)
  if (kind === 'screen') {
    await desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      .catch(() => [])
  }
}

export async function openPermissionSettings(kind: PermissionKind): Promise<void> {
  const platform = process.platform === 'darwin' || process.platform === 'win32'
  const url = platform ? SETTINGS_URLS[process.platform as 'darwin' | 'win32'][kind] : undefined
  if (url) await shell.openExternal(url)
}
