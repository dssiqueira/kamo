// The six read-only tools of the local MCP (docs/features.md → M-01). Every answer is JSON in
// a text block (plus the image for get_frame), small and paginated so it never floods the
// agent's context. Times always come twice: `…Ms` (exact) and hh:mm:ss.
import type { MouseEventRecord, Project } from '@kamo/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { Library, nearestFrame, normalizeText, type Recording, type Scan } from './library.ts'
import { parseDateBound, roundMs, timecode } from './time.ts'
import { VERSION } from './version.ts'

export interface KamoServerOptions {
  /** Projects folder, already resolved (see `resolveProjectsDir`). */
  dir: string
}

/** Every tool only reads local files. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

/** Reference frames are saved every 5s of video (docs/data-model.md). */
const FRAME_INTERVAL_MS = 5000
const SNIPPET_CHARS = 200
const MAX_ZOOMS_IN_RECORDING = 50

const INSTRUCTIONS = `Kamo is a screen recorder. This server reads the user's local Kamo recordings (read-only, offline).
Start with list_recordings or search_recordings to get a recording id, then use get_recording, get_transcript, get_click_timeline and get_frame.
Times are on the raw recording timeline, in ms and hh:mm:ss. Click and zoom positions are pixels of the recorded video (origin top-left).
Results are paginated: when nextOffset is not null, call again with offset = nextOffset.`

const recordingId = z
  .string()
  .trim()
  .min(1)
  .describe(
    'Recording id from list_recordings or search_recordings (the project id or its folder name).',
  )
const offset = z.number().int().min(0).default(0).describe('Pagination: items to skip (default 0).')
const limitOf = (fallback: number, max: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(max)
    .default(fallback)
    .describe(`Pagination: max items to return (default ${fallback}, max ${max}).`)
const fromMs = z
  .number()
  .min(0)
  .optional()
  .describe('Start of the time range in ms (inclusive). Omit for the beginning.')
const toMs = z
  .number()
  .min(0)
  .optional()
  .describe('End of the time range in ms (inclusive). Omit for the end.')

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function page<T>(items: T[], start: number, limit: number) {
  const slice = items.slice(start, start + limit)
  const next = start + slice.length
  return {
    total: items.length,
    offset: start,
    limit,
    nextOffset: next < items.length ? next : null,
    items: slice,
  }
}

function at(ms: number) {
  return { ms: roundMs(ms), time: timecode(ms) }
}

function noRecordingsMessage(scan: Scan): string {
  if (!scan.exists) {
    return `No recordings found in ${scan.dir} (the folder does not exist). Record something with the Kamo desktop app, or start this server with --dir pointing to the Kamo projects folder.`
  }
  return `No recordings found in ${scan.dir}.`
}

function notFound(id: string, scan: Scan): CallToolResult {
  if (scan.recordings.length === 0) return failure(noRecordingsMessage(scan))
  const broken = scan.warnings.find((w) => w.folder === id)
  if (broken) return failure(`Recording "${id}" could not be read: ${broken.problem}`)
  return failure(
    `Recording "${id}" not found in ${scan.dir}. Use list_recordings or search_recordings to get a recording id.`,
  )
}

/** Only present when there is something to say, to keep answers small. */
function warningsOf(scan: Scan) {
  return scan.warnings.length > 0
    ? {
        warnings: scan.warnings.map((w) => ({
          folder: w.folder,
          problem: `Skipped, project could not be read: ${w.problem}`,
        })),
      }
    : {}
}

function cloudLinks(project: Project) {
  return project.cloud.map((link) => ({
    aspect: link.aspect,
    shortId: link.shortId,
    path: `/v/${link.shortId}`,
    uploadedAt: link.uploadedAt,
  }))
}

function summary(recording: Recording) {
  const { project } = recording
  return {
    id: recording.id,
    name: project.name,
    createdAt: project.createdAt,
    durationMs: roundMs(project.durationMs),
    duration: timecode(project.durationMs),
    resolution: `${project.source.width}x${project.source.height}`,
    hasTranscript: recording.hasTranscriptFile,
    transcriptStatus: project.transcript.status,
    exportCount: project.exports.length,
    cloudLinks: cloudLinks(project),
  }
}

function inRange(ms: number, from: number | undefined, to: number | undefined): boolean {
  return (from === undefined || ms >= from) && (to === undefined || ms <= to)
}

function overlaps(start: number, end: number, from: number | undefined, to: number | undefined) {
  return (from === undefined || end >= from) && (to === undefined || start <= to)
}

function snippet(text: string, normalized: string, token: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= SNIPPET_CHARS) return clean
  // Normalizing keeps lengths close enough to centre the window on the match.
  const index = Math.max(0, normalized.indexOf(token))
  const start = Math.max(0, Math.min(index - 60, clean.length - SNIPPET_CHARS))
  const end = start + SNIPPET_CHARS
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}

