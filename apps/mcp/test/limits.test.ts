import { createProject } from '@kamo/core'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Library } from '../src/library.ts'
import { writeProject } from './helpers.ts'

// L8: a hostile or huge file in the projects folder must not exhaust memory, and a link must
// never hand the agent a file from outside the projects folder.
const SOURCE = { kind: 'display', width: 1920, height: 1080, scaleFactor: 1, fps: 30 } as const
const project = (id: string, name: string) =>
  createProject({
    id,
    name,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    durationMs: 5000,
    source: SOURCE,
  })

let root: string
let dir: string
let outside: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kamo-mcp-limits-'))
  dir = join(root, 'projects')
  outside = join(root, 'elsewhere')
  await mkdir(dir)
  await mkdir(outside)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('read limits', () => {
  it('skips a project folder that links outside the projects folder', async () => {
    const inside = '44444444-4444-4444-8444-444444444444'
    const linked = '55555555-5555-4555-8555-555555555555'
    await writeProject(dir, { project: project(inside, 'Inside') })
    await writeProject(outside, { project: project(linked, 'Outside') })
    // A junction needs no admin rights on Windows; a plain directory link elsewhere.
    await symlink(join(outside, linked), join(dir, linked), 'junction')
    const scan = await new Library(dir).scan()
    expect(scan.recordings.map((r) => r.id)).toEqual([inside])
    expect(scan.warnings).toEqual([
      { folder: linked, problem: 'project.json links outside the projects folder' },
    ])
  })

  it('refuses files above the cap', async () => {
    const id = '66666666-6666-4666-8666-666666666666'
    await writeProject(dir, {
      project: project(id, 'Big'),
      events: '{"t":0,"x":1,"y":1,"type":"move"}\n'.repeat(100),
      transcript: { segments: [{ startMs: 0, endMs: 1000, text: 'x'.repeat(2000) }] },
    })
    const library = new Library(dir, { maxBytes: { events: 1000, transcript: 1000 } })
    const { recording } = await library.find(id)
    expect(recording).not.toBeNull()
    await expect(library.mouseEvents(recording!)).rejects.toThrow(/more than the 1000/)
    expect(await library.transcript(recording!)).toMatchObject({
      kind: 'invalid',
      problem: expect.stringMatching(/transcript\.json is \d+ bytes/),
    })
    const tiny = new Library(dir, { maxBytes: { project: 10 } })
    expect((await tiny.scan()).warnings[0]?.problem).toMatch(/project\.json is \d+ bytes/)
  })

  it('reads files that stay inside the folder normally', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    await writeProject(dir, { project: project(id, 'Normal'), frames: [0] })
    const library = new Library(dir)
    const { recording } = await library.find(id)
    const [frame] = await library.frames(recording!)
    expect((await library.readFrame(recording!, frame!)).length).toBeGreaterThan(0)
  })
})
