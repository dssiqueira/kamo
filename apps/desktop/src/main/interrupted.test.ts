import { PROJECT_FILES, createProject, parseEvents, parseProject, saveProject } from '@kamo/core'
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  RecoveryError,
  discardRecording,
  listInterruptedRecordings,
  playableMp4Length,
  recoverRecording,
  type RecoveryOptions,
} from './interrupted.ts'
import { FileProjectStore } from './storage/file-store.ts'
import { RECORDING_MARKER } from './storage/recovery.ts'

const STARTED_AT = '2026-11-03T10:00:00.000Z'
const SESSION_STARTED_AT = new Date('2026-11-04T08:00:00.000Z')

// Project ids are UUIDs (project.json schema).
const ID_OLDER = '00000000-0000-4000-8000-000000000001'
const ID_NEWER = '00000000-0000-4000-8000-000000000002'
const ID_EMPTY = '00000000-0000-4000-8000-000000000003'
const ID_NORMAL = '00000000-0000-4000-8000-000000000004'
const ID_CURRENT = '00000000-0000-4000-8000-000000000005'
const ID_CRASHED = '00000000-0000-4000-8000-000000000006'
const ID_CUT = '00000000-0000-4000-8000-000000000007'
const ID_BROKEN = '00000000-0000-4000-8000-000000000008'
const ID_TWICE = '00000000-0000-4000-8000-000000000009'
const ID_HALFWAY = '00000000-0000-4000-8000-000000000010'
const ID_MISSING = '00000000-0000-4000-8000-000000000011'

const options: RecoveryOptions = {
  sessionStartedAt: SESSION_STARTED_AT,
  projectName: (date) => `Recording ${date.toISOString()}`,
}

// A tiny but well-formed H.264 decoder config: the packets are never decoded, only indexed.
const SPS = [0x67, 0x42, 0x00, 0x1f, 0xe9, 0x02, 0x80, 0xf6, 0x40]
const PPS = [0x68, 0xce, 0x3c, 0x80]
const AVCC = new Uint8Array([
  1,
  0x42,
  0,
  0x1f,
  0xff,
  0xe1,
  0,
  SPS.length,
  ...SPS,
  1,
  0,
  PPS.length,
  ...PPS,
])

/**
 * 3s of 640×360 at 30fps as a fragmented MP4, like the native helper streams it:
 * ftyp, moov, six 0.5s moof+mdat fragments, mfra.
 */
async function fragmentedMp4(): Promise<Uint8Array> {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }),
    target,
  })
  const source = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { frameRate: 30 })
  await output.start()
  for (let i = 0; i < 90; i++) {
    const key = i % 15 === 0
    const data = new Uint8Array([0, 0, 0, 4, key ? 0x65 : 0x41, 1, 2, 3])
    await source.add(
      new EncodedPacket(data, key ? 'key' : 'delta', i / 30, 1 / 30),
      i === 0
        ? {
            decoderConfig: {
              codec: 'avc1.42001f',
              codedWidth: 640,
              codedHeight: 360,
              description: AVCC,
            },
          }
        : undefined,
    )
  }
  await output.finalize()
  return new Uint8Array(target.buffer!)
}

/** Top-level boxes: [type, offset, size]. */
function boxes(bytes: Uint8Array): [string, number, number][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: [string, number, number][] = []
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset)
    found.push([String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), offset, size])
    offset += size
  }
  return found
}

const EVENTS = [
  '{"t":0,"x":10,"y":10,"type":"move"}',
  '{"t":1200,"x":20,"y":20,"type":"down","button":"left"}',
  '{"t":1300,"x":20,"y":20,"type":"up","button":"left"}',
  // after the end of the video (its fragment was lost): dropped
  '{"t":3500,"x":30,"y":30,"type":"move"}',
  // cut short by the crash: skipped
  '{"t":3600,"x":3',
].join('\n')

let mp4: Uint8Array
let dir: string
let store: FileProjectStore

