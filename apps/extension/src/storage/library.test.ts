import { createProject, parseProject, serializeProject, type Source } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { readLibrary } from './library.ts'
import { serializeMarker, type RecordingMarker } from './marker.ts'
import { MICROPHONE_FILE, RECORDING_MARKER, SCREEN_FILE } from './paths.ts'
import { RecoveryError, discardRecording, recoverRecording } from './recovery.ts'

/** Same contract as OpfsProjectStore, in memory (OPFS does not exist in Node). */
class FakeStore {
  readonly files = new Map<string, Map<string, Blob>>()

  async listProjectIds() {
    return [...this.files.keys()].sort()
  }
  async readBlob(id: string, path: string) {
    return this.files.get(id)?.get(path) ?? null
  }
  async readText(id: string, path: string) {
    return (await this.readBlob(id, path))?.text() ?? null
  }
  async writeText(id: string, path: string, text: string) {
    this.put(id, path, new Blob([text]))
  }
  async deleteProject(id: string) {
    this.files.delete(id)
  }
  async removeFile(id: string, path: string) {
    this.files.get(id)?.delete(path)
  }
  async fileSize(id: string, path: string) {
    return (await this.readBlob(id, path))?.size ?? null
  }
  put(id: string, path: string, blob: Blob) {
    if (!this.files.has(id)) this.files.set(id, new Map())
    this.files.get(id)?.set(path, blob)
  }
}

const ids = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  d: '00000000-0000-4000-8000-00000000000d',
}

const source: Source = { kind: 'tab', width: 1920, height: 1080, scaleFactor: 1.5, fps: 30 }

function marker(overrides: Partial<RecordingMarker> = {}): string {
  return serializeMarker({
    startedAt: '2026-11-04T10:00:00.000Z',
    name: 'Recording 04/11, 10:00',
    source,
    durationMs: 12_000,
    audio: { mic: true, system: true, micOffsetMs: -12 },
    ...overrides,
  })
}

function saveProject(store: FakeStore, id: string, createdAt: string) {
  const project = createProject({
    id,
    name: `P ${id.slice(-1)}`,
    source,
    durationMs: 5000,
    createdAt: new Date(createdAt),
  })
  store.put(id, 'project.json', new Blob([serializeProject(project)]))
}

describe('readLibrary', () => {
  it('lists the newest projects with their first thumbnail, and interrupted recordings', async () => {
    const store = new FakeStore()
    saveProject(store, ids.a, '2026-11-01T10:00:00.000Z')
    saveProject(store, ids.b, '2026-11-03T10:00:00.000Z')
    store.put(ids.b, 'frames/0000.jpg', new Blob(['jpg']))
    await store.writeText(ids.c, RECORDING_MARKER, marker())
    await store.writeText(ids.d, RECORDING_MARKER, marker()) // the recording in progress

    const library = await readLibrary(store, { limit: 1, activeProjectId: ids.d })

    expect(library.recent.map((p) => p.id)).toEqual([ids.b])
    expect(library.recent[0]?.thumbnail).not.toBeNull()
    expect(library.recent[0]).toMatchObject({ name: 'P b', durationMs: 5000 })
    expect(library.interrupted).toEqual([
      { projectId: ids.c, startedAt: '2026-11-04T10:00:00.000Z' },
    ])
  })

  it('leaves damaged projects and folders without a marker out', async () => {
    const store = new FakeStore()
    await store.writeText(ids.a, 'project.json', '{ not json')
    await store.writeText(ids.b, 'frames/0000.jpg', 'x')
    await store.writeText(ids.c, RECORDING_MARKER, 'garbage')
    expect(await readLibrary(store, { limit: 3 })).toEqual({ recent: [], interrupted: [] })
  })
})

describe('recoverRecording', () => {
  it('turns an interrupted recording into a valid project and clears the marker', async () => {
    const store = new FakeStore()
    await store.writeText(ids.a, RECORDING_MARKER, marker())
    store.put(ids.a, SCREEN_FILE, new Blob([new Uint8Array(100)]))
    store.put(ids.a, MICROPHONE_FILE, new Blob([new Uint8Array(10)]))

    const project = await recoverRecording(store, ids.a)

    const saved = parseProject((await store.readText(ids.a, 'project.json')) as string)
    expect(saved).toEqual(project)
    expect(saved).toMatchObject({
      id: ids.a,
      name: 'Recording 04/11, 10:00',
      createdAt: '2026-11-04T10:00:00.000Z',
      durationMs: 12_000,
      source,
      trim: { startMs: 0, endMs: 12_000 },
      audio: { mic: { enabled: true, offsetMs: -12 }, system: { enabled: true } },
    })
    expect(await store.readText(ids.a, RECORDING_MARKER)).toBeNull()
  })

  it('leaves the microphone off when its file never got any data', async () => {
    const store = new FakeStore()
    await store.writeText(ids.a, RECORDING_MARKER, marker())
    store.put(ids.a, SCREEN_FILE, new Blob([new Uint8Array(100)]))
    const project = await recoverRecording(store, ids.a)
    expect(project.audio.mic).toEqual({ enabled: false, volume: 1 })
  })

  it('refuses a recording with no video or under a second', async () => {
    const store = new FakeStore()
    await store.writeText(ids.a, RECORDING_MARKER, marker())
    await expect(recoverRecording(store, ids.a)).rejects.toEqual(new RecoveryError('unrecoverable'))
    await store.writeText(ids.b, RECORDING_MARKER, marker({ durationMs: 400 }))
    store.put(ids.b, SCREEN_FILE, new Blob([new Uint8Array(100)]))
    await expect(recoverRecording(store, ids.b)).rejects.toMatchObject({ code: 'unrecoverable' })
  })

  it('never touches a finished project', async () => {
    const store = new FakeStore()
    saveProject(store, ids.a, '2026-11-01T10:00:00.000Z')
    await expect(recoverRecording(store, ids.a)).rejects.toMatchObject({
      code: 'not_interrupted',
    })
    await expect(discardRecording(store, ids.a)).rejects.toMatchObject({
      code: 'not_interrupted',
    })
    expect(await store.readText(ids.a, 'project.json')).not.toBeNull()
  })

  it('discards an interrupted recording for good', async () => {
    const store = new FakeStore()
    await store.writeText(ids.a, RECORDING_MARKER, marker())
    await discardRecording(store, ids.a)
    expect(await store.listProjectIds()).toEqual([])
  })
})
