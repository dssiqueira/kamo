// M-01: search_recordings answers in < 1s with 500 recordings; get_frame in < 500ms.
import { createProject } from '@kamo/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, connect, data, writeProject, type Connected } from './helpers.ts'

const RECORDINGS = 500
const SEGMENTS = 60
const WORDS = ['dashboard', 'invoice', 'settings', 'deploy', 'checkout', 'report', 'onboarding']

let dir: string
let mcp: Connected

function uuid(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-mcp-500-'))
  const jobs: Promise<unknown>[] = []
  for (let i = 0; i < RECORDINGS; i++) {
    const project = createProject({
      id: uuid(i),
      name: `Recording ${i} ${WORDS[i % WORDS.length]}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000),
      durationMs: SEGMENTS * 5000,
      source: { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 },
    })
    const segments = Array.from({ length: SEGMENTS }, (_, s) => ({
      startMs: s * 5000,
      endMs: s * 5000 + 4800,
      text: `Segment ${s} of recording ${i}: now we open the ${WORDS[(i + s) % WORDS.length]} page and check that everything looks right.`,
    }))
    jobs.push(
      writeProject(dir, { project, transcript: { language: 'en', segments }, frames: [0, 5, 10] }),
    )
    // Keep the number of open files bounded while writing.
    if (jobs.length >= 50) await Promise.all(jobs.splice(0))
  }
  await Promise.all(jobs)
  mcp = await connect(dir)
}, 120_000)

afterAll(async () => {
  await mcp.close()
  await rm(dir, { recursive: true, force: true })
})

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now()
  const value = await fn()
  return [value, performance.now() - start]
}

describe(`${RECORDINGS} recordings`, () => {
  it('search_recordings answers in under 1s, cold and warm', async () => {
    const [cold, coldMs] = await timed(async () =>
      data(await call(mcp.client, 'search_recordings', { query: 'invoice page' })),
    )
    const [warm, warmMs] = await timed(async () =>
      data(await call(mcp.client, 'search_recordings', { query: 'checkout' })),
    )
    process.stderr.write(
      `[perf] search_recordings over ${RECORDINGS} recordings: cold ${coldMs.toFixed(0)}ms, warm ${warmMs.toFixed(0)}ms\n`,
    )
    expect(cold.searched).toEqual({ recordings: RECORDINGS, withTranscript: RECORDINGS })
    expect(cold.total).toBeGreaterThan(1000)
    expect(cold.matches).toHaveLength(20)
    expect(warm.matches[0].match).toBe('name')
    expect(coldMs).toBeLessThan(1000)
    expect(warmMs).toBeLessThan(1000)
  })

  it('list_recordings stays fast', async () => {
    const [list, ms] = await timed(async () =>
      data(await call(mcp.client, 'list_recordings', { limit: 100 })),
    )
    process.stderr.write(`[perf] list_recordings (warm): ${ms.toFixed(0)}ms\n`)
    expect(list.total).toBe(RECORDINGS)
    expect(list.recordings[0].id).toBe(uuid(RECORDINGS - 1))
    expect(ms).toBeLessThan(1000)
  })

  it('get_frame answers in under 500ms, even as the first call of a new server', async () => {
    const fresh = await connect(dir)
    try {
      const [result, coldMs] = await timed(() =>
        call(fresh.client, 'get_frame', { recordingId: uuid(123), atMs: 7000 }),
      )
      const [, warmMs] = await timed(() =>
        call(fresh.client, 'get_frame', { recordingId: uuid(321), atMs: 2000 }),
      )
      process.stderr.write(
        `[perf] get_frame: cold ${coldMs.toFixed(0)}ms, warm ${warmMs.toFixed(0)}ms\n`,
      )
      expect(data(result).frameMs).toBe(5000)
      expect(coldMs).toBeLessThan(500)
      expect(warmMs).toBeLessThan(500)
    } finally {
      await fresh.close()
    }
  })
})
