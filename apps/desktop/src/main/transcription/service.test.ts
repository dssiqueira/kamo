import {
  PROJECT_FILES,
  createProject,
  loadProject,
  parseTranscript,
  saveProject,
  streamSpeechPcm,
  wavHeader,
  type Project,
} from '@kamo/core'
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TranscriptionJob } from '../../shared/packs.ts'
import { PackManager } from '../packs/manager.ts'
import {
  fakeModel,
  startFakeModelServer,
  writeFakeWhisper,
  type FakeModelServer,
} from '../packs/testing.ts'
import { saveProjectData, setTranscriptState } from '../projects.ts'
import { saveEditedTranscript } from '../transcript-file.ts'
import { FileProjectStore } from '../storage/index.ts'
import { PersistentQueue } from './queue.ts'
import {
  TranscriptionService,
  type TranscriptionDeps,
  type TranscriptionSettings,
} from './service.ts'
import {
  parseWhisperProgress,
  relativeForWhisper,
  runWhisper,
  whisperArgs,
  whisperCommand,
  whisperThreads,
} from './whisper.ts'

const log = { info() {}, warn() {} }
const source = {
  kind: 'display' as const,
  width: 1280,
  height: 720,
  scaleFactor: 1,
  fps: 30 as const,
}

let root: string
let server: FakeModelServer
let store: FileProjectStore
let packs: PackManager

beforeEach(async () => {
  // "app-data" with a non-ASCII name: whisper gets paths relative to it (Windows narrow paths).
  root = await mkdtemp(join(tmpdir(), 'kamo-transcribe-ção-'))
  store = new FileProjectStore(join(root, 'projects'))
  server = await startFakeModelServer({ models: [fakeModel()] })
  // whisper-cli ships in the app (D-042): here, the fake one.
  const program = await writeFakeWhisper(join(root, 'resources'))
  packs = new PackManager({
    dir: join(root, 'packs'),
    registryFile: join(root, 'packs.json'),
    packs: server.packs,
    fetch: (input, init) => fetch(input, init),
    freeBytes: async () => 10 ** 12,
    program: () => program,
    log,
  })
})
afterEach(async () => {
  await server.close()
  await rm(root, { recursive: true, force: true })
})

/** A project with a microphone track (the file content does not matter to the fake decoder). */
async function makeProject(options: { mic?: boolean; system?: boolean; durationMs?: number } = {}) {
  const project = createProject({
    name: 'Demo',
    durationMs: options.durationMs ?? 5000,
    source,
    audio: { mic: options.mic ?? true, system: options.system ?? false },
  })
  const withOffset: Project = {
    ...project,
    audio: { ...project.audio, mic: { ...project.audio.mic, offsetMs: -120 } },
  }
  await saveProject(store, withOffset)
  const dir = store.projectDir(project.id)
  if (options.mic ?? true) await writeFile(join(dir, 'audio.m4a'), 'fake')
  if (options.system) await writeFile(join(dir, 'system.m4a'), 'fake')
  return withOffset
}

interface Harness {
  service: TranscriptionService
  decoded: Array<{ file: string; offsetMs: number; durationMs: number }>
  changed: string[]
}

function harness(
  settings: TranscriptionSettings = {},
  overrides: Partial<TranscriptionDeps> = {},
): Harness {
  const decoded: Harness['decoded'] = []
  const changed: string[] = []
  const service = new TranscriptionService({
    store: () => store,
    packs,
    settings: async () => settings,
    queue: new PersistentQueue(join(root, 'transcription-queue.json')),
    workRoot: join(root, 'transcription'),
    cwd: root,
    threads: 2,
    // Stands in for the hidden decoder page: real core PCM math, a tone, a real WAV file.
    async decode(request, wavPath, signal, onProgress) {
      decoded.push({
        file: request.file,
        offsetMs: request.offsetMs,
        durationMs: request.durationMs,
      })
      const tone = new Float32Array(48_000 * 10).map((_, i) => Math.sin(i / 10) * 0.3)
      let sent = false
      const file = await open(wavPath, 'w')
      let bytes = 0
      await file.write(new Uint8Array(44))
      await streamSpeechPcm(
        async () => {
          if (sent) return null
          sent = true
          return { timestamp: 0, sampleRate: 48_000, channels: [tone] }
        },
        {
          offsetMs: request.offsetMs,
          durationMs: request.durationMs,
          signal,
          async onBlock(samples, progress) {
            await file.write(new Uint8Array(samples.buffer), 0, samples.byteLength, 44 + bytes)
            bytes += samples.byteLength
            onProgress(progress)
          },
        },
      )
      await file.write(wavHeader(bytes), 0, 44, 0)
      await file.close()
    },
    command: (entry) =>
      whisperCommand(entry, { allowScripts: true, execPath: process.execPath, env: process.env }),
    runWhisper: (run) => runWhisper(run),
    setTranscriptState: (projectId, state) => setTranscriptState(store, projectId, state),
    onProjectChanged: (projectId) => changed.push(projectId),
    log,
    now: () => new Date('2026-11-04T10:00:00.000Z'),
    ...overrides,
  })
  return { service, decoded, changed }
}

