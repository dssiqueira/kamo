// The recordings folder, read lazily and cached in memory. Every cache entry is keyed by the
// file's mtime and size, so an edit made in the app shows up on the next call without a
// restart. Read-only (AGENTS.md rule 7): this module only stats, lists and reads files.
import {
  PLAYLISTS_FILE,
  PROJECT_FILES,
  PlaylistError,
  ProjectError,
  parseEvents,
  parsePlaylists,
  parseProject,
  type MouseEventRecord,
  type Playlist,
  type Project,
} from '@kamo/core'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

/** transcript.json (docs/data-model.md → Transcript). Unknown fields are ignored. */
export const Transcript = z.object({
  language: z.string().optional(),
  model: z.string().optional(),
  createdAt: z.string().optional(),
  edited: z.boolean().optional(),
  segments: z.array(
    z.object({
      startMs: z.number().nonnegative(),
      endMs: z.number().nonnegative(),
      text: z.string(),
    }),
  ),
})
export type Transcript = z.infer<typeof Transcript>

export interface Recording {
  /** project id from project.json */
  id: string
  /** folder name inside the projects folder (usually the same as the id) */
  folder: string
  path: string
  project: Project
  /** transcript.json exists (its content may still be invalid) */
  hasTranscriptFile: boolean
  /** mtime and size of transcript.json at scan time; spares a second stat per search */
  transcriptStamp: string | null
}

export interface Warning {
  folder: string
  problem: string
}

export interface Scan {
  dir: string
  /** false when the folder does not exist or cannot be read */
  exists: boolean
  /** newest first */
  recordings: Recording[]
  /** projects that exist but could not be read; skipped from every result */
  warnings: Warning[]
}

export interface Frame {
  /** video time of the frame, from its name (`0005.jpg` → 5000) */
  ms: number
  /** relative to the project folder, always with `/` */
  file: string
  mimeType: string
}

export type TranscriptResult =
  | { kind: 'ok'; transcript: Transcript }
  | { kind: 'missing' }
  | { kind: 'invalid'; problem: string }

export interface SearchableTranscript {
  transcript: Transcript
  /** normalized text of each segment, same order as `transcript.segments` */
  normalized: string[]
}

export type PlaylistsRead =
  | { kind: 'ok'; playlists: Playlist[]; dropped: number }
  | { kind: 'missing' }
  | { kind: 'invalid'; problem: string }

interface Cached<T> {
  stamp: string
  value: T
}

type ProjectRead = { project: Project } | { problem: string }

/** Frames are named by video second: `0005.jpg` (docs/data-model.md). */
const FRAME_NAME = /^(\d{1,6})\.(jpe?g|webp|png)$/i
const FRAME_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
}
/** Reference frames are ~20KB; anything this big is not one of ours. */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024
/** Parallel file reads while scanning: fast on SSDs without exhausting file handles. */
const READ_CONCURRENCY = 32
/** events.jsonl of a 30-minute recording has ~100k lines; keep only a few parsed at once. */
const EVENTS_CACHE_SIZE = 4

