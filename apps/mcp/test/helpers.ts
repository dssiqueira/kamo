// Test-only helpers: they build throwaway projects folders on disk, so they live outside src/
// (src/ is scanned for write APIs and must never contain one).
import { createProject, parseEvents, serializeProject, type Project } from '@kamo/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKamoServer } from '../src/server.ts'

/** A real 8×8 baseline JPEG (630 bytes), so clients can decode what get_frame returns. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAFk9Q05DOFlOSE5kXllphd6QhXp6hf/CzaHe////////////////////////////////////////////////////2wBDAV5kZIV1hf+QkP//////////////////////////////////////////////////////////////////////////wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB1FFFIk//Z',
  'base64',
)

export const FIXTURES = new URL('../../../packages/core/fixtures/', import.meta.url)

export function fixture(name: string): Promise<string> {
  return readFile(new URL(name, FIXTURES), 'utf8')
}

const SOURCE = { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 } as const

export const IDS = {
  billing: '11111111-1111-4111-8111-111111111111',
  onboarding: '22222222-2222-4222-8222-222222222222',
  pending: '33333333-3333-4333-8333-333333333333',
} as const

export interface ProjectFiles {
  project: Project
  events?: string
  transcript?: unknown
  /** seconds of the reference frames to write */
  frames?: number[]
  /** written under this folder name instead of the project id */
  folder?: string
}

export async function writeProject(dir: string, files: ProjectFiles): Promise<string> {
  const path = join(dir, files.folder ?? files.project.id)
  await mkdir(join(path, 'frames'), { recursive: true })
  await writeFile(join(path, 'project.json'), serializeProject(files.project))
  if (files.events !== undefined) await writeFile(join(path, 'events.jsonl'), files.events)
  if (files.transcript !== undefined) {
    await writeFile(join(path, 'transcript.json'), JSON.stringify(files.transcript))
  }
  for (const second of files.frames ?? []) {
    await writeFile(join(path, 'frames', `${String(second).padStart(4, '0')}.jpg`), TINY_JPEG)
  }
  return path
}

/**
 * Three projects plus one corrupted and one folder that is not a project:
 * - billing: spaced-clicks events (+ a scroll and a broken line), transcript, 3 frames, cloud
 *   link, an export and a manual zoom
 * - onboarding: click-burst events, no transcript, 2 frames
 * - pending: no events, no frames, transcript still pending
 */
export async function buildSampleFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kamo-mcp-test-'))

  const spaced = await fixture('spaced-clicks.jsonl')
  const billingEvents = `${spaced}{"t":9000,"x":500,"y":500,"type":"scroll","dx":0,"dy":120}\n{"t":95`
  const billingDuration = Math.ceil(parseEvents(spaced).events.at(-1)!.t) + 1000
  const billing = createProject({
    id: IDS.billing,
    name: 'Billing walkthrough',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    durationMs: billingDuration,
    source: SOURCE,
    audio: { mic: true, system: false },
  })
  billing.zooms = [
    {
      id: 'manual-1',
      startMs: 1000,
      endMs: 3000,
      scale: 2.5,
      target: { x: 300.4, y: 200.6 },
      follow: false,
      origin: 'manual',
      leadMs: 300,
    },
  ]
  billing.transcript = { status: 'done', language: 'pt', model: 'whisper-base' }
  billing.cloud = [
    {
      videoId: '44444444-4444-4444-8444-444444444444',
      shortId: 'abc123',
      aspect: '16:9',
      uploadedAt: '2026-10-02T10:00:00.000Z',
    },
  ]
  billing.exports = [
    {
      aspect: '16:9',
      resolution: '1080p',
      fps: 30,
      format: 'mp4',
      path: 'C:/Videos/Billing walkthrough.mp4',
      createdAt: '2026-10-01T13:00:00.000Z',
    },
  ]
  await writeProject(dir, {
    project: billing,
    events: billingEvents,
    frames: [0, 5, 10],
    transcript: {
      language: 'pt',
      model: 'whisper-base',
      createdAt: '2026-10-01T12:30:00.000Z',
      edited: false,
      segments: [
        { startMs: 0, endMs: 2400, text: 'Hoje vou mostrar a tela de cobrança.' },
        { startMs: 2400, endMs: 6100, text: 'Aqui ficam as Configurações de faturamento.' },
        { startMs: 6100, endMs: 9800, text: 'Then we click save and the invoice is ready.' },
      ],
    },
  })

  const burst = await fixture('click-burst.jsonl')
  const onboarding = createProject({
    id: IDS.onboarding,
    name: 'Onboarding demo',
    createdAt: new Date('2026-10-15T09:30:00Z'),
    durationMs: Math.ceil(parseEvents(burst).events.at(-1)!.t) + 1000,
    source: SOURCE,
  })
  await writeProject(dir, { project: onboarding, events: burst, frames: [0, 5] })

  const pending = createProject({
    id: IDS.pending,
    name: 'Quick note',
    createdAt: new Date('2026-11-01T18:00:00Z'),
    durationMs: 4000,
    source: SOURCE,
  })
  pending.transcript = { status: 'pending' }
  await writeProject(dir, { project: pending })

  // Corrupted: skipped and reported in `warnings`, never fatal.
  await mkdir(join(dir, 'broken-project'))
  await writeFile(join(dir, 'broken-project', 'project.json'), '{"version": 1, "id": ')
  // Not a project at all (e.g. a recording still being saved): silently ignored.
  await mkdir(join(dir, 'no-project-json'))
  return dir
}

export interface Connected {
  client: Client
  close(): Promise<void>
}

/** The real server and the SDK client, linked in memory (no stdio, no sockets). */
export async function connect(dir: string): Promise<Connected> {
  const { server } = createKamoServer({ dir })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'kamo-mcp-test', version: '0.0.0' })
  await client.connect(clientTransport)
  return {
    client,
    async close() {
      await client.close()
      await server.close()
    },
  }
}

export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult
}

/** The first text block: JSON for data answers, plain text for messages. */
export function text(result: CallToolResult): string {
  const block = result.content.find((c) => c.type === 'text')
  if (!block || block.type !== 'text') throw new Error('no text block')
  return block.text
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function data(result: CallToolResult): any {
  return JSON.parse(text(result))
}