beforeAll(async () => {
  mp4 = await fragmentedMp4()
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-interrupted-'))
  store = new FileProjectStore(join(dir, 'projects'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** What a crash mid-recording leaves in the folder. */
async function crashed(
  id: string,
  { video = mp4, startedAt = STARTED_AT }: { video?: Uint8Array; startedAt?: string } = {},
): Promise<string> {
  const folder = store.projectDir(id)
  await mkdir(join(folder, 'frames'), { recursive: true })
  await writeFile(
    join(folder, RECORDING_MARKER),
    JSON.stringify({ startedAt, appVersion: '0.0.0' }),
  )
  await writeFile(join(folder, 'screen.mp4.partial'), video)
  await writeFile(join(folder, 'events.jsonl.partial'), EVENTS)
  await writeFile(join(folder, 'frames', '0000.jpg'), new Uint8Array([0xff, 0xd8]))
  return folder
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return error instanceof RecoveryError ? error.code : String(error)
  }
  return undefined
}

describe('playableMp4Length', () => {
  it('keeps a complete file whole and cuts a fragment the crash left half-written', async () => {
    const file = join(dir, 'video.mp4')
    await writeFile(file, mp4)
    expect(await playableMp4Length(file)).toBe(mp4.length)

    const lastMdat = boxes(mp4).findLast(([type]) => type === 'mdat')!
    const lastMoof = boxes(mp4).findLast(([type]) => type === 'moof')!
    await writeFile(file, mp4.subarray(0, lastMdat[1] + 20))
    expect(await playableMp4Length(file)).toBe(lastMoof[1])
  })

  it('is 0 when the header itself is incomplete', async () => {
    const file = join(dir, 'video.mp4')
    const moov = boxes(mp4).find(([type]) => type === 'moov')!
    await writeFile(file, mp4.subarray(0, moov[1] + 100))
    expect(await playableMp4Length(file)).toBe(0)
  })
})

describe('listInterruptedRecordings', () => {
  it('lists recordings with a video, newest first, with their start and size', async () => {
    await crashed(ID_OLDER, { startedAt: '2026-11-01T10:00:00.000Z' })
    await crashed(ID_NEWER, { startedAt: '2026-11-02T10:00:00.000Z' })
    // marker only: the start failed before any video was written
    await mkdir(store.projectDir(ID_EMPTY), { recursive: true })
    await writeFile(
      join(store.projectDir(ID_EMPTY), RECORDING_MARKER),
      `{"startedAt":"${STARTED_AT}"}`,
    )
    // a normal project
    await saveProject(
      store,
      createProject({
        id: ID_NORMAL,
        name: 'Normal',
        durationMs: 2000,
        source: { kind: 'display', width: 640, height: 360, scaleFactor: 1, fps: 30 },
      }),
    )

    expect(await listInterruptedRecordings(store, options)).toEqual([
      { projectId: ID_NEWER, startedAt: '2026-11-02T10:00:00.000Z', sizeBytes: mp4.length },
      { projectId: ID_OLDER, startedAt: '2026-11-01T10:00:00.000Z', sizeBytes: mp4.length },
    ])
  })

  it('leaves out a recording of the running session (it may still be going)', async () => {
    await crashed(ID_CURRENT, { startedAt: '2026-11-04T09:00:00.000Z' })
    expect(await listInterruptedRecordings(store, options)).toEqual([])
    expect(await codeOf(recoverRecording(store, ID_CURRENT, options))).toBe('not_interrupted')
    expect(await codeOf(discardRecording(store, ID_CURRENT, options))).toBe('not_interrupted')
  })
})

describe('recoverRecording', () => {
  it('turns the leftovers into a project that opens', async () => {
    const folder = await crashed(ID_CRASHED)
    const project = await recoverRecording(store, ID_CRASHED, options)

    expect(project).toMatchObject({
      id: ID_CRASHED,
      name: `Recording ${STARTED_AT}`,
      createdAt: STARTED_AT,
      durationMs: 3000,
      trim: { startMs: 0, endMs: 3000 },
      source: { kind: 'display', width: 640, height: 360, scaleFactor: 1, fps: 30 },
    })
    const json = await store.readText(ID_CRASHED, PROJECT_FILES.project)
    expect(parseProject(json!)).toEqual(project)

    expect(await readFile(join(folder, 'screen.mp4'))).toEqual(Buffer.from(mp4))
    const { events, skippedLines } = parseEvents(
      (await store.readText(ID_CRASHED, PROJECT_FILES.events))!,
    )
    expect(events.map((e) => e.t)).toEqual([0, 1200, 1300])
    expect(skippedLines).toEqual([])

    expect((await readdir(folder)).sort()).toEqual([
      'events.jsonl',
      'frames',
      'project.json',
      'screen.mp4',
    ])
    expect(await listInterruptedRecordings(store, options)).toEqual([])
  })

  it('keeps the complete fragments of a video cut mid-fragment', async () => {
    const lastMdat = boxes(mp4).findLast(([type]) => type === 'mdat')!
    const lastMoof = boxes(mp4).findLast(([type]) => type === 'moof')!
    const folder = await crashed(ID_CUT, { video: mp4.subarray(0, lastMdat[1] + 20) })

    const project = await recoverRecording(store, ID_CUT, options)
    expect(project.durationMs).toBe(2500)
    expect((await stat(join(folder, 'screen.mp4'))).size).toBe(lastMoof[1])
    const { events } = parseEvents((await store.readText(ID_CUT, PROJECT_FILES.events))!)
    expect(events.map((e) => e.t)).toEqual([0, 1200, 1300])
  })

  it('reports unrecoverable and changes nothing when there is no playable video', async () => {
    const moov = boxes(mp4).find(([type]) => type === 'moov')!
    const folder = await crashed(ID_BROKEN, { video: mp4.subarray(0, moov[1] + 100) })
    const before = (await readdir(folder)).sort()

    expect(await codeOf(recoverRecording(store, ID_BROKEN, options))).toBe('unrecoverable')
    expect((await readdir(folder)).sort()).toEqual(before)
    expect(await exists(join(folder, RECORDING_MARKER))).toBe(true)
    // still offered, so it can be discarded
    expect((await listInterruptedRecordings(store, options)).map((r) => r.projectId)).toEqual([
      ID_BROKEN,
    ])
  })

  it('is idempotent: twice in a row, and after a recovery that stopped halfway', async () => {
    await crashed(ID_TWICE)
    const [first, second] = await Promise.allSettled([
      recoverRecording(store, ID_TWICE, options),
      recoverRecording(store, ID_TWICE, options),
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status === 'rejected' && (second.reason as RecoveryError).code).toBe(
      'not_interrupted',
    )

    // stopped after renaming the video: screen.mp4 + marker + events partial, no project.json
    const folder = await crashed(ID_HALFWAY)
    await rm(join(folder, 'screen.mp4.partial'))
    await writeFile(join(folder, 'screen.mp4'), mp4)
    const project = await recoverRecording(store, ID_HALFWAY, options)
    expect(project.durationMs).toBe(3000)
    expect(await exists(join(folder, RECORDING_MARKER))).toBe(false)
  })

  it('refuses folders that are not interrupted recordings', async () => {
    expect(await codeOf(recoverRecording(store, ID_MISSING, options))).toBe('not_interrupted')
    expect(await codeOf(recoverRecording(store, 42, options))).toBe('not_interrupted')
    expect(await codeOf(recoverRecording(store, '../escape', options))).toMatch(/UnsafePathError/)
  })
})

describe('discardRecording', () => {
  it('moves an interrupted recording to the trash and nothing else', async () => {
    const trashed: string[] = []
    store = new FileProjectStore(join(dir, 'projects'), {
      trash: async (path) => {
        trashed.push(path)
        await rm(path, { recursive: true, force: true })
      },
    })
    const folder = await crashed(ID_CRASHED)
    await discardRecording(store, ID_CRASHED, options)
    expect(trashed).toEqual([folder])
    expect(await exists(folder)).toBe(false)

    await saveProject(
      store,
      createProject({
        id: ID_NORMAL,
        name: 'Normal',
        durationMs: 2000,
        source: { kind: 'display', width: 640, height: 360, scaleFactor: 1, fps: 30 },
      }),
    )
    expect(await codeOf(discardRecording(store, ID_NORMAL, options))).toBe('not_interrupted')
    expect(await exists(store.projectDir(ID_NORMAL))).toBe(true)
  })
})
