// OS permissions for the onboarding (F-13) and Settings → Permissions (F-15).
// Mac: Screen Recording (mandatory), Microphone, Camera and, if the mouse tap still needs it,
// Input Monitoring. Windows: Microphone and Camera. The camera is listed (status and a shortcut
// to the system settings) but never asked for in the onboarding: only the webcam toggle asks
// for it (A-03).
import { execFile } from 'node:child_process'
import { app, desktopCapturer, shell, systemPreferences } from 'electron'
import type { PermissionInfo, PermissionKind, PermissionStatus } from '../shared/api.ts'
import { resolveHelperPath } from './capture/helper-path.ts'

/**
 * The Mac helper reads the mouse with an AppKit global monitor, which needs no Input Monitoring
 * (D-043; the Quartz tap it replaced did need it on macOS 26). Kept for the onboarding step and
 * its text (flows.md) in case a later macOS asks for it again.
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
 * Mac Screen Recording: the capture helper calls CGRequestScreenCaptureAccess (Electron has no
 * API for it), which adds Kamo to System Settings and shows the system dialog once. macOS
 * attributes the helper's request to Kamo, its responsible process. Resolves when the helper
 * exits; never rejects (a missing helper falls back to desktopCapturer).
 */
function requestScreenAccessWithHelper(helper: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(helper, ['--request-screen-access'], { timeout: 60_000 }, () => resolve())
  })
}

/**
 * Asks the OS when it has not decided yet (Mac shows its own prompt once). Windows has nothing
 * to ask: the switch lives in Settings.
 */
export async function requestPermission(kind: PermissionKind): Promise<void> {
  if (process.platform !== 'darwin') return
  if (kind === 'microphone' || kind === 'camera') {
    if (statusOf(kind) === 'pending') await systemPreferences.askForMediaAccess(kind)
    return
  }
  // Electron reports Screen Recording as only granted or denied (CGPreflightScreenCaptureAccess),
  // never not-determined, so ask whenever it is not granted: macOS shows its dialog once and
  // afterwards the request only keeps Kamo in the System Settings list.
  if (kind === 'screen' && statusOf(kind) !== 'granted') {
    const helper = resolveHelperPath({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    })
    if (helper) return requestScreenAccessWithHelper(helper)
    // Older macOS: asking for a source adds Kamo to the list and shows the dialog.
    await desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      .catch(() => [])
  }
}

export async function openPermissionSettings(kind: PermissionKind): Promise<void> {
  // Mac: Kamo only shows up in the Screen Recording list after it asked once, and the onboarding
  // never offers "Allow" for it (Electron never reports it as pending). Ask first, so the list
  // the user lands on has Kamo in it.
  if (process.platform === 'darwin' && kind === 'screen') await requestPermission(kind)
  const platform = process.platform === 'darwin' || process.platform === 'win32'
  const url = platform ? SETTINGS_URLS[process.platform as 'darwin' | 'win32'][kind] : undefined
  if (url) await shell.openExternal(url)
}
