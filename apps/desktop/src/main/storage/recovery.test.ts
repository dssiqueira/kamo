import { PROJECT_FILES, createProject, saveProject } from '@kamo/core'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileProjectStore } from './file-store.ts'
import {
  RECORDING_MARKER,
  clearRecordingMarker,
  findInterruptedRecordings,
  markRecordingStarted,
} from './recovery.ts'

const source = { kind: 'display', width: 1280, height: 720, scaleFactor: 1, fps: 30 } as const

let dir: string
let store: FileProjectStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-recovery-'))
  store = new FileProjectStore(join(dir, 'projects'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('findInterruptedRecordings', () => {
  it('finds nothing in an empty or missing folder', async () => {
    expect(await findInterruptedRecordings(store)).toEqual([])
  })

  it('reports a recording that crashed mid-stream (marker and partial, no project.json)', async () => {
    const id = 'crashed'
    await markRecordingStarted(store, id, { startedAt: '2026-11-03T10:00:00Z' })
    // what a crash mid-recording leaves: the streamed partial, no final file, no project.json
    await writeFile(join(store.projectDir(id), 'screen.mp4.partial'), new Uint8Array([1, 2, 3]))
    expect(await findInterruptedRecordings(store)).toEqual([id])
  })

  it('reports a leftover partial even without a marker', async () => {
    await store.writeText('orphan', PROJECT_FILES.events, '')
    await writeFile(join(store.projectDir('orphan'), 'screen.mp4.partial'), 'x')
    expect(await findInterruptedRecordings(store)).toEqual(['orphan'])
  })

  it('reports a marker next to a corrupted project.json', async () => {
    await markRecordingStarted(store, 'corrupt', { startedAt: '2026-11-03T10:00:00Z' })
    await store.writeText('corrupt', PROJECT_FILES.project, '{ half')
    expect(await findInterruptedRecordings(store)).toEqual(['corrupt'])
  })

  it('ignores a clean stop and a valid project with a stale marker', async () => {
    const clean = createProject({ name: 'Clean', source, durationMs: 5000 })
    await markRecordingStarted(store, clean.id, { startedAt: clean.createdAt })
    const writer = (await store.openWritable(clean.id, 'screen.mp4')).getWriter()
    await writer.write(new Uint8Array([1]))
    await writer.close()
    await saveProject(store, clean)
    await clearRecordingMarker(store, clean.id)
    expect(await store.readText(clean.id, RECORDING_MARKER)).toBeNull()

    const stale = createProject({ name: 'Stale', source, durationMs: 5000 })
    await markRecordingStarted(store, stale.id, { startedAt: stale.createdAt })
    await saveProject(store, stale)

    await store.writeText('plain', PROJECT_FILES.events, '')
    expect(await findInterruptedRecordings(store)).toEqual([])
  })
})
