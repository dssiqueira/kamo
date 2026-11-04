// Microphones and cameras (E-01, A-03): the pickers' lists, the remembered choice, and opening
// a device with a fallback to the default one. Kept free of chrome.* so it is unit tested.

export interface DeviceOption {
  id: string
  /** Browser label; empty until the extension has the permission. */
  label: string
}

type DeviceInfo = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>

/**
 * The devices of one kind for a picker. Chrome adds 'default' (and on Windows 'communications')
 * aliases for microphones; the picker offers "Default" itself, so they are left out.
 */
export function deviceOptions(
  devices: readonly DeviceInfo[],
  kind: MediaDeviceKind,
): DeviceOption[] {
  return devices
    .filter((d) => d.kind === kind && d.deviceId !== '')
    .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d) => ({ id: d.deviceId, label: d.label }))
}

/** The remembered device when it is plugged in, else '' (the default). */
export function selectedDevice(options: readonly DeviceOption[], id: string): string {
  return options.some((option) => option.id === id) ? id : ''
}

/** The chosen device is gone (unplugged, or its id changed). Other errors are real failures. */
export function isDeviceGone(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'OverconstrainedError' || name === 'NotFoundError'
}

/**
 * Opens `deviceId` (exactly), or the default device when that one is gone. `fellBack` tells the
 * caller to say so. Any other failure (no permission, device busy) is thrown.
 */
export async function openWithFallback<T>(
  deviceId: string,
  open: (deviceId: string) => Promise<T>,
): Promise<{ stream: T; fellBack: boolean }> {
  if (!deviceId) return { stream: await open(''), fellBack: false }
  try {
    return { stream: await open(deviceId), fellBack: false }
  } catch (error) {
    if (!isDeviceGone(error)) throw error
    return { stream: await open(''), fellBack: true }
  }
}

/** `deviceId: { exact }` when a device is chosen; nothing (the default) otherwise. */
export function deviceConstraint(deviceId: string): { deviceId?: { exact: string } } {
  return deviceId ? { deviceId: { exact: deviceId } } : {}
}

/**
 * Webcam capture (A-03), as on desktop: 720p30 is plenty for a bubble, and `resizeMode: 'none'`
 * keeps the frame as the camera sends it (Chromium would otherwise crop a portrait camera to a
 * landscape band). The popup's preview asks for the same, so both share one device mode.
 */
export const CAMERA_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
  resizeMode: 'none',
} as const

/** About 19MB a minute at 720p30, as on desktop. */
export const CAMERA_BITRATE = 2_500_000

/**
 * A key frame every second. Chrome's MP4 recorder only writes a fragment at a key frame, and by
 * default that can be the whole take: a crash would leave an empty `webcam.mp4`. With 1s key
 * frames each 1s chunk is a playable fragment, like the WebM clusters of `screen.webm` (D-027).
 */
export const CAMERA_KEYFRAME_INTERVAL_MS = 1000

/**
 * Webcam formats, best first. MP4 (H.264, else VP9) matches the desktop's `webcam.mp4`
 * (docs/data-model.md); WebM is the last resort of a browser that records no MP4.
 */
export const CAMERA_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4;codecs=avc1',
  'video/mp4;codecs=vp9',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
] as const

export function pickCameraMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return CAMERA_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null
}

/** The project file the camera is written to, after its container. */
export function webcamFileFor(mimeType: string): 'webcam.mp4' | 'webcam.webm' {
  return mimeType.startsWith('video/mp4') ? 'webcam.mp4' : 'webcam.webm'
}
