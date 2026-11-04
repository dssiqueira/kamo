import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  IDS,
  TINY_JPEG,
  buildSampleFolder,
  call,
  connect,
  data,
  text,
  type Connected,
} from './helpers.ts'

let dir: string
let mcp: Connected

beforeAll(async () => {
  dir = await buildSampleFolder()
  mcp = await connect(dir)
})

afterAll(async () => {
  await mcp.close()
  await rm(dir, { recursive: true, force: true })
})

describe('tool list', () => {
  it('exposes the six read-only tools', async () => {
    const { tools } = await mcp.client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_click_timeline',
      'get_frame',
      'get_recording',
      'get_transcript',
      'list_recordings',
      'search_recordings',
    ])
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(40)
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.annotations?.openWorldHint).toBe(false)
      expect(tool.inputSchema.type).toBe('object')
    }
  })
})

describe('list_recordings', () => {
  it('lists newest first and reports the corrupted project', async () => {
    const result = data(await call(mcp.client, 'list_recordings'))
    expect(result.dir).toBe(dir)
    expect(result.total).toBe(3)
    expect(result.nextOffset).toBeNull()
    expect(result.recordings.map((r: { id: string }) => r.id)).toEqual([
      IDS.pending,
      IDS.onboarding,
      IDS.billing,
    ])
    const billing = result.recordings[2]
    expect(billing).toMatchObject({
      name: 'Billing walkthrough',
      createdAt: '2026-10-01T12:00:00.000Z',
      duration: '00:00:11',
      resolution: '1920x1080',
      hasTranscript: true,
      transcriptStatus: 'done',
      exportCount: 1,
      cloudLinks: [{ aspect: '16:9', shortId: 'abc123', path: '/v/abc123' }],
    })
    expect(result.recordings[0].hasTranscript).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].folder).toBe('broken-project')
    expect(result.warnings[0].problem).toMatch(/JSON/)
  })

  it('filters by date range (bare dates are whole local days)', async () => {
    const october = data(
      await call(mcp.client, 'list_recordings', { from: '2026-10-01', to: '2026-10-31' }),
    )
    expect(october.recordings.map((r: { id: string }) => r.id)).toEqual([
      IDS.onboarding,
      IDS.billing,
    ])
    const after = data(await call(mcp.client, 'list_recordings', { from: '2026-10-20T00:00:00Z' }))
    expect(after.recordings.map((r: { id: string }) => r.id)).toEqual([IDS.pending])
    const none = data(await call(mcp.client, 'list_recordings', { to: '2020-01-01' }))
    expect(none.total).toBe(0)
    expect(none.message).toMatch(/No recordings in that date range/)
  })

  it('rejects an invalid date', async () => {
    const result = await call(mcp.client, 'list_recordings', { from: 'last tuesday' })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/Invalid "from" date/)
  })

  it('paginates', async () => {
    const first = data(await call(mcp.client, 'list_recordings', { limit: 2 }))
    expect(first.recordings).toHaveLength(2)
    expect(first.nextOffset).toBe(2)
    const second = data(await call(mcp.client, 'list_recordings', { limit: 2, offset: 2 }))
    expect(second.recordings).toHaveLength(1)
    expect(second.nextOffset).toBeNull()
  })

  it('rejects a limit above the maximum', async () => {
    const result = await call(mcp.client, 'list_recordings', { limit: 1000 })
    expect(result.isError).toBe(true)
  })
})

describe('search_recordings', () => {
  it('finds transcript text ignoring case and accents, with the instant', async () => {
    const result = data(await call(mcp.client, 'search_recordings', { query: 'configuracoes' }))
    expect(result.total).toBe(1)
    expect(result.matches[0]).toMatchObject({
      recordingId: IDS.billing,
      recordingName: 'Billing walkthrough',
      match: 'transcript',
      snippet: 'Aqui ficam as Configurações de faturamento.',
      atMs: 2400,
      at: '00:00:02',
      endMs: 6100,
      end: '00:00:06',
    })
    expect(result.searched).toEqual({ recordings: 3, withTranscript: 1 })
    expect(result.note).toMatch(/2 recording\(s\) have no transcript/)
  })

  it('finds names, ranked before transcript hits', async () => {
    const result = data(await call(mcp.client, 'search_recordings', { query: 'ONBOARDING' }))
    expect(result.matches).toEqual([
      expect.objectContaining({ recordingId: IDS.onboarding, match: 'name', atMs: null }),
    ])
  })

  it('needs every word', async () => {
    const both = data(await call(mcp.client, 'search_recordings', { query: 'invoice save' }))
    expect(both.total).toBe(1)
    expect(both.matches[0].atMs).toBe(6100)
    const missing = data(await call(mcp.client, 'search_recordings', { query: 'invoice zebra' }))
    expect(missing.total).toBe(0)
    expect(missing.message).toMatch(/No recordings match/)
  })

  it('sees a transcript that changed on disk', async () => {
    const file = join(dir, IDS.billing, 'transcript.json')
    const original = await readFile(file, 'utf8')
    const before = data(await call(mcp.client, 'search_recordings', { query: 'pineapple' }))
    expect(before.total).toBe(0)
    await writeFile(
      file,
      JSON.stringify({ segments: [{ startMs: 500, endMs: 900, text: 'Pineapple pizza' }] }),
    )
    const after = data(await call(mcp.client, 'search_recordings', { query: 'pineapple' }))
    expect(after.total).toBe(1)
    await writeFile(file, original)
  })
})

