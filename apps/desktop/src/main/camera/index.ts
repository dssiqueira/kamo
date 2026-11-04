// Desktop camera (A-03): one recorder service per app, plus what RecordingController needs to
// start it with the Home toggle and attach the result to the saved project.
import type { RecordingCamera } from '../recording-controller.ts'
import { getServices } from '../services.ts'
import { attachWebcam } from './attach.ts'
import { createCameraService, isCameraPageUrl, registerCameraIpc } from './electron.ts'
import { cameraSourceFromSettings } from './model.ts'
import type { CameraService } from './service.ts'

export { isCameraPageUrl }

let service: CameraService | undefined

/** The app's camera service (created on first use, after `ready`). */
export function getCameraService(): CameraService {
  service ??= createCameraService({ log: () => getServices().log })
  return service
}

/** Call once, when the app is ready: IPC for Home and the recorder page. */
export function setupCamera(): void {
  registerCameraIpc(getCameraService())
}

/** The Home toggle, as saved in settings. */
async function savedSource() {
  return cameraSourceFromSettings(await getServices().settings.get())
}

/** RecordingController's view of the camera: starts with the saved toggle, attaches on save. */
export const recordingCamera: RecordingCamera = {
  async prepare() {
    await getCameraService().prepare(await savedSource())
  },
  cancel: () => getCameraService().restore(),
  async begin() {
    return getCameraService().begin(await savedSource())
  },
  attach(projectId, take, videoStartedAt) {
    const { store, log } = getServices()
    return attachWebcam(
      { store, projectDir: store.projectDir(projectId), projectId, videoStartedAt, log },
      take,
    )
  },
}
