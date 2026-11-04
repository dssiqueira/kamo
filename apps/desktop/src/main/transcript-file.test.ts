import { PROJECT_FILES, createProject, parseTranscript, saveProject } from '@kamo/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileProjectStore } from './storage/index.ts'
import { loadTranscriptText, saveEditedTranscript } from './transcript-file.ts'

let root: string
let store: FileProjectStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kamo-transcript-'))
  store = new FileProjectStore(join(root, 'projects'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const transcript = {
  version: 1,
  language: 'pt',
  model: 'whisper-base',
  createdAt: '2026-11-04T10:00:00.000Z',
  segments: [{ startMs: 0, endMs: 1500, text: 'Olá, pessoal!' }],
  edited: false,
} as const

async function project() {
  const p = createProject({
    name: 'Demo',
    durationMs: 5000,
    source: { kind: 'display', width: 1280, height: 720, scaleFactor: 1, fps: 30 },
  })
  await saveProject(store, p)
  return p.id
}

describe('caption edits written back to transcript.json (A-06)', () => {
  it('writes the corrected transcript, always marked edited', async () => {
    const id = await project()
    await store.writeText(id, PROJECT_FILES.transcript, JSON.stringify(transcript))
    const fixed = { ...transcript, segments: [{ startMs: 0, endMs: 1500, text: 'Olá, gente!' }] }
    await saveEditedTranscript(store, id, fixed)
    const saved = parseTranscript((await loadTranscriptText(store, id)) ?? '')
    expect(saved?.edited).toBe(true)
    expect(saved?.segments[0]?.text).toBe('Olá, gente!')
  })

  it('refuses invalid data and never creates a transcript', async () => {
    const id = await project()
    await expect(saveEditedTranscript(store, id, transcript)).rejects.toMatchObject({
      code: 'transcript_not_found',
    })
    expect(await loadTranscriptText(store, id)).toBeNull()
    await store.writeText(id, PROJECT_FILES.transcript, JSON.stringify(transcript))
    await expect(
      saveEditedTranscript(store, id, {
        ...transcript,
        segments: [{ startMs: 0, endMs: 1, text: '' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_transcript' })
    await expect(
      saveEditedTranscript(store, '00000000-0000-4000-8000-000000000000', transcript),
    ).rejects.toMatchObject({ code: 'project_not_found' })
  })
})
