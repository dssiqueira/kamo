// Background transcription (A-05): one job at a time, in order. Each job turns the voice track
// into 16kHz audio (a hidden renderer decodes it), runs whisper.cpp from the installed pack at
// low priority and writes transcript.json. Nothing leaves the machine. Platform pieces (the
// decoder, the process, the project store) are injected, so the whole flow runs in tests.
import {
  PROJECT_FILES,
  loadProject,
  parseTranscript,
  serializeTranscript,
  transcriptFromWhisper,
  type Project,
  type ProjectStore,
  type TranscriptState,
} from '@kamo/core'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  PackId,
  TranscriptionErrorCode,
  TranscriptionJob,
  TranscriptionLanguage,
} from '../../shared/packs.ts'
import type { TranscriberPack } from '../packs/manager.ts'
import type { PersistentQueue } from './queue.ts'
import { relativeForWhisper, whisperArgs, type WhisperCommand } from './whisper.ts'

/** Raw audio files the decoder may read (data-model.md). */
export type SpeechFile = 'audio.m4a' | 'system.m4a'

export interface DecodeRequest {
  projectId: string
  file: SpeechFile
  /** project.audio.*.offsetMs: the decoder aligns the audio to the video. */
  offsetMs: number
  durationMs: number
}

export interface TranscriptionSettings {
  autoTranscribe?: boolean
  transcriptionLanguage?: TranscriptionLanguage
  transcriptionPack?: PackId
}

export interface TranscriptionLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
}

export interface TranscriptionDeps {
  store(): ProjectStore
  packs: {
    transcriber(preferred?: PackId): Promise<TranscriberPack | null>
    retain(id: PackId): () => void
  }
  settings(): Promise<TranscriptionSettings>
  queue: PersistentQueue
  /** Where each job keeps its WAV and whisper's output (deleted after). */
  workRoot: string
  /** whisper's working directory; model, WAV and output paths are passed relative to it. */
  cwd: string
  threads: number
  /** Writes the 16kHz mono WAV of one track, aligned to the video. */
  decode(
    request: DecodeRequest,
    wavPath: string,
    signal: AbortSignal,
    onProgress: (fraction: number) => void,
  ): Promise<void>
  /** The pack's program (or, in development, the fake script). */
  command(entry: string): WhisperCommand
  runWhisper(options: {
    command: WhisperCommand
    args: string[]
    cwd: string
    signal: AbortSignal
    onProgress(fraction: number): void
  }): Promise<void>
  /** Sets project.json `transcript` (main serializes this with the editor's autosave). */
  setTranscriptState(projectId: string, state: TranscriptState): Promise<void>
  /** Home refreshes (the card shows "Transcribed"). */
  onProjectChanged(projectId: string): void
  log: TranscriptionLogger
  now?(): Date
}

/** The share of a job's progress taken by preparing the audio; whisper gets the rest. */
const PREPARE_SHARE = 0.1

class JobFailure extends Error {
  constructor(readonly code: TranscriptionErrorCode | 'no_audio') {
    super(code)
    this.name = 'JobFailure'
  }
}

/** A request the UI explains (main turns `code` into the IPC error code). */
export class TranscriptionError extends Error {
  constructor(readonly code: 'transcript_edited') {
    super(code)
    this.name = 'TranscriptionError'
  }
}

export interface EnqueueOptions {
  /**
   * A-06: the transcript was corrected through the captions; the user confirmed that a new
   * transcription replaces those corrections. Without it, enqueue refuses an edited one.
   */
  replaceEdited?: boolean
}

/** The voice to transcribe: the microphone when it was recorded, else the computer sound. */
export async function pickSpeechTrack(
  store: ProjectStore,
  project: Project,
): Promise<{ file: SpeechFile; offsetMs: number } | null> {
  const files = await store.listFiles(project.id, '')
  const { mic, system } = project.audio
  if (mic.enabled && files.includes('audio.m4a')) {
    return { file: 'audio.m4a', offsetMs: mic.offsetMs ?? 0 }
  }
  if (system.enabled && files.includes('system.m4a')) {
    return { file: 'system.m4a', offsetMs: system.offsetMs ?? 0 }
  }
  return null
}

export class TranscriptionService {
  private readonly jobs = new Map<string, TranscriptionJob>()
  private readonly order: string[] = []
  private current: { projectId: string; controller: AbortController } | null = null
  private pumping: Promise<void> | null = null
  private readonly listeners = new Set<(jobs: TranscriptionJob[]) => void>()
  private lastProgressEmit = 0
  /** Jobs allowed to overwrite a transcript the user corrected (A-06). */
  private readonly replaceEdited = new Set<string>()

  constructor(private readonly deps: TranscriptionDeps) {}

