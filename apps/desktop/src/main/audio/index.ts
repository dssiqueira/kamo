// Desktop audio (F-04, D-024): one recorder service per app, plus what RecordingController
// needs to start it with the Home toggles and attach the result to the saved project.
import type { BrowserWindow } from 'electron'
import type { RecordingAudio } from '../recording-controller.ts'
import { getServices } from '../services.ts'
import { attachAudio } from './attach.ts'
import {
  AUDIO_SUPPORT,
  createAudioService,
  installAudioPermissions,
  registerAudioIpc,
} from './electron.ts'
import { audioSourcesFromSettings } from './model.ts'
import type { AudioService } from './service.ts'

export { AUDIO_SUPPORT, installAudioPermissions }

let service: AudioService | undefined
let mainWindowGetter: () => BrowserWindow | undefined = () => undefined

/** The app's audio service (created on first use, after `ready`). */
export function getAudioService(): AudioService {
  service ??= createAudioService({
    mainWindow: () => mainWindowGetter(),
    log: () => getServices().log,
  })
  return service
}

/** Call once, when the app is ready: IPC for Home and the recorder page. */
export function setupAudio(mainWindow: () => BrowserWindow | undefined): void {
  mainWindowGetter = mainWindow
  registerAudioIpc(getAudioService())
}

/** The Home toggles, as saved in settings (F-01). */
async function savedSources() {
  return audioSourcesFromSettings(await getServices().settings.get(), AUDIO_SUPPORT)
}

/** RecordingController's view of audio: starts with the saved toggles, attaches on save. */
export const recordingAudio: RecordingAudio = {
  async prepare() {
    await getAudioService().prepare(await savedSources())
  },
  cancel: () => getAudioService().restore(),
  async begin() {
    return getAudioService().begin(await savedSources())
  },
  attach(projectId, take, videoStartedAt) {
    const { store, log } = getServices()
    return attachAudio(
      { store, projectDir: store.projectDir(projectId), projectId, videoStartedAt, log },
      take,
    )
  },
}