/** Lowercase, without accents: "Configuração" matches "configuracao". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

async function stampOf(path: string): Promise<string | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? `${info.mtimeMs}:${info.size}` : null
  } catch {
    return null
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function describeProjectError(error: unknown): string {
  if (error instanceof ProjectError) {
    const issues = error.issues.slice(0, 3).join('; ')
    return issues ? `${error.message} (${issues})` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export class Library {
  private readonly projects = new Map<string, Cached<ProjectRead>>()
  private readonly transcripts = new Map<string, Cached<TranscriptResult>>()
  private readonly searchable = new Map<string, Cached<SearchableTranscript>>()
  private readonly events = new Map<
    string,
    Cached<{ events: MouseEventRecord[]; skipped: number }>
  >()
  private playlistsCache: Cached<PlaylistsRead> | null = null

  readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  async scan(): Promise<Scan> {
    let names: string[]
    try {
      const entries = await readdir(this.dir, { withFileTypes: true })
      names = entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
    } catch {
      return { dir: this.dir, exists: false, recordings: [], warnings: [] }
    }

    const reads = await mapLimit(names, READ_CONCURRENCY, (folder) => this.readFolder(folder))
    const recordings: Recording[] = []
    const warnings: Warning[] = []
    for (const read of reads) {
      if (!read) continue
      if ('problem' in read) warnings.push(read)
      else recordings.push(read)
    }
    // Live folders only: forget projects that were deleted from outside.
    const alive = new Set(names)
    for (const folder of this.projects.keys()) if (!alive.has(folder)) this.projects.delete(folder)

    recordings.sort(
      (a, b) =>
        b.project.createdAt.localeCompare(a.project.createdAt) || a.folder.localeCompare(b.folder),
    )
    return { dir: this.dir, exists: true, recordings, warnings }
  }

  private async readFolder(folder: string): Promise<Recording | Warning | null> {
    const path = join(this.dir, folder)
    const projectFile = join(path, PROJECT_FILES.project)
    const [stamp, transcriptStamp] = await Promise.all([
      stampOf(projectFile),
      stampOf(join(path, PROJECT_FILES.transcript)),
    ])
    // A folder without project.json is not a project (or a recording still being saved).
    if (stamp === null) {
      this.projects.delete(folder)
      return null
    }
    let cached = this.projects.get(folder)
    if (!cached || cached.stamp !== stamp) {
      let value: ProjectRead
      try {
        value = { project: parseProject(await readFile(projectFile, 'utf8')) }
      } catch (error) {
        value = { problem: describeProjectError(error) }
      }
      cached = { stamp, value }
      this.projects.set(folder, cached)
    }
    if ('problem' in cached.value) return { folder, problem: cached.value.problem }
    const project = cached.value.project
    return {
      id: project.id,
      folder,
      path,
      project,
      hasTranscriptFile: transcriptStamp !== null,
      transcriptStamp,
    }
  }

  /** Finds a recording by project id or by folder name. Never builds a path from input. */
  async find(idOrFolder: string): Promise<{ scan: Scan; recording: Recording | null }> {
    const scan = await this.scan()
    const wanted = idOrFolder.trim()
    const recording =
      scan.recordings.find((r) => r.id === wanted) ??
      scan.recordings.find((r) => r.folder === wanted) ??
      scan.recordings.find((r) => r.id.toLowerCase() === wanted.toLowerCase()) ??
      null
    return { scan, recording }
  }

  /** Every tool scans first, so the transcript's stamp from that scan is current. */
  async transcript(recording: Recording): Promise<TranscriptResult> {
    const file = join(recording.path, PROJECT_FILES.transcript)
    const stamp = recording.transcriptStamp
    if (stamp === null) {
      this.transcripts.delete(recording.path)
      return { kind: 'missing' }
    }
    const cached = this.transcripts.get(recording.path)
    if (cached && cached.stamp === stamp) return cached.value
    let value: TranscriptResult
    try {
      const parsed = Transcript.safeParse(JSON.parse(await readFile(file, 'utf8')))
      value = parsed.success
        ? {
            kind: 'ok',
            transcript: {
              ...parsed.data,
              segments: [...parsed.data.segments].sort((a, b) => a.startMs - b.startMs),
            },
          }
        : { kind: 'invalid', problem: 'transcript.json does not match the expected format' }
    } catch {
      value = { kind: 'invalid', problem: 'transcript.json is not valid JSON' }
    }
    this.transcripts.set(recording.path, { stamp, value })
    return value
  }

  /** Transcript plus its normalized segment texts, built once per transcript version. */
  async searchableTranscript(recording: Recording): Promise<SearchableTranscript | null> {
    if (!recording.hasTranscriptFile) return null
    const result = await this.transcript(recording)
    if (result.kind !== 'ok') return null
    const stamp = this.transcripts.get(recording.path)?.stamp ?? ''
    const cached = this.searchable.get(recording.path)
    if (cached && cached.stamp === stamp) return cached.value
    const value = {
      transcript: result.transcript,
      normalized: result.transcript.segments.map((segment) => normalizeText(segment.text)),
    }
    this.searchable.set(recording.path, { stamp, value })
    return value
  }

  /** Loads the searchable transcripts of many recordings in parallel (search warm-up). */
  async searchableTranscripts(recordings: Recording[]) {
    return mapLimit(recordings, READ_CONCURRENCY, (r) => this.searchableTranscript(r))
  }

  async mouseEvents(
    recording: Recording,
  ): Promise<{ events: MouseEventRecord[]; skipped: number } | null> {
    const file = join(recording.path, PROJECT_FILES.events)
    const stamp = await stampOf(file)
    if (stamp === null) return null
    const cached = this.events.get(recording.path)
    if (cached && cached.stamp === stamp) {
      // Most recently used goes last.
      this.events.delete(recording.path)
      this.events.set(recording.path, cached)
      return cached.value
    }
    const parsed = parseEvents(await readFile(file, 'utf8'))
    const value = { events: parsed.events, skipped: parsed.skippedLines.length }
    this.events.set(recording.path, { stamp, value })
    while (this.events.size > EVENTS_CACHE_SIZE) {
      const oldest = this.events.keys().next().value
      if (oldest === undefined) break
      this.events.delete(oldest)
    }
    return value
  }

  /** Reference frames, sorted by time. Empty when the recording has none. */
  async frames(recording: Recording): Promise<Frame[]> {
    let names: string[]
    try {
      names = await readdir(join(recording.path, PROJECT_FILES.frames))
    } catch {
      return []
    }
    const frames: Frame[] = []
    for (const name of names) {
      const match = FRAME_NAME.exec(name)
      if (!match) continue
      const ext = (match[2] ?? '').toLowerCase()
      frames.push({
        ms: Number(match[1]) * 1000,
        file: `${PROJECT_FILES.frames}/${name}`,
        mimeType: FRAME_MIME[ext] ?? 'image/jpeg',
      })
    }
    return frames.sort((a, b) => a.ms - b.ms || a.file.localeCompare(b.file))
  }

  /** Reads one frame listed by `frames()`. */
  async readFrame(recording: Recording, frame: Frame): Promise<Buffer> {
    const path = join(recording.path, ...frame.file.split('/'))
    const info = await stat(path)
    if (info.size > MAX_FRAME_BYTES) {
      throw new Error(`${frame.file} is ${info.size} bytes, too big for a reference frame`)
    }
    return readFile(path)
  }

  /**
   * The app's local playlists (`<projects>/playlists.json`, docs/data-model.md → Playlists).
   * Missing file: no playlists yet. Cached by mtime and size like everything else.
   */
  async playlists(): Promise<PlaylistsRead> {
    const file = join(this.dir, PLAYLISTS_FILE)
    const stamp = await stampOf(file)
    if (stamp === null) {
      this.playlistsCache = null
      return { kind: 'missing' }
    }
    if (this.playlistsCache?.stamp === stamp) return this.playlistsCache.value
    let value: PlaylistsRead
    try {
      const { file: parsed, dropped } = parsePlaylists(await readFile(file, 'utf8'))
      value = { kind: 'ok', playlists: parsed.playlists, dropped }
    } catch (error) {
      value = {
        kind: 'invalid',
        problem:
          error instanceof PlaylistError && error.code === 'newer_version'
            ? 'playlists.json was saved by a newer Kamo app; update @kamo/mcp to read it'
            : `playlists.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    this.playlistsCache = { stamp, value }
    return value
  }

  /** Which optional media files are in the project folder. */
  async mediaFiles(recording: Recording): Promise<Record<string, boolean>> {
    const names = ['screen.mp4', 'screen.webm', 'audio.m4a', 'system.m4a', 'webcam.mp4']
    const stamps = await Promise.all(names.map((name) => stampOf(join(recording.path, name))))
    return Object.fromEntries(names.map((name, i) => [name, stamps[i] !== null]))
  }
}

/** Frame closest to `ms`; on a tie, the earlier one. */
export function nearestFrame(frames: Frame[], ms: number): Frame | null {
  let best: Frame | null = null
  for (const frame of frames) {
    if (!best || Math.abs(frame.ms - ms) < Math.abs(best.ms - ms)) best = frame
  }
  return best
}