function noTranscriptMessage(recording: Recording): string {
  const status = recording.project.transcript.status
  const name = `"${recording.project.name}"`
  if (status === 'pending') {
    return `The transcript of ${name} is still being made by the Kamo app. Try again in a few minutes. Meanwhile, get_click_timeline and get_frame work.`
  }
  const failed = status === 'failed' ? ' The last transcription attempt failed.' : ''
  return `Recording ${name} has no transcript.${failed} Transcription is optional and runs locally: in the Kamo desktop app, open the recording and click Transcribe (or install the transcription pack in Settings → Packages). Without it you can still use get_click_timeline (clicks and zooms) and get_frame (screenshots every 5 seconds).`
}

type TimelineItem =
  | { kind: 'click'; atMs: number; at: string; x: number; y: number; button: string }
  | { kind: 'scroll'; atMs: number; at: string; x: number; y: number; dx: number; dy: number }
  | { kind: 'move'; atMs: number; at: string; x: number; y: number; outside?: true }
  | {
      kind: 'zoom'
      atMs: number
      at: string
      endMs: number
      end: string
      scale: number
      target: { x: number; y: number }
      follow: boolean
      origin: string
    }

function eventItem(event: MouseEventRecord): TimelineItem | null {
  const base = {
    atMs: roundMs(event.t),
    at: timecode(event.t),
    x: roundMs(event.x),
    y: roundMs(event.y),
  }
  switch (event.type) {
    case 'down':
      return { kind: 'click', ...base, button: event.button }
    case 'scroll':
      return { kind: 'scroll', ...base, dx: event.dx, dy: event.dy }
    case 'move':
      return event.outside ? { kind: 'move', ...base, outside: true } : { kind: 'move', ...base }
    default:
      return null
  }
}

