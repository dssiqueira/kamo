import { createProject, loadProject, saveProject } from '@kamo/core'
import type { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AudioSources, RecorderCommand } from '../../shared/audio.ts'
import { FileProjectStore } from '../storage/index.ts'
import { attachAudio } from './attach.ts'
import { AudioService } from './service.ts'

const quiet = { info: () => {}, warn: () => {}, error: () => {} }
const BOTH: AudioSources = { mic: true, micDeviceId: null, system: true }

/** Stands in for the hidden recorder window: records commands, says `ready` at once. */
class FakeWindow extends EventEmitter {
  destroyed = false
  commands: RecorderCommand[] = []
  readonly webContents = Object.assign(new EventEmitter(), {
    send: (_channel: string, command: RecorderCommand) => this.commands.push(command),
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

function makeService(system = true) {
  const statuses: unknown[] = []
  const service: AudioService = new AudioService({
    support: { system },
    tempDir: join(dir, 'tmp'),
    log: quiet,
    createWindow: () => {
      const window = new FakeWindow()
      windows.push(window)
      // the page loads and says ready
      queueMicrotask(() => service.handleReport({ type: 'ready' }))
      return window as unknown as BrowserWindow
    },
    onStatus: (status) => statuses.push(status),
    onLevels: () => {},
  })
  return { service, statuses }
}

const bytes = (...values: number[]) => new Uint8Array(values)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-audio-'))
  windows = []
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('AudioService', () => {
  it('opens the recorder for the Home meters and closes it when nothing is on', async () => {
    const { service } = makeService()
    await service.setMonitor({ mic: true, micDeviceId: 'usb', system: false })
    expect(windows[0]?.commands).toEqual([
      { type: 'configure', sources: { mic: true, micDeviceId: 'usb', system: false } },
    ])
    await service.setMonitor({ mic: false, micDeviceId: null, system: false })
    expect(windows[0]?.destroyed).toBe(true)
  })

  it('never asks for computer sound where it is unsupported', async () => {
    const { service } = makeService(false)
    await service.setMonitor(BOTH)
    expect(windows[0]?.commands[0]).toEqual({
      type: 'configure',
      sources: { mic: true, micDeviceId: null, system: false },
    })
  })

  it('records nothing when no source is on', async () => {
    const { service } = makeService()
    expect(await service.begin({ mic: false, micDeviceId: null, system: false })).toBeNull()
    expect(windows).toHaveLength(0)
  })

  it('streams chunks in order to one file per track, with the start time of each', async () => {
    const { service } = makeService()
    const session = await service.begin(BOTH)
    expect(session).not.toBeNull()
    const window = windows[0]
    expect(window?.commands).toEqual([{ type: 'start', sources: BOTH }])

    service.handleReport({ type: 'started', track: 'mic', at: 1000, mimeType: 'audio/mp4' })
    service.handleReport({ type: 'started', track: 'system', at: 1010, mimeType: 'audio/mp4' })
    await Promise.all([
      service.writeChunk('mic', bytes(1, 2)),
      service.writeChunk('mic', bytes(3)),
      service.writeChunk('system', bytes(9)),
    ])
    await session?.pause()
    await session?.resume()

    const stopping = session!.stop()
    await Promise.resolve()
    service.handleReport({ type: 'stopped', track: 'mic' })
    service.handleReport({ type: 'stopped', track: 'system' })
    const take = await stopping

    expect(window?.commands.map((c) => c.type)).toEqual(['start', 'pause', 'resume', 'stop'])
    expect(take.warnings).toEqual([])
    const mic = take.tracks.find((t) => t.track === 'mic')
    expect(mic).toMatchObject({ startedAt: 1000, mimeType: 'audio/mp4', bytes: 3 })
    expect([...(await readFile(mic!.path))]).toEqual([1, 2, 3])
    // nothing is on for Home: the devices are closed after the recording
    expect(window?.destroyed).toBe(true)
    await take.discard()
  })

  it('warns when the microphone is denied, and when it is unplugged mid-recording', async () => {
    const { service } = makeService()
    let session = await service.begin({ mic: true, micDeviceId: null, system: false })
    service.handleReport({ type: 'failed', track: 'mic', reason: 'denied' })
    let stopping = session!.stop()
    await Promise.resolve()
    service.handleReport({ type: 'stopped', track: 'mic' })
    let take = await stopping
    expect(take.tracks).toEqual([])
    expect(take.warnings).toEqual(['mic_unavailable'])

    session = await service.begin({ mic: true, micDeviceId: null, system: false })
    service.handleReport({ type: 'started', track: 'mic', at: 5, mimeType: 'audio/mp4' })
    await service.writeChunk('mic', bytes(7))
    service.handleReport({ type: 'lost', track: 'mic' })
    stopping = session!.stop()
    await Promise.resolve()
    service.handleReport({ type: 'stopped', track: 'mic' })
    take = await stopping
    // the file is kept (silence from the unplug on); Home warns
    expect(take.tracks).toHaveLength(1)
    expect(take.warnings).toEqual(['mic_lost'])
    await take.discard()
  })

  it('keeps what was written when the recorder page crashes', async () => {
    const { service } = makeService()
    const session = await service.begin({ mic: true, micDeviceId: null, system: false })
    service.handleReport({ type: 'started', track: 'mic', at: 5, mimeType: 'audio/mp4' })
    await service.writeChunk('mic', bytes(1, 2, 3))
    windows[0]?.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    const take = await session!.stop()
    expect(take.tracks[0]?.bytes).toBe(3)
    expect(take.warnings).toEqual(['audio_failed'])
    await take.discard()
  })
})

describe('attachAudio', () => {
  it('moves the tracks into the project and records their offsets (F-04 sync)', async () => {
    const store = new FileProjectStore(join(dir, 'projects'))
    const project = createProject({
      name: 'Demo',
      source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
      durationMs: 5000,
    })
    await saveProject(store, project)

    const { service } = makeService()
    const session = await service.begin(BOTH)
    service.handleReport({ type: 'started', track: 'mic', at: 10_000, mimeType: 'audio/mp4' })
    service.handleReport({
      type: 'started',
      track: 'system',
      at: 10_620,
      mimeType: 'audio/webm;codecs=opus',
    })
    await service.writeChunk('mic', bytes(1))
    await service.writeChunk('system', bytes(2))
    const stopping = session!.stop()
    await Promise.resolve()
    service.handleReport({ type: 'stopped', track: 'mic' })
    service.handleReport({ type: 'stopped', track: 'system' })
    const take = await stopping

    const warnings = await attachAudio(
      {
        store,
        projectDir: store.projectDir(project.id),
        projectId: project.id,
        videoStartedAt: 10_400,
        log: quiet,
      },
      take,
    )
    expect(warnings).toEqual([])
    const saved = await loadProject(store, project.id)
    expect(saved.audio).toEqual({
      mic: { enabled: true, volume: 1, offsetMs: -400 },
      system: { enabled: true, volume: 1, offsetMs: 220 },
    })
    const files = await readdir(store.projectDir(project.id))
    expect(files).toEqual(expect.arrayContaining(['audio.m4a', 'system.webm']))
    // the temp folder is gone
    expect(await readdir(join(dir, 'tmp'))).toEqual([])
  })

  it('reports a failure without throwing (the video is already safe)', async () => {
    const store = new FileProjectStore(join(dir, 'projects'))
    const { service } = makeService()
    const session = await service.begin({ mic: true, micDeviceId: null, system: false })
    service.handleReport({ type: 'started', track: 'mic', at: 1, mimeType: 'audio/mp4' })
    await service.writeChunk('mic', bytes(1))
    const stopping = session!.stop()
    await Promise.resolve()
    service.handleReport({ type: 'stopped', track: 'mic' })
    const missing = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    const warnings = await attachAudio(
      {
        store,
        projectDir: store.projectDir(missing),
        projectId: missing,
        videoStartedAt: 1,
        log: quiet,
      },
      await stopping,
    )
    expect(warnings).toEqual(['audio_failed'])
  })
})