describe('get_recording', () => {
  it('returns the full metadata', async () => {
    const result = data(await call(mcp.client, 'get_recording', { recordingId: IDS.billing }))
    expect(result).toMatchObject({
      id: IDS.billing,
      folder: IDS.billing,
      name: 'Billing walkthrough',
      resolution: '1920x1080',
      source: { kind: 'display', width: 1920, height: 1080, fps: 30 },
      trim: { startMs: 0, start: '00:00:00' },
      zoomCount: 1,
      zooms: [
        {
          startMs: 1000,
          start: '00:00:01',
          endMs: 3000,
          end: '00:00:03',
          scale: 2.5,
          target: { x: 300, y: 201 },
          origin: 'manual',
        },
      ],
      style: { padding: 8, radius: 12, shadow: true },
      audio: {
        microphone: { enabled: true, recorded: false, file: 'audio.m4a' },
        system: { enabled: false },
      },
      exports: [{ aspect: '16:9', resolution: '1080p', format: 'mp4' }],
      cloudLinks: [{ shortId: 'abc123' }],
      transcript: { status: 'done', language: 'pt', file: true },
      mouseEvents: { clicks: 4, skippedLines: 1 },
      referenceFrames: { count: 3, intervalMs: 5000, firstMs: 0, lastMs: 10000 },
      files: { 'screen.mp4': false },
    })
  })

  it('works for a recording without events, frames or transcript', async () => {
    const result = data(await call(mcp.client, 'get_recording', { recordingId: IDS.pending }))
    expect(result.name).toBe('Quick note')
    expect(result.mouseEvents).toBeNull()
    expect(result.referenceFrames.count).toBe(0)
  })

  it('explains an unknown or corrupted recording', async () => {
    const unknown = await call(mcp.client, 'get_recording', { recordingId: 'nope' })
    expect(unknown.isError).toBe(true)
    expect(text(unknown)).toMatch(/not found .* Use list_recordings/)
    const broken = await call(mcp.client, 'get_recording', { recordingId: 'broken-project' })
    expect(broken.isError).toBe(true)
    expect(text(broken)).toMatch(/could not be read/)
  })

  it('never resolves a path from the id', async () => {
    const result = await call(mcp.client, 'get_recording', { recordingId: `../${IDS.billing}` })
    expect(result.isError).toBe(true)
  })
})

describe('get_transcript', () => {
  it('returns every segment with times', async () => {
    const result = data(await call(mcp.client, 'get_transcript', { recordingId: IDS.billing }))
    expect(result).toMatchObject({ language: 'pt', model: 'whisper-base', total: 3, edited: false })
    expect(result.segments[1]).toEqual({
      startMs: 2400,
      start: '00:00:02',
      endMs: 6100,
      end: '00:00:06',
      text: 'Aqui ficam as Configurações de faturamento.',
    })
  })

  it('returns only a time range, paginated', async () => {
    const range = data(
      await call(mcp.client, 'get_transcript', {
        recordingId: IDS.billing,
        fromMs: 3000,
        toMs: 7000,
      }),
    )
    expect(range.segments.map((s: { startMs: number }) => s.startMs)).toEqual([2400, 6100])
    const paged = data(
      await call(mcp.client, 'get_transcript', { recordingId: IDS.billing, limit: 1, offset: 1 }),
    )
    expect(paged.segments).toHaveLength(1)
    expect(paged.nextOffset).toBe(2)
  })

  it('explains the optional transcription pack when there is no transcript', async () => {
    const result = await call(mcp.client, 'get_transcript', { recordingId: IDS.onboarding })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toMatch(/has no transcript/)
    expect(text(result)).toMatch(/Transcribe/)
    expect(text(result)).toMatch(/Settings → Packages/)
    const pending = await call(mcp.client, 'get_transcript', { recordingId: IDS.pending })
    expect(text(pending)).toMatch(/still being made/)
  })
})