export function createKamoServer(options: KamoServerOptions): {
  server: McpServer
  library: Library
} {
  const library = new Library(options.dir)
  const server = new McpServer(
    { name: 'kamo', title: 'Kamo recordings (local)', version: VERSION },
    { instructions: INSTRUCTIONS },
  )

  server.registerTool(
    'list_recordings',
    {
      title: 'List recordings',
      description:
        'Lists the Kamo screen recordings on this computer, newest first: id, name, date, duration, resolution, whether it has a transcript, export count and Kamo Cloud links. Optional date range. Paginated.',
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe(
            'Only recordings made on or after this date: YYYY-MM-DD (local day) or ISO 8601.',
          ),
        to: z
          .string()
          .optional()
          .describe(
            'Only recordings made on or before this date: YYYY-MM-DD (whole local day) or ISO 8601.',
          ),
        offset,
        limit: limitOf(20, 100),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const from = args.from === undefined ? null : parseDateBound(args.from, 'start')
      const to = args.to === undefined ? null : parseDateBound(args.to, 'end')
      if (args.from !== undefined && !from) return failure(`Invalid "from" date: ${args.from}`)
      if (args.to !== undefined && !to) return failure(`Invalid "to" date: ${args.to}`)

      const scan = await library.scan()
      const matching = scan.recordings.filter((r) => {
        const created = Date.parse(r.project.createdAt)
        return (!from || created >= from.getTime()) && (!to || created <= to.getTime())
      })
      const { items, ...pagination } = page(matching, args.offset, args.limit)
      const message =
        scan.recordings.length === 0
          ? noRecordingsMessage(scan)
          : matching.length === 0
            ? `No recordings in that date range (${scan.recordings.length} in total).`
            : undefined
      return json({
        dir: scan.dir,
        ...(message ? { message } : {}),
        ...pagination,
        recordings: items.map(summary),
        ...warningsOf(scan),
      })
    },
  )

  server.registerTool(
    'search_recordings',
    {
      title: 'Search recordings',
      description:
        'Searches recording names and transcripts (case and accent insensitive; every word must appear). Returns the recording, a text snippet and the instant it was said (ms and hh:mm:ss). Recordings without a transcript are searched by name only. Paginated.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe('Words to look for, e.g. "billing settings".'),
        offset,
        limit: limitOf(20, 50),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const scan = await library.scan()
      if (scan.recordings.length === 0) {
        return json({ dir: scan.dir, message: noRecordingsMessage(scan), total: 0, matches: [] })
      }
      const tokens = normalizeText(args.query).split(/\s+/).filter(Boolean)
      const first = tokens[0] ?? ''
      const matchesAll = (text: string) => tokens.every((token) => text.includes(token))
      const searchables = await library.searchableTranscripts(scan.recordings)

      type Match = {
        recordingId: string
        recordingName: string
        createdAt: string
        match: 'name' | 'transcript'
        snippet: string
        atMs: number | null
        at: string | null
        endMs?: number
        end?: string
      }
      const byName: Match[] = []
      const byText: Match[] = []
      let withTranscript = 0
      scan.recordings.forEach((recording, i) => {
        const { project } = recording
        const head = {
          recordingId: recording.id,
          recordingName: project.name,
          createdAt: project.createdAt,
        }
        const nameHit = matchesAll(normalizeText(project.name))
        const target = nameHit ? byName : byText
        if (nameHit)
          target.push({ ...head, match: 'name', snippet: project.name, atMs: null, at: null })
        const searchable = searchables[i]
        if (!searchable) return
        withTranscript++
        searchable.normalized.forEach((normalized, j) => {
          if (!matchesAll(normalized)) return
          const segment = searchable.transcript.segments[j]
          if (!segment) return
          target.push({
            ...head,
            match: 'transcript',
            snippet: snippet(segment.text, normalized, first),
            atMs: roundMs(segment.startMs),
            at: timecode(segment.startMs),
            endMs: roundMs(segment.endMs),
            end: timecode(segment.endMs),
          })
        })
      })
      // Recordings whose name matches come first; each group stays newest first.
      const all = [...byName, ...byText]
      const { items, ...pagination } = page(all, args.offset, args.limit)
      const withoutTranscript = scan.recordings.length - withTranscript
      return json({
        query: args.query,
        ...(all.length === 0 ? { message: `No recordings match "${args.query}".` } : {}),
        ...pagination,
        matches: items,
        searched: { recordings: scan.recordings.length, withTranscript },
        ...(withoutTranscript > 0
          ? {
              note: `${withoutTranscript} recording(s) have no transcript, so only their names were searched. Transcription is an optional pack in the Kamo desktop app.`,
            }
          : {}),
        ...warningsOf(scan),
      })
    },
  )

  server.registerTool(
    'get_recording',
    {
      title: 'Get recording details',
      description:
        'Full metadata of one recording: duration, resolution and source, trim, zooms, style, cursor, audio tracks, local exports, Kamo Cloud links, transcript state, reference frames and which media files exist.',
      inputSchema: { recordingId },
      annotations: READ_ONLY,
    },
    async (args) => {
      const { scan, recording } = await library.find(args.recordingId)
      if (!recording) return notFound(args.recordingId, scan)
      const { project } = recording
      const [frames, files, events] = await Promise.all([
        library.frames(recording),
        library.mediaFiles(recording),
        library.mouseEvents(recording).catch(() => null),
      ])
      const zooms = project.zooms.slice(0, MAX_ZOOMS_IN_RECORDING).map((zoom) => ({
        startMs: roundMs(zoom.startMs),
        start: timecode(zoom.startMs),
        endMs: roundMs(zoom.endMs),
        end: timecode(zoom.endMs),
        scale: zoom.scale,
        target: { x: roundMs(zoom.target.x), y: roundMs(zoom.target.y) },
        follow: zoom.follow,
        origin: zoom.origin,
      }))
      const audioTrack = (track: Project['audio']['mic'], file: string) => ({
        recorded: files[file] ?? false,
        file,
        enabled: track.enabled,
        volume: track.volume,
        offsetMs: track.offsetMs ?? 0,
      })
      const firstFrame = frames[0]
      const lastFrame = frames.at(-1)
      return json({
        id: recording.id,
        folder: recording.folder,
        path: recording.path,
        name: project.name,
        createdAt: project.createdAt,
        durationMs: roundMs(project.durationMs),
        duration: timecode(project.durationMs),
        resolution: `${project.source.width}x${project.source.height}`,
        source: project.source,
        trim: {
          startMs: roundMs(project.trim.startMs),
          start: timecode(project.trim.startMs),
          endMs: roundMs(project.trim.endMs),
          end: timecode(project.trim.endMs),
          trimmedDurationMs: roundMs(project.trim.endMs - project.trim.startMs),
        },
        zoomCount: project.zooms.length,
        zooms,
        ...(project.zooms.length > zooms.length
          ? { zoomsNote: `Showing the first ${zooms.length}; use get_click_timeline for all.` }
          : {}),
        style: project.style,
        cursor: project.cursor,
        audio: {
          microphone: audioTrack(project.audio.mic, 'audio.m4a'),
          system: audioTrack(project.audio.system, 'system.m4a'),
        },
        exports: project.exports,
        cloudLinks: cloudLinks(project),
        transcript: { ...project.transcript, file: recording.hasTranscriptFile },
        mouseEvents: events
          ? {
              total: events.events.length,
              clicks: events.events.filter((e) => e.type === 'down').length,
              ...(events.skipped > 0 ? { skippedLines: events.skipped } : {}),
            }
          : null,
        referenceFrames: {
          count: frames.length,
          intervalMs: FRAME_INTERVAL_MS,
          ...(firstFrame && lastFrame ? { firstMs: firstFrame.ms, lastMs: lastFrame.ms } : {}),
        },
        files,
      })
    },
  )

  server.registerTool(
    'get_transcript',
    {
      title: 'Get transcript',
      description:
        'Transcript of a recording (what was said), as timed segments with start/end in ms and hh:mm:ss. Optionally only a time range. Paginated by segment. If the recording has no transcript, explains how to create one in the Kamo app.',
      inputSchema: { recordingId, fromMs, toMs, offset, limit: limitOf(100, 500) },
      annotations: READ_ONLY,
    },
    async (args) => {
      const { scan, recording } = await library.find(args.recordingId)
      if (!recording) return notFound(args.recordingId, scan)
      const result = await library.transcript(recording)
      if (result.kind === 'missing') {
        return { content: [{ type: 'text', text: noTranscriptMessage(recording) }] }
      }
      if (result.kind === 'invalid') {
        return failure(
          `The transcript of "${recording.project.name}" could not be read: ${result.problem}.`,
        )
      }
      const { transcript } = result
      const segments = transcript.segments.filter((s) =>
        overlaps(s.startMs, s.endMs, args.fromMs, args.toMs),
      )
      const { items, ...pagination } = page(segments, args.offset, args.limit)
      return json({
        recordingId: recording.id,
        recordingName: recording.project.name,
        language: transcript.language ?? null,
        model: transcript.model ?? null,
        createdAt: transcript.createdAt ?? null,
        edited: transcript.edited ?? false,
        ...pagination,
        segments: items.map((s) => ({
          startMs: roundMs(s.startMs),
          start: timecode(s.startMs),
          endMs: roundMs(s.endMs),
          end: timecode(s.endMs),
          text: s.text,
        })),
      })
    },
  )

  server.registerTool(
    'get_click_timeline',
    {
      title: 'Get click timeline',
      description:
        'Timeline of a recording: mouse clicks (left/right/middle, instant + x/y position) and zooms (start/end, scale, target). Scrolls and pointer moves only when asked. Positions are pixels of the recorded video, origin top-left. Optional time range. Paginated.',
      inputSchema: {
        recordingId,
        fromMs,
        toMs,
        includeZooms: z.boolean().default(true).describe('Include zoom blocks (default true).'),
        includeScrolls: z
          .boolean()
          .default(false)
          .describe('Include scroll events (default false).'),
        includeMoves: z
          .boolean()
          .default(false)
          .describe(
            'Include pointer moves, ~60 per second (default false; use a short time range).',
          ),
        offset,
        limit: limitOf(100, 500),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const { scan, recording } = await library.find(args.recordingId)
      if (!recording) return notFound(args.recordingId, scan)
      const { project } = recording
      const events = await library.mouseEvents(recording).catch(() => null)
      const items: TimelineItem[] = []
      for (const event of events?.events ?? []) {
        if (!inRange(event.t, args.fromMs, args.toMs)) continue
        if (event.type === 'scroll' && !args.includeScrolls) continue
        if (event.type === 'move' && !args.includeMoves) continue
        const item = eventItem(event)
        if (item) items.push(item)
      }
      if (args.includeZooms) {
        for (const zoom of project.zooms) {
          if (!overlaps(zoom.startMs, zoom.endMs, args.fromMs, args.toMs)) continue
          items.push({
            kind: 'zoom',
            atMs: roundMs(zoom.startMs),
            at: timecode(zoom.startMs),
            endMs: roundMs(zoom.endMs),
            end: timecode(zoom.endMs),
            scale: zoom.scale,
            target: { x: roundMs(zoom.target.x), y: roundMs(zoom.target.y) },
            follow: zoom.follow,
            origin: zoom.origin,
          })
        }
      }
      // Stable: at the same instant a zoom (pushed last) comes after the click that made it.
      items.sort((a, b) => a.atMs - b.atMs)
      const counts: Record<string, number> = {}
      for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1
      const { items: pageItems, ...pagination } = page(items, args.offset, args.limit)
      const notes: string[] = []
      if (!events)
        notes.push('This recording has no readable events.jsonl, so there are no clicks.')
      else if (events.skipped > 0) {
        notes.push(`${events.skipped} invalid line(s) in events.jsonl were skipped.`)
      }
      return json({
        recordingId: recording.id,
        recordingName: project.name,
        screen: { width: project.source.width, height: project.source.height },
        durationMs: roundMs(project.durationMs),
        counts,
        ...pagination,
        items: pageItems,
        ...(notes.length > 0 ? { notes } : {}),
      })
    },
  )

  server.registerTool(
    'get_frame',
    {
      title: 'Get frame',
      description:
        'Returns the reference screenshot closest to an instant of a recording (saved every 5 seconds while recording, ~480px wide JPEG), so you can see what was on screen. Also returns the actual time of the frame. Shows the raw screen, without zoom or style.',
      inputSchema: {
        recordingId,
        atMs: z
          .number()
          .min(0)
          .describe('Instant in ms on the recording timeline, e.g. 65000 for 00:01:05.'),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const { scan, recording } = await library.find(args.recordingId)
      if (!recording) return notFound(args.recordingId, scan)
      const frames = await library.frames(recording)
      const frame = nearestFrame(frames, args.atMs)
      if (!frame) {
        return failure(
          `Recording "${recording.project.name}" has no reference frames (frames/ is empty or missing). get_recording and get_click_timeline still work.`,
        )
      }
      let data: Buffer
      try {
        data = await library.readFrame(recording, frame)
      } catch (error) {
        return failure(
          `Could not read ${frame.file}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const requested = at(args.atMs)
      const actual = at(frame.ms)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              recordingId: recording.id,
              recordingName: recording.project.name,
              requestedMs: requested.ms,
              requested: requested.time,
              frameMs: actual.ms,
              frame: actual.time,
              distanceMs: Math.abs(actual.ms - requested.ms),
              file: frame.file,
              ...(args.atMs > recording.project.durationMs
                ? {
                    note: 'The requested instant is past the end of the recording; this is the last frame.',
                  }
                : {}),
            }),
          },
          { type: 'image', data: data.toString('base64'), mimeType: frame.mimeType },
        ],
      }
    },
  )

  return { server, library }
}
