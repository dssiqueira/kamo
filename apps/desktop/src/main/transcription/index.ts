// Electron wiring for optional packs (A-07) and local transcription (A-05): the pack manager
// (downloads through Electron's net, only on a user action), the background transcription
// queue and their IPC. index.ts calls `registerTranscription` once and forwards saved
// recordings to it.
import { app, BrowserWindow, net } from 'electron'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/api.ts'
import { isPackId, PackError, PackManager } from '../packs/manager.ts'
import { manifestUrl, platformKey } from '../packs/config.ts'
import { setTranscriptState } from '../projects.ts'
import { getServices } from '../services.ts'
import { assertProjectId, freeDiskSpace } from '../storage/index.ts'
import { createAudioDecoder } from './decoder.ts'
import { PersistentQueue } from './queue.ts'
import { TranscriptionService } from './service.ts'
import { runWhisper, whisperCommand, whisperThreads } from './whisper.ts'

type Handle = (channel: string, listener: (...args: unknown[]) => unknown) => void

export interface TranscriptionWiring {
  packs: PackManager
  service: TranscriptionService
  /** After `ready`: resumes jobs a closed app left (no network involved). */
  start(): void
  /** RecordingController saved a recording (auto mode, A-05). */
  onRecordingSaved(projectId: string): void
}

function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, value)
  }
}

export function registerTranscription(options: {
  handle: Handle
  notifyProjectsChanged(): void
}): TranscriptionWiring {
  const { handle } = options
  const appData = app.getPath('userData')
  const log = {
    info: (event: string, data?: Record<string, unknown>) => getServices().log.info(event, data),
    warn: (event: string, data?: Record<string, unknown>) => getServices().log.warn(event, data),
  }
  const url = manifestUrl(process.env, { packaged: app.isPackaged })
  if (!app.isPackaged && url !== manifestUrl({}, { packaged: false })) {
    console.info(`kamo: packs manifest from ${url}`)
  }
  const packs = new PackManager({
    dir: join(appData, 'packs'),
    registryFile: join(appData, 'packs.json'),
    manifestUrl: url,
    platform: platformKey(),
    // The only network access of the app outside updates: always started by a user click.
    fetch: (input, init) => net.fetch(input, init),
    freeBytes: (dir) => freeDiskSpace(dir),
    log,
    chmodExecutables: process.platform !== 'win32',
  })
  const decoder = createAudioDecoder()
  const service = new TranscriptionService({
    store: () => getServices().store,
    packs,
    settings: async () => {
      const settings = await getServices().settings.get()
      return {
        ...(settings.autoTranscribe !== undefined
          ? { autoTranscribe: settings.autoTranscribe }
          : {}),
        ...(settings.transcriptionLanguage
          ? { transcriptionLanguage: settings.transcriptionLanguage }
          : {}),
        ...(settings.transcriptionPack ? { transcriptionPack: settings.transcriptionPack } : {}),
      }
    },
    queue: new PersistentQueue(join(appData, 'transcription-queue.json')),
    workRoot: join(appData, 'transcription'),
    cwd: appData,
    threads: whisperThreads(cpus().length),
    decode: (request, wav, signal, onProgress) => decoder.decode(request, wav, signal, onProgress),
    command: (entry) =>
      whisperCommand(entry, {
        // Unpackaged builds only: the fake pack's script stands in for whisper.cpp.
        allowScripts: !app.isPackaged,
        execPath: process.execPath,
        env: process.env,
      }),
    runWhisper: (run) => runWhisper(run),
    setTranscriptState: (projectId, state) =>
      setTranscriptState(getServices().store, projectId, state),
    onProjectChanged: () => options.notifyProjectsChanged(),
    log,
  })

  packs.onChange((status) => broadcast(IpcChannel.packsChanged, status))
  service.onChange((jobs) => broadcast(IpcChannel.transcriptionChanged, jobs))

  const packId = (value: unknown) => {
    if (!isPackId(value)) throw new PackError('unknown_pack')
    return value
  }

  handle(IpcChannel.getPacks, () => packs.status())
  handle(IpcChannel.refreshPacks, () => packs.refresh())
  // Install runs until done; the windows follow it through packsChanged.
  handle(IpcChannel.installPack, (id) => {
    void packs.install(packId(id))
  })
  handle(IpcChannel.pausePack, (id) => packs.pause(packId(id)))
  handle(IpcChannel.cancelPack, (id) => packs.cancel(packId(id)))
  handle(IpcChannel.removePack, (id) => packs.remove(packId(id)))
  handle(IpcChannel.getTranscriptionJobs, () => service.list())
  handle(IpcChannel.transcribeProject, async (projectId) => {
    assertProjectId(projectId as string)
    await service.enqueue(projectId as string)
  })
  handle(IpcChannel.cancelTranscription, async (projectId) => {
    assertProjectId(projectId as string)
    await service.cancel(projectId as string)
  })

  return {
    packs,
    service,
    start() {
      void service
        .resume()
        .catch((error: unknown) => log.warn('transcription.resume.failed', { error }))
    },
    onRecordingSaved(projectId) {
      void service
        .onRecordingSaved(projectId)
        .catch((error: unknown) => log.warn('transcription.auto.failed', { error }))
    },
  }
}