  onChange(listener: (jobs: TranscriptionJob[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** This session's jobs (queued, running and finished). */
  list(): TranscriptionJob[] {
    return [...this.jobs.values()].map((job) => ({ ...job }))
  }

  /**
   * The user clicked Transcribe (or auto mode after a recording). Rejects with
   * TranscriptionError('transcript_edited') when the transcript was corrected through the
   * captions, unless `replaceEdited` says the user agreed to lose those corrections.
   */
  async enqueue(projectId: string, options: EnqueueOptions = {}): Promise<void> {
    const existing = this.jobs.get(projectId)
    if (existing && (existing.state === 'queued' || this.current?.projectId === projectId)) return
    if (options.replaceEdited) this.replaceEdited.add(projectId)
    else if (await this.isEdited(projectId)) throw new TranscriptionError('transcript_edited')
    this.jobs.set(projectId, { projectId, state: 'queued', progress: 0, error: null })
    this.order.push(projectId)
    await this.deps.queue.add(projectId)
    this.emit()
    this.pump()
  }

  /** Stops a running job or drops a queued one; the project keeps its earlier transcript. */
  async cancel(projectId: string): Promise<void> {
    const job = this.jobs.get(projectId)
    if (!job) return
    if (this.current?.projectId === projectId) {
      this.current.controller.abort(new Error('cancelled'))
      return
    }
    if (job.state === 'queued') {
      this.dropFromOrder(projectId)
      this.replaceEdited.delete(projectId)
      await this.deps.queue.remove(projectId)
      this.finish(job, 'cancelled', null)
    }
  }

  /** A new recording was saved: transcribe it if the user chose automatic mode. */
  async onRecordingSaved(projectId: string): Promise<void> {
    const settings = await this.deps.settings()
    if (settings.autoTranscribe !== true) return
    if (!(await this.deps.packs.transcriber(settings.transcriptionPack))) return
    this.deps.log.info('transcription.auto', {})
    await this.enqueue(projectId)
  }

  /** App start: jobs the app was closed in the middle of start again (needs the pack). */
  async resume(): Promise<void> {
    const ids = await this.deps.queue.list()
    if (ids.length === 0) return
    const settings = await this.deps.settings()
    if (!(await this.deps.packs.transcriber(settings.transcriptionPack))) return
    this.deps.log.info('transcription.resumed', { count: ids.length })
    for (const id of ids) {
      // Corrected since (A-06): the old job must not overwrite the corrections.
      await this.enqueue(id).catch(async (error: unknown) => {
        if (!(error instanceof TranscriptionError)) throw error
        await this.deps.queue.remove(id)
      })
    }
  }

  /** transcript.json was corrected through the captions (A-06). */
  private async isEdited(projectId: string): Promise<boolean> {
    const text = await this.deps
      .store()
      .readText(projectId, PROJECT_FILES.transcript)
      .catch(() => null)
    return text !== null && parseTranscript(text)?.edited === true
  }

  /** Resolves when the queue is empty (tests). */
  async idle(): Promise<void> {
    while (this.pumping) await this.pumping
  }

  private pump(): void {
    if (this.pumping) return
    this.pumping = (async () => {
      for (;;) {
        const next = this.order.shift()
        if (next === undefined) break
        await this.process(next)
      }
    })().finally(() => {
      this.pumping = null
    })
  }

  private async process(projectId: string): Promise<void> {
    const job = this.jobs.get(projectId)
    if (!job || job.state !== 'queued') return
    const controller = new AbortController()
    this.current = { projectId, controller }
    const workDir = join(this.deps.workRoot, projectId)
    let release: (() => void) | null = null
    let previous: TranscriptState | null = null
    const store = this.deps.store()
    try {
      job.state = 'preparing'
      this.emit()
      const project = await loadProject(store, projectId).catch(() => {
        throw new JobFailure('project_not_found')
      })
      const source = await pickSpeechTrack(store, project)
      if (!source) throw new JobFailure('no_audio')
      const settings = await this.deps.settings()
      const pack = await this.deps.packs.transcriber(settings.transcriptionPack)
      if (!pack) throw new JobFailure('pack_missing')
      release = this.deps.packs.retain(pack.id)
      previous = project.transcript
      await this.deps.setTranscriptState(projectId, { status: 'pending' })
      this.deps.onProjectChanged(projectId)

      await rm(workDir, { recursive: true, force: true })
      await mkdir(workDir, { recursive: true })
      const wav = join(workDir, 'audio.wav')
      await this.deps
        .decode(
          {
            projectId,
            file: source.file,
            offsetMs: source.offsetMs,
            durationMs: project.durationMs,
          },
          wav,
          controller.signal,
          (fraction) => this.progress(job, fraction * PREPARE_SHARE),
        )
        .catch((error: unknown) => {
          if (controller.signal.aborted) throw controller.signal.reason
          this.deps.log.warn('transcription.decode.failed', { error })
          throw new JobFailure('audio_unreadable')
        })

      job.state = 'transcribing'
      this.progress(job, PREPARE_SHARE, true)
      const language = settings.transcriptionLanguage ?? 'auto'
      const outBase = join(workDir, 'out')
      const { cwd } = this.deps
      await this.deps
        .runWhisper({
          command: this.deps.command(pack.entry),
          args: whisperArgs({
            model: relativeForWhisper(cwd, pack.model.path),
            wav: relativeForWhisper(cwd, wav),
            outBase: relativeForWhisper(cwd, outBase),
            language,
            threads: this.deps.threads,
          }),
          cwd,
          signal: controller.signal,
          onProgress: (fraction) =>
            this.progress(job, PREPARE_SHARE + fraction * (1 - PREPARE_SHARE)),
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) throw controller.signal.reason
          this.deps.log.warn('transcription.whisper.failed', { error })
          throw new JobFailure('whisper_failed')
        })

      let transcriptText: string
      try {
        const json: unknown = JSON.parse(await readFile(`${outBase}.json`, 'utf8'))
        const transcript = transcriptFromWhisper(json, {
          model: pack.model.name,
          createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
          durationMs: project.durationMs,
          ...(language !== 'auto' ? { fallbackLanguage: language } : {}),
        })
        transcriptText = serializeTranscript(transcript)
        // Deleted while transcribing: nothing to write into.
        if ((await store.readText(projectId, PROJECT_FILES.project)) === null) {
          throw new JobFailure('project_not_found')
        }
        // Corrected in the editor meanwhile, without the user agreeing to replace it (A-06).
        if (!this.replaceEdited.has(projectId) && (await this.isEdited(projectId))) {
          throw new JobFailure('transcript_edited')
        }
        await store.writeText(projectId, PROJECT_FILES.transcript, transcriptText)
        await this.deps.setTranscriptState(projectId, {
          status: 'done',
          language: transcript.language,
          model: transcript.model,
        })
        this.deps.log.info('transcription.done', {
          segments: transcript.segments.length,
          language: transcript.language,
          model: transcript.model,
        })
      } catch (error) {
        if (error instanceof JobFailure) throw error
        this.deps.log.warn('transcription.output.invalid', { error })
        throw new JobFailure('output_invalid')
      }
      this.finish(job, 'done', null)
    } catch (error) {
      if (controller.signal.aborted) {
        await this.restore(projectId, previous)
        this.deps.log.info('transcription.cancelled', {})
        this.finish(job, 'cancelled', null)
      } else if (error instanceof JobFailure && error.code === 'no_audio') {
        this.finish(job, 'no_audio', null)
      } else {
        const code: TranscriptionErrorCode =
          error instanceof JobFailure && error.code !== 'no_audio' ? error.code : 'whisper_failed'
        if (code !== 'project_not_found' && previous) await this.restore(projectId, previous, true)
        this.deps.log.warn('transcription.failed', { code, error })
        this.finish(job, 'failed', code)
      }
    } finally {
      release?.()
      this.replaceEdited.delete(projectId)
      this.current = null
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
      await this.deps.queue.remove(projectId).catch(() => {})
      this.deps.onProjectChanged(projectId)
    }
  }

  /**
   * After a cancel or a failure: an earlier transcript (still on disk) stays `done`; without one
   * the state goes back to `none` (cancelled) or `failed`.
   */
  private async restore(
    projectId: string,
    previous: TranscriptState | null,
    failed = false,
  ): Promise<void> {
    if (!previous) return
    const store = this.deps.store()
    const hasTranscript = (await store.readText(projectId, PROJECT_FILES.transcript)) !== null
    const state: TranscriptState =
      hasTranscript && previous.status === 'done'
        ? previous
        : hasTranscript
          ? { status: 'done' }
          : { status: failed ? 'failed' : 'none' }
    await this.deps.setTranscriptState(projectId, state).catch((error: unknown) => {
      this.deps.log.warn('transcription.state.failed', { error })
    })
  }

  private dropFromOrder(projectId: string): void {
    const index = this.order.indexOf(projectId)
    if (index !== -1) this.order.splice(index, 1)
  }

  private finish(
    job: TranscriptionJob,
    state: TranscriptionJob['state'],
    error: TranscriptionErrorCode | null,
  ): void {
    job.state = state
    job.error = error
    if (state === 'done') job.progress = 1
    this.emit()
  }

  private progress(job: TranscriptionJob, fraction: number, force = false): void {
    job.progress = Math.max(job.progress, Math.min(1, fraction))
    const now = Date.now()
    if (!force && now - this.lastProgressEmit < 250) return
    this.lastProgressEmit = now
    this.emit()
  }

  private emit(): void {
    const jobs = this.list()
    for (const listener of this.listeners) {
      try {
        listener(jobs)
      } catch {
        // a closed window must not stop the others
      }
    }
  }
}