describe('get_click_timeline', () => {
  it('returns clicks and zooms, never moves by default', async () => {
    const result = data(await call(mcp.client, 'get_click_timeline', { recordingId: IDS.billing }))
    expect(result.screen).toEqual({ width: 1920, height: 1080 })
    expect(result.counts).toEqual({ click: 4, zoom: 1 })
    const kinds = new Set(result.items.map((i: { kind: string }) => i.kind))
    expect(kinds).toEqual(new Set(['click', 'zoom']))
    const click = result.items.find((i: { kind: string }) => i.kind === 'click')
    expect(click).toEqual({
      kind: 'click',
      atMs: expect.any(Number),
      at: expect.stringMatching(/^\d\d:\d\d:\d\d$/),
      x: expect.any(Number),
      y: expect.any(Number),
      button: 'left',
    })
    const times = result.items.map((i: { atMs: number }) => i.atMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(result.notes).toEqual(['1 invalid line(s) in events.jsonl were skipped.'])
  })

  it('includes scrolls and moves only when asked', async () => {
    const scrolls = data(
      await call(mcp.client, 'get_click_timeline', {
        recordingId: IDS.billing,
        includeScrolls: true,
        includeZooms: false,
      }),
    )
    expect(scrolls.counts).toEqual({ click: 4, scroll: 1 })
    expect(scrolls.items.find((i: { kind: string }) => i.kind === 'scroll')).toMatchObject({
      atMs: 9000,
      dx: 0,
      dy: 120,
    })
    const moves = data(
      await call(mcp.client, 'get_click_timeline', {
        recordingId: IDS.billing,
        includeMoves: true,
        fromMs: 0,
        toMs: 1000,
        limit: 10,
      }),
    )
    expect(moves.counts.move).toBeGreaterThan(10)
    expect(moves.items).toHaveLength(10)
    expect(moves.nextOffset).toBe(10)
  })

  it('filters by time range', async () => {
    const all = data(await call(mcp.client, 'get_click_timeline', { recordingId: IDS.onboarding }))
    const firstClick = all.items[0].atMs as number
    const later = data(
      await call(mcp.client, 'get_click_timeline', {
        recordingId: IDS.onboarding,
        fromMs: firstClick + 1,
      }),
    )
    expect(later.total).toBe(all.total - 1)
  })

  it('works without events.jsonl', async () => {
    const result = data(await call(mcp.client, 'get_click_timeline', { recordingId: IDS.pending }))
    expect(result.total).toBe(0)
    expect(result.notes[0]).toMatch(/no readable events.jsonl/)
  })
})

describe('get_frame', () => {
  it('returns the nearest frame as a JPEG image with its real time', async () => {
    const result = await call(mcp.client, 'get_frame', { recordingId: IDS.billing, atMs: 6800 })
    const meta = data(result)
    expect(meta).toMatchObject({
      requestedMs: 6800,
      requested: '00:00:06',
      frameMs: 5000,
      frame: '00:00:05',
      distanceMs: 1800,
      file: 'frames/0005.jpg',
    })
    const image = result.content.find((c) => c.type === 'image')
    expect(image).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })
    if (image?.type !== 'image') throw new Error('no image')
    expect(Buffer.from(image.data, 'base64').equals(TINY_JPEG)).toBe(true)
  })

  it('clamps past the end to the last frame', async () => {
    const meta = data(
      await call(mcp.client, 'get_frame', { recordingId: IDS.billing, atMs: 999_999 }),
    )
    expect(meta.frameMs).toBe(10_000)
    expect(meta.note).toMatch(/past the end/)
  })

  it('explains a recording without frames', async () => {
    const result = await call(mcp.client, 'get_frame', { recordingId: IDS.pending, atMs: 0 })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/no reference frames/)
  })
})

describe('empty or missing folder', () => {
  it('says there are no recordings in that folder', async () => {
    const missing = join(dir, 'does-not-exist')
    const empty = await connect(missing)
    try {
      const list = data(await call(empty.client, 'list_recordings'))
      expect(list.total).toBe(0)
      expect(list.message).toBe(
        `No recordings found in ${missing} (the folder does not exist). Record something with the Kamo desktop app, or start this server with --dir pointing to the Kamo projects folder.`,
      )
      const search = data(await call(empty.client, 'search_recordings', { query: 'x' }))
      expect(search.message).toMatch(/^No recordings found in/)
      const get = await call(empty.client, 'get_frame', { recordingId: IDS.billing, atMs: 0 })
      expect(get.isError).toBe(true)
      expect(text(get)).toMatch(/^No recordings found in/)
    } finally {
      await empty.close()
    }
    const emptyDir = join(dir, 'no-project-json')
    const blank = await connect(emptyDir)
    try {
      const list = data(await call(blank.client, 'list_recordings'))
      expect(list.message).toBe(`No recordings found in ${emptyDir}.`)
    } finally {
      await blank.close()
    }
  })
})
