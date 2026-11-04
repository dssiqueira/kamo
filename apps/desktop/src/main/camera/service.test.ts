import { createProject, loadProject, saveProject } from '@kamo/core'
import type { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CameraCommand, CameraSource } from '../../shared/camera.ts'
import { FileProjectStore } from '../storage/index.ts'
import { attachWebcam } from './attach.ts'
import { CameraService, type CameraSession } from './service.ts'

const quiet = { info: () => {}, warn: () => {}, error: () => {} }
const ON: CameraSource = { enabled: true, deviceId: null }
const STARTED = { type: 'started', mimeType: 'video/mp4', width: 1280, height: 720 } as const

/** Stands in for the hidden recorder window: records commands, says `ready` at once. */
class FakeWindow extends EventEmitter {
  destroyed = false
  commands: CameraCommand[] = []
  readonly webContents = Object.assign(new EventEmitter(), {
    send: (_channel: string, command: CameraCommand) => this.commands.push(command),
    setBackgroundThrottling: () => {},
  })
  isDestroyed() {
    return this.destroyed
  }
  destroy() {
    this.destroyed = true
    this.emit('closed')
  }
}

let dir: string
let windows: FakeWindow[]

function makeService() {
  const service: CameraService = new CameraService({
    tempDir: join(dir, 'tmp'),
    log: quiet,
    createWindow: () => {
      const window = new FakeWindow()
      windows.push(window)
      queueMicrotask(() => service.handleReport({ type: 'ready' }))
      return window as unknown as BrowserWindow
    },
  })
  return service
}

const bytes = (...values: number[]) => new Uint8Array(values)

/** Stops a session the way the recorder page does: `stopped` once the chunks are handed over. */
async function stopped(service: CameraService, session: CameraSession) {
  const stopping = session.stop()
  await Promise.resolve()
  service.handleReport({ type: 'stopped' })
  return stopping
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-camera-'))
  windows = []
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('CameraService', () => {
  it('records nothing and opens no window when the camera is off', async () => {
    const service = makeService()
    expect(await service.begin({ enabled: false, deviceId: 'cam' })).toBeNull()
    await service.prepare({ enabled: false, deviceId: null })
    expect(windows).toHaveLength(0)
  })

  it('opens the camera at the countdown and closes it when the countdown is cancelled', async () => {
    const service = makeService()
    await service.prepare({ enabled: true, deviceId: 'usb' })
    expect(windows[0]?.commands).toEqual([
      { type: 'prepare', source: { enabled: true, deviceId: 'usb' } },
    ])
    await service.restore()
    expect(windows[0]?.destroyed).toBe(true)
  })

  it('streams chunks in order to one file, with the start time, and turns the camera off', async () => {
    const service = makeService()
    const session = await service.begin(ON)
    const window = windows[0]
    expect(window?.commands).toEqual([{ type: 'start', source: ON }])

    service.handleReport({ ...STARTED, at: 1000 })
    await Promise.all([service.writeChunk(bytes(1, 2)), service.writeChunk(bytes(3))])
    await session?.pause()
    await session?.resume()
    const take = await stopped(service, session!)

    expect(window?.commands.map((c) => c.type)).toEqual(['start', 'pause', 'resume', 'stop'])
    expect(take.warnings).toEqual([])
    expect(take.video).toMatchObject({
      startedAt: 1000,
      mimeType: 'video/mp4',
      bytes: 3,
      width: 1280,
      height: 720,
    })
    expect([...(await readFile(take.video!.path))]).toEqual([1, 2, 3])
    // the camera light goes off with the recording
    expect(window?.destroyed).toBe(true)
    await take.discard()
  })

  it('warns when the camera is denied, and when it is unplugged mid-recording', async () => {
    const service = makeService()
    let session = await service.begin(ON)
    service.handleReport({ type: 'failed', reason: 'denied' })
    let take = await stopped(service, session!)
    expect(take.video).toBeNull()
    expect(take.warnings).toEqual(['camera_unavailable'])

    session = await service.begin(ON)
    service.handleReport({ ...STARTED, at: 5 })
    await service.writeChunk(bytes(7))
    service.handleReport({ type: 'lost' })
    take = await stopped(service, session!)
    // what was recorded up to the unplug is kept; Home warns
    expect(take.video?.bytes).toBe(1)
    expect(take.warnings).toEqual(['camera_lost'])
    await take.discard()
  })

  it('keeps what was written when the recorder page crashes', async () => {
    const service = makeService()
    const session = await service.begin(ON)
    service.handleReport({ ...STARTED, at: 5 })
    await service.writeChunk(bytes(1, 2, 3))
    windows[0]?.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    const take = await session!.stop()
    expect(take.video?.bytes).toBe(3)
    expect(take.warnings).toEqual(['camera_failed'])
    await take.discard()
  })
})

describe('attachWebcam', () => {
  async function savedProject(store: FileProjectStore) {
    const project = createProject({
      name: 'Demo',
      source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
      durationMs: 5000,
    })
    await saveProject(store, project)
    return project
  }

  it('moves webcam.mp4 into the project and turns the bubble on with its offset', async () => {
    const store = new FileProjectStore(join(dir, 'projects'))
    const project = await savedProject(store)
    const service = makeService()
    const session = await service.begin(ON)
    service.handleReport({ ...STARTED, at: 10_250 })
    await service.writeChunk(bytes(4, 5))
    const take = await stopped(service, session!)

    const target = {
      store,
      projectDir: store.projectDir(project.id),
      projectId: project.id,
      videoStartedAt: 10_400,
      log: quiet,
    }
    expect(await attachWebcam(target, take)).toEqual([])
    const saved = await loadProject(store, project.id)
    // the camera started 150ms before the first video frame
    expect(saved.webcam).toEqual({
      visible: true,
      position: 'bottom-right',
      size: 'medium',
      shrinkOnZoom: true,
      hidden: [],
      offsetMs: -150,
    })
    expect([...(await readFile(join(target.projectDir, 'webcam.mp4')))]).toEqual([4, 5])
    expect(await readdir(join(dir, 'tmp'))).toEqual([])
  })

  it('leaves the project without a camera when nothing was recorded', async () => {
    const store = new FileProjectStore(join(dir, 'projects'))
    const project = await savedProject(store)
    const service = makeService()
    const session = await service.begin(ON)
    service.handleReport({ type: 'failed', reason: 'unavailable' })
    const take = await stopped(service, session!)
    const target = {
      store,
      projectDir: store.projectDir(project.id),
      projectId: project.id,
      videoStartedAt: 1,
      log: quiet,
    }
    expect(await attachWebcam(target, take)).toEqual(['camera_unavailable'])
    expect((await loadProject(store, project.id)).webcam).toBeNull()
  })

  it('reports a WebM it cannot remux without throwing, and keeps no stray file', async () => {
    const store = new FileProjectStore(join(dir, 'projects'))
    const project = await savedProject(store)
    const service = makeService()
    const session = await service.begin(ON)
    service.handleReport({ ...STARTED, mimeType: 'video/webm;codecs=vp9', at: 1 })
    await service.writeChunk(bytes(1, 2, 3))
    const take = await stopped(service, session!)
    const target = {
      store,
      projectDir: store.projectDir(project.id),
      projectId: project.id,
      videoStartedAt: 1,
      log: quiet,
    }
    expect(await attachWebcam(target, take)).toEqual(['camera_failed'])
    expect((await loadProject(store, project.id)).webcam).toBeNull()
    expect(await readdir(target.projectDir)).not.toContain('webcam.mp4')
  })
})
