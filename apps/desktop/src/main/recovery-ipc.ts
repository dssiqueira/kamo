// Interrupted recordings IPC (F-02): Home lists them and recovers or discards each one.
// Recordings started after this process did belong to it (one may be running), so only earlier
// ones are offered.
import { app } from 'electron'
import { join } from 'node:path'
import { createI18n, formatProjectDate } from '@kamo/i18n'
import { IpcChannel } from '../shared/api.ts'
import { discardRecording, listInterruptedRecordings, recoverRecording } from './interrupted.ts'
import { AUDIO_TEMP_FOLDER, CAMERA_TEMP_FOLDER } from './media-takes.ts'
import { newProjectDefaults } from './new-project-defaults.ts'
import { uiLocale } from './preferences.ts'
import { getServices } from './services.ts'

type Handle = (channel: string, listener: (...args: unknown[]) => unknown) => void

/** Where the audio and camera takes wait to be attached (recovery follows the marker there). */
function mediaTempDirs() {
  const userData = app.getPath('userData')
  return { audio: join(userData, AUDIO_TEMP_FOLDER), camera: join(userData, CAMERA_TEMP_FOLDER) }
}

/** Call once at startup: the time of the call is when this app session started. */
export function registerRecovery(handle: Handle, options: { notifyProjectsChanged(): void }): void {
  const appStartedAt = new Date()

  handle(IpcChannel.listInterruptedRecordings, () =>
    listInterruptedRecordings(getServices().store, { sessionStartedAt: appStartedAt }),
  )
  handle(IpcChannel.recoverRecording, async (projectId) => {
    const { store, settings, log } = getServices()
    const locale = await uiLocale()
    const i18n = await createI18n(locale)
    const recovered = await recoverRecording(store, projectId, {
      sessionStartedAt: appStartedAt,
      mediaTemp: mediaTempDirs(),
      log,
      projectName: (date) =>
        i18n.t('project.defaultName', { date: formatProjectDate(locale, date) }),
      defaults: () => newProjectDefaults(settings),
    })
    log.info('recording.recovered', {
      durationMs: recovered.project.durationMs,
      audioWarnings: recovered.audioWarnings,
      cameraWarnings: recovered.cameraWarnings,
    })
    options.notifyProjectsChanged()
    return recovered
  })
  handle(IpcChannel.discardRecording, async (projectId) => {
    await discardRecording(getServices().store, projectId, {
      sessionStartedAt: appStartedAt,
      mediaTemp: mediaTempDirs(),
    })
    getServices().log.info('recording.discarded', { reason: 'interrupted' })
    options.notifyProjectsChanged()
  })
}
