// Pure pieces of the desktop camera (A-03): the source from settings, the file name, the
// permission policy and validation of what the recorder page sends. No Electron here, so it is
// tested in Node.
import { z } from 'zod'
import type { AppSettings } from '../../shared/api.ts'
import type { CameraReport, CameraSource } from '../../shared/camera.ts'

/** docs/data-model.md: the camera of a recording, next to screen.mp4. */
export const WEBCAM_FILE = 'webcam.mp4'

/** What the next recording captures: the Home toggle and camera saved in settings. */
export function cameraSourceFromSettings(settings: AppSettings): CameraSource {
  return {
    enabled: settings.cameraEnabled === true,
    deviceId: settings.cameraDeviceId ? settings.cameraDeviceId : null,
  }
}

/** Whether MediaRecorder gave WebM (the VP9 fallback), which main remuxes into MP4. */
export function isWebm(mimeType: string): boolean {
  return mimeType.startsWith('video/webm')
}

const Reason = z.enum(['denied', 'unavailable'])
const Size = z.number().int().nonnegative().max(16_384)

const CameraReportSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({
    type: z.literal('started'),
    at: z.number().int().positive(),
    mimeType: z.string().max(128),
    width: Size,
    height: Size,
  }),
  z.strictObject({ type: z.literal('failed'), reason: Reason }),
  z.strictObject({ type: z.literal('lost') }),
  z.strictObject({ type: z.literal('stopped') }),
])

/** Validates a report from the camera recorder page; null when it is malformed. */
export function parseCameraReport(value: unknown): CameraReport | null {
  const result = CameraReportSchema.safeParse(value)
  return result.success ? (result.data as CameraReport) : null
}

/**
 * Permission policy (rule 3: nothing more than needed). The camera (`media` with video only,
 * never audio) is allowed to two pages: Home, for its live preview once the user turned the
 * camera on, and the hidden camera recorder page. Everything else stays denied.
 */
export function isCameraPermissionAllowed(query: {
  permission: string
  fromCameraPage: boolean
  mediaTypes?: readonly string[]
}): boolean {
  if (!query.fromCameraPage || query.permission !== 'media') return false
  const types = query.mediaTypes ?? []
  return types.length > 0 && types.every((type) => type === 'video')
}
