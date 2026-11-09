import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PacksStatus } from '../../shared/packs.ts'
import { DEV_MODELS_ENV, KNOWN_PACKS, MODEL_REVISION, knownPacks } from './config.ts'
import { allowedFinalUrl } from './download.ts'
import { PackManager } from './manager.ts'
import { fakeModel, startFakeModelServer, type FakeModelServer } from './testing.ts'

const log = { info() {}, warn() {} }

let dir: string
let server: FakeModelServer | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-packs-'))
})
afterEach(async () => {
  await server?.close()
  server = undefined
  await rm(dir, { recursive: true, force: true })
})

function manager(overrides: Partial<ConstructorParameters<typeof PackManager>[0]> = {}) {
  return new PackManager({
    dir: join(dir, 'packs'),
    registryFile: join(dir, 'packs.json'),
    packs: server?.packs ?? KNOWN_PACKS,
    fetch: (input, init) => fetch(input, init),
    freeBytes: async () => 10 ** 12,
    program: () => '/app/resources/whisper/whisper-cli',
    log,
    progressIntervalMs: 0,
    ...overrides,
  })
}

const light = (status: PacksStatus) => status.packs.find((p) => p.id === 'transcribe-light')!

describe('model sources', () => {
  it('pins each model to one Hugging Face revision, size and SHA-256', () => {
    expect(MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/)
    for (const pack of KNOWN_PACKS) {
      expect(pack.source.url).toBe(
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_REVISION}/${pack.source.file}`,
      )
      expect(pack.source.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(pack.version).toBe(MODEL_REVISION)
    }
    expect(KNOWN_PACKS.map((p) => [p.id, p.source.file, p.source.size])).toEqual([
      ['transcribe-light', 'ggml-base.bin', 147_951_465],
      ['transcribe-accurate', 'ggml-small.bin', 487_601_967],
    ])
  })

  it('takes a dev override only for plain http on this machine', async () => {
    const file = join(dir, 'models.json')
    const entry = (url: string) => ({ url, size: 10, sha256: 'a'.repeat(64), version: 'rev9' })
    await writeFile(
      file,
      JSON.stringify({
        'transcribe-light': entry('http://127.0.0.1:9/resolve/ggml-base.bin'),
        'transcribe-accurate': entry('http://evil.test/ggml-small.bin'),
      }),
    )
    const packs = knownPacks({ [DEV_MODELS_ENV]: file })
    expect(packs[0]!.source.url).toBe('http://127.0.0.1:9/resolve/ggml-base.bin')
    expect(packs[0]!.version).toBe('rev9')
    expect(packs[1]).toEqual(KNOWN_PACKS[1])
    expect(knownPacks({})).toBe(KNOWN_PACKS)
    expect(knownPacks({ [DEV_MODELS_ENV]: join(dir, 'missing.json') })).toBe(KNOWN_PACKS)
  })

  it('follows redirects to https only (plain http only between local test servers)', () => {
    const hf = 'https://huggingface.co/x/resolve/r/ggml-base.bin'
    expect(allowedFinalUrl(hf, 'https://cdn.hf.co/abc?sig=1')).toBe(true)
    expect(allowedFinalUrl(hf, 'http://cdn.hf.co/abc')).toBe(false)
    expect(allowedFinalUrl('http://127.0.0.1:1/a', 'http://127.0.0.1:1/b')).toBe(true)
    expect(allowedFinalUrl('http://127.0.0.1:1/a', 'http://evil.test/b')).toBe(false)
    expect(allowedFinalUrl(hf, 'not a url')).toBe(false)
  })
})

describe('PackManager', () => {
  it('lists the models without any network call', async () => {
    let calls = 0
    const packs = manager({
      fetch: async () => {
        calls++
        throw new Error('no network')
      },
    })
    const status = await packs.status()
    expect(status.program).toBe('ready')
    expect(status.packs.map((p) => [p.id, p.quality, p.state, p.sizeBytes])).toEqual([
      ['transcribe-light', 'light', 'not_installed', 147_951_465],
      ['transcribe-accurate', 'accurate', 'not_installed', 487_601_967],
    ])
    expect(calls).toBe(0)
  })

  it('says when this build has no whisper-cli', async () => {
    expect((await manager({ program: () => null }).status()).program).toBe('missing')
  })

  it('downloads through the redirect, verifies, installs, then removes', async () => {
    server = await startFakeModelServer({ models: [fakeModel()] })
    const packs = manager()
    const events: PacksStatus[] = []
    packs.onChange((status) => events.push(status))

    await packs.install('transcribe-light')
    const installed = light(await packs.status())
    expect(installed).toMatchObject({ state: 'installed', installedVersion: 'rev1', error: null })
    expect(installed.updateAvailable).toBe(false)
    expect(events.some((s) => light(s).state === 'downloading')).toBe(true)
    expect(server.requests).toEqual(['/resolve/ggml-base.bin', '/cdn/ggml-base.bin'])

    const transcriber = await packs.transcriber()
    expect(transcriber?.id).toBe('transcribe-light')
    expect(transcriber?.model.name).toBe('whisper-base')
    expect(transcriber?.model.path).toBe(
      join(dir, 'packs', 'transcribe-light', 'rev1', 'ggml-base.bin'),
    )
    const registry = JSON.parse(await readFile(join(dir, 'packs.json'), 'utf8'))
    expect(registry.version).toBe(2)
    expect(registry.packs['transcribe-light'].model).toMatchObject({
      name: 'whisper-base',
      file: 'ggml-base.bin',
      size: 256 * 1024,
    })

    const release = packs.retain('transcribe-light')
    await expect(packs.remove('transcribe-light')).rejects.toMatchObject({ code: 'pack_busy' })
    release()
    await packs.remove('transcribe-light')
    expect(light(await packs.status()).state).toBe('not_installed')
    expect(await packs.transcriber()).toBeNull()
    await expect(stat(join(dir, 'packs', 'transcribe-light'))).rejects.toThrow()
  })

  it('never feeds whisper a model that changed after the install', async () => {
    server = await startFakeModelServer({ models: [fakeModel()] })
    const packs = manager()
    await packs.install('transcribe-light')
    const transcriber = await packs.transcriber()
    const model = await readFile(transcriber!.model.path)
    const other = Buffer.from(model)
    other[0] = (other[0]! + 1) % 256
    await writeFile(transcriber!.model.path, other)
    expect(await packs.transcriber()).toBeNull()
    await writeFile(transcriber!.model.path, model)
    expect(await packs.transcriber()).not.toBeNull()
  })

  it('ignores an installed pack whose recorded names would leave the pack folder', async () => {
    const model = { name: 'whisper-base', size: 10, sha256: 'a'.repeat(64) }
    for (const bad of [
      { version: '..', model: { ...model, file: 'ggml-base.bin' } },
      { version: 'rev1', model: { ...model, file: '../ggml-base.bin' } },
    ]) {
      const registry = {
        version: 2,
        packs: { 'transcribe-light': { ...bad, installedAt: new Date().toISOString() } },
      }
      await writeFile(join(dir, 'packs.json'), JSON.stringify(registry))
      const packs = manager()
      expect(light(await packs.status()).installedVersion).toBeNull()
      expect(await packs.transcriber()).toBeNull()
    }
  })

  it('treats a packs.json from the old pack format as nothing installed', async () => {
    await writeFile(
      join(dir, 'packs.json'),
      JSON.stringify({ version: 1, packs: { 'transcribe-light': { version: '1.0.0' } } }),
    )
    expect(light(await manager().status()).state).toBe('not_installed')
  })

  it('pauses and resumes with an HTTP range, across the redirect', async () => {
    server = await startFakeModelServer({
      models: [fakeModel('transcribe-light', 2 * 1024 * 1024)],
      chunkBytes: 16 * 1024,
      chunkDelayMs: 2,
    })
    const packs = manager()
    let paused = false
    packs.onChange((status) => {
      const progress = light(status).progress
      if (!paused && progress && progress.receivedBytes > 256 * 1024) {
        paused = true
        packs.pause('transcribe-light')
      }
    })
    await packs.install('transcribe-light')
    const afterPause = light(await packs.status())
    expect(afterPause.state).toBe('paused')
    expect(afterPause.progress!.receivedBytes).toBeGreaterThan(0)
    expect(afterPause.progress!.receivedBytes).toBeLessThan(afterPause.progress!.totalBytes)

    await packs.install('transcribe-light')
    expect(light(await packs.status()).state).toBe('installed')
    expect(server.ranges.some((r) => r.startsWith('/cdn/ggml-base.bin bytes='))).toBe(true)
    expect(await packs.transcriber()).not.toBeNull()
  })

  it('finds a download a closed app left half done', async () => {
    server = await startFakeModelServer({
      models: [fakeModel('transcribe-light', 2 * 1024 * 1024)],
      chunkBytes: 16 * 1024,
      chunkDelayMs: 2,
    })
    const first = manager()
    first.onChange((status) => {
      if ((light(status).progress?.receivedBytes ?? 0) > 128 * 1024) first.pause('transcribe-light')
    })
    await first.install('transcribe-light')
    // A new app session: it shows as paused, and Download resumes it.
    const second = manager()
    expect(light(await second.status()).state).toBe('paused')
    await second.install('transcribe-light')
    expect(light(await second.status()).state).toBe('installed')
  })

  it('cancels and deletes what arrived', async () => {
    server = await startFakeModelServer({
      models: [fakeModel('transcribe-light', 2 * 1024 * 1024)],
      chunkBytes: 16 * 1024,
      chunkDelayMs: 2,
    })
    const packs = manager()
    let cancelling: Promise<void> | undefined
    packs.onChange((status) => {
      if (!cancelling && (light(status).progress?.receivedBytes ?? 0) > 64 * 1024) {
        cancelling = packs.cancel('transcribe-light')
      }
    })
    await packs.install('transcribe-light')
    await cancelling
    expect(light(await packs.status()).state).toBe('not_installed')
    expect(await readdir(join(dir, 'packs', '.downloads')).catch(() => [])).toEqual([])
  })

  it('deletes a damaged download and starts it over on the next try', async () => {
    server = await startFakeModelServer({ models: [fakeModel()], corrupt: 'transcribe-light' })
    const packs = manager()
    await packs.install('transcribe-light')
    const failed = light(await packs.status())
    expect(failed).toMatchObject({ state: 'failed', error: 'checksum_mismatch', progress: null })
    expect(await packs.transcriber()).toBeNull()
    expect(await readdir(join(dir, 'packs', '.downloads', 'transcribe-light-rev1'))).toEqual([])
  })

  it('warns about disk space before downloading', async () => {
    server = await startFakeModelServer({ models: [fakeModel()] })
    const packs = manager({ freeBytes: async () => 1000 })
    await packs.install('transcribe-light')
    const status = light(await packs.status())
    expect(status.error).toBe('disk_space')
    expect(status.requiredBytes).toBeGreaterThan(1000)
    expect(server.requests).toEqual([])
  })

  it('tells offline from Hugging Face unreachable, and keeps what arrived', async () => {
    const offline = manager({
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
      isOnline: () => false,
    })
    await offline.install('transcribe-light')
    expect(light(await offline.status())).toMatchObject({ state: 'failed', error: 'offline' })

    const unreachable = manager({
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
      isOnline: () => true,
    })
    await unreachable.install('transcribe-light')
    expect(light(await unreachable.status()).error).toBe('source_unreachable')
  })

  it('stops a download that stalls, keeps it, and resumes it', async () => {
    const model = fakeModel('transcribe-light', 512 * 1024)
    server = await startFakeModelServer({
      models: [model],
      chunkBytes: 16 * 1024,
      stallAfterBytes: 128 * 1024,
    })
    const packs = manager({ stallMs: 150, isOnline: () => true })
    await packs.install('transcribe-light')
    const stalled = light(await packs.status())
    expect(stalled).toMatchObject({ state: 'failed', error: 'source_unreachable' })
    expect(stalled.progress!.receivedBytes).toBe(128 * 1024)
    await server.close()

    // Same file from a server that sends everything: "Try again" continues with a range.
    const sources = server.packs
    server = await startFakeModelServer({ models: [model] })
    const port = new URL(server.url).port
    const retry = manager({
      packs: sources.map((p) => ({
        ...p,
        source: { ...p.source, url: p.source.url.replace(/:\d+\//, `:${port}/`) },
      })),
    })
    await retry.install('transcribe-light')
    expect(light(await retry.status()).state).toBe('installed')
    expect(server.ranges).toEqual([`/cdn/ggml-base.bin bytes=${128 * 1024}-`])
  })

  it('reports an HTTP error from Hugging Face as download_failed, keeping what arrived', async () => {
    const options: Parameters<typeof startFakeModelServer>[0] = {
      models: [fakeModel('transcribe-light', 512 * 1024)],
      chunkBytes: 16 * 1024,
      stallAfterBytes: 64 * 1024,
    }
    server = await startFakeModelServer(options)
    const packs = manager({ stallMs: 150 })
    await packs.install('transcribe-light')
    options.status = 503
    await packs.install('transcribe-light')
    expect(light(await packs.status())).toMatchObject({
      state: 'failed',
      error: 'download_failed',
      progress: { receivedBytes: 64 * 1024, totalBytes: 512 * 1024 },
    })
  })

  it('works with a server that ignores ranges', async () => {
    server = await startFakeModelServer({
      models: [fakeModel('transcribe-light', 1024 * 1024)],
      noRanges: true,
      chunkBytes: 16 * 1024,
      chunkDelayMs: 2,
    })
    const packs = manager()
    let paused = false
    packs.onChange((status) => {
      if (!paused && (light(status).progress?.receivedBytes ?? 0) > 200 * 1024) {
        paused = true
        packs.pause('transcribe-light')
      }
    })
    await packs.install('transcribe-light')
    await packs.install('transcribe-light')
    expect(light(await packs.status()).state).toBe('installed')
  })

  it('offers the newer file a later app pins, and replaces the old one once it is in', async () => {
    server = await startFakeModelServer({ models: [fakeModel()], version: 'rev1' })
    await manager().install('transcribe-light')
    await server.close()

    server = await startFakeModelServer({
      models: [fakeModel('transcribe-light', 300 * 1024)],
      version: 'rev2',
    })
    const next = manager()
    const offered = light(await next.status())
    expect(offered.installedVersion).toBe('rev1')
    expect(offered.updateAvailable).toBe(true)
    // The old one keeps working until the new one is in.
    expect((await next.transcriber())?.version).toBe('rev1')
    await next.install('transcribe-light')
    const updated = light(await next.status())
    expect(updated).toMatchObject({ installedVersion: 'rev2', updateAvailable: false })
    expect(await readdir(join(dir, 'packs', 'transcribe-light'))).toEqual(['rev2'])
  })
})