const jobOf = (service: TranscriptionService, id: string) =>
  service.list().find((job) => job.projectId === id)

describe('whisper helpers', () => {
  it('builds the CLI arguments', () => {
    expect(
      whisperArgs({ model: 'm.bin', wav: 'a.wav', outBase: 'out', language: 'pt', threads: 4.7 }),
    ).toEqual([
      '-m',
      'm.bin',
      '-f',
      'a.wav',
      '-l',
      'pt',
      '-t',
      '4',
      '-oj',
      '-ojf',
      '-of',
      'out',
      '-pp',
    ])
  })

  it('reads progress lines', () => {
    expect(parseWhisperProgress('whisper_print_progress_callback: progress =  42%')).toBe(0.42)
    expect(parseWhisperProgress('whisper_init_from_file: loading model')).toBeNull()
  })

  it('uses half the cores', () => {
    expect(whisperThreads(1)).toBe(1)
    expect(whisperThreads(8)).toBe(4)
    expect(whisperThreads(64)).toBe(8)
  })

  it('passes paths relative to the working directory', () => {
    expect(
      relativeForWhisper('C:\\Users\\João\\Kamo', 'C:\\Users\\João\\Kamo\\packs\\a\\m.bin'),
    ).toBe('packs/a/m.bin')
    expect(relativeForWhisper('/home/a', '/elsewhere/m.bin')).toBe('/elsewhere/m.bin')
  })

  it('runs scripts only when allowed (unpackaged builds)', () => {
    const env = {}
    expect(
      whisperCommand('/p/whisper-cli.mjs', { allowScripts: false, execPath: 'e', env }),
    ).toEqual({
      command: '/p/whisper-cli.mjs',
      prefix: [],
      env,
    })
    expect(
      whisperCommand('/p/whisper-cli.mjs', { allowScripts: true, execPath: 'e', env }).prefix,
    ).toEqual(['/p/whisper-cli.mjs'])
  })
})

describe('TranscriptionService', () => {
  it('downloads the pack, transcribes in the background and writes transcript.json', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const { service, decoded, changed } = harness({ transcriptionLanguage: 'auto' })
    const seen: TranscriptionJob['state'][] = []
    service.onChange((jobs) => {
      const state = jobs[0]?.state
      if (state && seen.at(-1) !== state) seen.push(state)
    })

    await service.enqueue(project.id)
    await service.idle()

    expect(seen).toEqual(['queued', 'preparing', 'transcribing', 'done'])
    expect(jobOf(service, project.id)).toMatchObject({ state: 'done', progress: 1, error: null })
    // The microphone, with its offset, over the whole video.
    expect(decoded).toEqual([{ file: 'audio.m4a', offsetMs: -120, durationMs: 5000 }])
    const transcript = parseTranscript(
      (await store.readText(project.id, PROJECT_FILES.transcript)) ?? '',
    )
    expect(transcript).not.toBeNull()
    expect(transcript!.model).toBe('whisper-base')
    expect(transcript!.language).toBe('en')
    expect(transcript!.createdAt).toBe('2026-11-04T10:00:00.000Z')
    // One segment per 2s of the 5s video, no [BLANK_AUDIO], nothing past the end.
    expect(transcript!.segments.map((s) => [s.startMs, s.endMs, s.text])).toEqual([
      [0, 1800, 'Fake segment 1.'],
      [2000, 3800, 'Fake segment 2.'],
      [4000, 5000, 'Fake segment 3.'],
    ])
    expect(transcript!.segments[0]!.words?.map((w) => w.text)).toEqual(['Fake', 'segment', '1.'])
    const saved = await loadProject(store, project.id)
    expect(saved.transcript).toEqual({ status: 'done', language: 'en', model: 'whisper-base' })
    expect(changed).toContain(project.id)
    // Work files are cleaned up; the queue is empty.
    expect(await readdir(join(root, 'transcription'))).toEqual([])
    expect(await new PersistentQueue(join(root, 'transcription-queue.json')).list()).toEqual([])
  })

  it('pins the language the user chose', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const { service } = harness({ transcriptionLanguage: 'pt' })
    await service.enqueue(project.id)
    await service.idle()
    expect((await loadProject(store, project.id)).transcript.language).toBe('pt')
  })

  it('falls back to the computer sound, and skips recordings without audio', async () => {
    await packs.install('transcribe-light')
    const systemOnly = await makeProject({ mic: false, system: true })
    const silent = await makeProject({ mic: false })
    const { service, decoded } = harness()
    await service.enqueue(systemOnly.id)
    await service.enqueue(silent.id)
    await service.idle()
    expect(decoded.map((d) => d.file)).toEqual(['system.m4a'])
    expect(jobOf(service, silent.id)?.state).toBe('no_audio')
    expect(await store.readText(silent.id, PROJECT_FILES.transcript)).toBeNull()
    expect((await loadProject(store, silent.id)).transcript.status).toBe('none')
  })

  it('fails with program_missing in a build without whisper-cli (D-042)', async () => {
    const project = await makeProject()
    await packs.install('transcribe-light')
    const { service } = harness(
      {},
      {
        packs: {
          transcriber: (preferred) => packs.transcriber(preferred),
          retain: (id) => packs.retain(id),
          program: () => null,
        },
      },
    )
    await service.enqueue(project.id)
    await service.idle()
    expect(jobOf(service, project.id)).toMatchObject({ state: 'failed', error: 'program_missing' })
    expect(packs.isBusy('transcribe-light')).toBe(false)
  })

  it('fails without the pack and when whisper fails, keeping the project consistent', async () => {
    const project = await makeProject()
    const { service } = harness()
    await service.enqueue(project.id)
    await service.idle()
    expect(jobOf(service, project.id)).toMatchObject({ state: 'failed', error: 'pack_missing' })

    await packs.install('transcribe-light')
    process.env['FAKE_WHISPER_FAIL'] = '1'
    try {
      await service.enqueue(project.id)
      await service.idle()
    } finally {
      delete process.env['FAKE_WHISPER_FAIL']
    }
    expect(jobOf(service, project.id)).toMatchObject({ state: 'failed', error: 'whisper_failed' })
    expect((await loadProject(store, project.id)).transcript.status).toBe('failed')
    // The pack is free again: it can be removed.
    expect(packs.isBusy('transcribe-light')).toBe(false)
  })

  it('cancels a running job and keeps the earlier transcript', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const first = harness()
    await first.service.enqueue(project.id)
    await first.service.idle()
    const before = await store.readText(project.id, PROJECT_FILES.transcript)

    process.env['FAKE_WHISPER_SLOW_MS'] = '5000'
    try {
      const { service } = harness()
      service.onChange((jobs) => {
        if (jobs[0]?.state === 'transcribing') void service.cancel(project.id)
      })
      await service.enqueue(project.id)
      await service.idle()
      expect(jobOf(service, project.id)?.state).toBe('cancelled')
    } finally {
      delete process.env['FAKE_WHISPER_SLOW_MS']
    }
    expect(await store.readText(project.id, PROJECT_FILES.transcript)).toBe(before)
    expect((await loadProject(store, project.id)).transcript.status).toBe('done')
  })

  it('resumes jobs left by a closed app, only with the pack installed', async () => {
    const project = await makeProject()
    const queue = new PersistentQueue(join(root, 'transcription-queue.json'))
    await queue.add(project.id)

    const withoutPack = harness()
    await withoutPack.service.resume()
    expect(withoutPack.service.list()).toEqual([])
    expect(await queue.list()).toEqual([project.id])

    await packs.install('transcribe-light')
    const { service } = harness()
    await service.resume()
    await service.idle()
    expect(jobOf(service, project.id)?.state).toBe('done')
  })

  it('transcribes new recordings only in automatic mode', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const manual = harness({ autoTranscribe: false })
    await manual.service.onRecordingSaved(project.id)
    expect(manual.service.list()).toEqual([])

    const auto = harness({ autoTranscribe: true })
    await auto.service.onRecordingSaved(project.id)
    await auto.service.idle()
    expect(jobOf(auto.service, project.id)?.state).toBe('done')
  })

  it('keeps the transcription state when the editor autosaves an older copy', async () => {
    const project = await makeProject()
    await setTranscriptState(store, project.id, {
      status: 'done',
      language: 'pt',
      model: 'whisper-base',
    })
    // The editor loaded the project before the transcription finished.
    await saveProjectData(store, { ...project, name: 'Renamed in the editor' })
    const saved = await loadProject(store, project.id)
    expect(saved.name).toBe('Renamed in the editor')
    expect(saved.transcript).toEqual({ status: 'done', language: 'pt', model: 'whisper-base' })
  })

  it('reports a project deleted while it was queued', async () => {
    await packs.install('transcribe-light')
    const { service } = harness()
    const ghost = '00000000-0000-4000-8000-000000000000'
    await mkdir(join(root, 'projects'), { recursive: true })
    await service.enqueue(ghost)
    await service.idle()
    expect(jobOf(service, ghost)).toMatchObject({ state: 'failed', error: 'project_not_found' })
  })

  it('asks before replacing a transcript corrected through the captions (A-06)', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const first = harness()
    await first.service.enqueue(project.id)
    await first.service.idle()
    const original = parseTranscript((await store.readText(project.id, PROJECT_FILES.transcript))!)!
    await saveEditedTranscript(store, project.id, {
      ...original,
      segments: [{ ...original.segments[0]!, text: 'Corrigido à mão.' }],
    })
    const edited = await store.readText(project.id, PROJECT_FILES.transcript)
    expect(parseTranscript(edited!)?.edited).toBe(true)

    const { service } = harness()
    await expect(service.enqueue(project.id)).rejects.toMatchObject({ code: 'transcript_edited' })
    expect(await store.readText(project.id, PROJECT_FILES.transcript)).toBe(edited)

    await service.enqueue(project.id, { replaceEdited: true })
    await service.idle()
    expect(jobOf(service, project.id)?.state).toBe('done')
    const replaced = parseTranscript((await store.readText(project.id, PROJECT_FILES.transcript))!)
    expect(replaced?.edited).toBe(false)
    expect(replaced?.segments[0]?.text).toBe('Fake segment 1.')
  })

  it('keeps corrections made while a transcription runs, unless replacing was agreed', async () => {
    await packs.install('transcribe-light')
    const project = await makeProject()
    const first = harness()
    await first.service.enqueue(project.id)
    await first.service.idle()
    const original = parseTranscript((await store.readText(project.id, PROJECT_FILES.transcript))!)!

    process.env['FAKE_WHISPER_SLOW_MS'] = '600'
    try {
      const { service } = harness()
      let corrected = false
      service.onChange((jobs) => {
        if (jobs[0]?.state !== 'transcribing' || corrected) return
        corrected = true
        void saveEditedTranscript(store, project.id, { ...original, edited: true })
      })
      await service.enqueue(project.id)
      await service.idle()
      expect(jobOf(service, project.id)).toMatchObject({
        state: 'failed',
        error: 'transcript_edited',
      })
    } finally {
      delete process.env['FAKE_WHISPER_SLOW_MS']
    }
    expect(
      parseTranscript((await store.readText(project.id, PROJECT_FILES.transcript))!)?.edited,
    ).toBe(true)
    // An earlier transcript stays: still done.
    expect((await loadProject(store, project.id)).transcript.status).toBe('done')
  })
})
