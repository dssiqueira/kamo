import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PacksStatus } from '../../shared/packs.ts'
import { DEFAULT_MANIFEST_URL, manifestUrl, platformKey } from './config.ts'
import { ManifestError, parseManifest } from './manifest.ts'
import { CatalogHttpError, PackManager, catalogErrorCode } from './manager.ts'
import {
  fakeCompatibilityPack,
  fakeTranscriptionPack,
  startFakePackServer,
  type FakePackServer,
} from './testing.ts'

const log = { info() {}, warn() {} }

let dir: string
let server: FakePackServer | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kamo-packs-'))
})
afterEach(async () => {
  await server?.close()
  server = undefined
  await rm(dir, { recursive: true, force: true })
})

function manager(
  url: string,
  overrides: Partial<ConstructorParameters<typeof PackManager>[0]> = {},
) {
  return new PackManager({
    dir: join(dir, 'packs'),
    registryFile: join(dir, 'packs.json'),
    manifestUrl: url,
    platform: platformKey(),
    fetch: (input, init) => fetch(input, init),
    freeBytes: async () => 10 ** 12,
    log,
    progressIntervalMs: 0,
    ...overrides,
  })
}

const light = (status: PacksStatus) => status.packs.find((p) => p.id === 'transcribe-light')!

describe('manifestUrl', () => {
  it('uses GitHub Releases unless a safe override is set', () => {
    expect(manifestUrl({}, { packaged: true })).toBe(DEFAULT_MANIFEST_URL)
    expect(
      manifestUrl({ KAMO_PACKS_MANIFEST_URL: 'https://example.com/m.json' }, { packaged: true }),
    ).toBe('https://example.com/m.json')
    const local = { KAMO_PACKS_MANIFEST_URL: 'http://127.0.0.1:9999/packs-manifest.json' }
    expect(manifestUrl(local, { packaged: false })).toBe(local.KAMO_PACKS_MANIFEST_URL)
    // Plain http only for this machine, and never in a packaged app.
    expect(manifestUrl(local, { packaged: true })).toBe(DEFAULT_MANIFEST_URL)
    expect(
      manifestUrl({ KAMO_PACKS_MANIFEST_URL: 'http://evil.test/m' }, { packaged: false }),
    ).toBe(DEFAULT_MANIFEST_URL)
  })
})

describe('parseManifest', () => {
  const file = (path: string, url = 'https://github.com/x/releases/download/packs/a') => ({
    path,
    url,
    size: 10,
    sha256: 'a'.repeat(64),
  })
  const pack = (files: unknown[], entry = 'bin/w') => ({
    id: 'transcribe-light',
    version: '1.0.0',
    kind: 'transcription',
    model: { name: 'whisper-base', path: 'models/m.bin' },
    platforms: { 'win32-x64': { entry, files } },
  })
  const url = 'https://github.com/x/releases/download/packs/packs-manifest.json'

  it('keeps consistent platforms only', () => {
    const ok = parseManifest(
      { schema: 1, packs: [pack([file('bin/w'), file('models/m.bin')])] },
      url,
    )
    expect(Object.keys(ok.packs[0]!.platforms)).toEqual(['win32-x64'])
    // Files on another host, a missing entry or a path escaping the folder: dropped.
    const otherHost = parseManifest(
      { schema: 1, packs: [pack([file('bin/w', 'https://evil.test/w'), file('models/m.bin')])] },
      url,
    )
    expect(otherHost.packs[0]!.platforms).toEqual({})
    const noEntry = parseManifest({ schema: 1, packs: [pack([file('models/m.bin')])] }, url)
    expect(noEntry.packs[0]!.platforms).toEqual({})
    const escape = parseManifest(
      { schema: 1, packs: [pack([file('../w'), file('models/m.bin')], '../w')] },
      url,
    )
    expect(escape.packs).toEqual([])
  })

  it('refuses a version that is not a plain folder name', () => {
    for (const version of ['.', '..', '../x', 'a/b', String.raw`a\b`, '-1', '']) {
      const bad = { ...pack([file('bin/w'), file('models/m.bin')]), version }
      expect(parseManifest({ schema: 1, packs: [bad] }, url).packs).toEqual([])
    }
  })

  it('rejects what is not a manifest', () => {
    expect(() => parseManifest({ schema: 2, packs: [] }, url)).toThrow()
    expect(() => parseManifest([], url)).toThrow()
  })
})

describe('PackManager', () => {
  it('lists the known packs without any network call', async () => {
    let calls = 0
    const packs = manager('http://127.0.0.1:1/packs-manifest.json', {
      fetch: async () => {
        calls++
        throw new Error('no network')
      },
    })
    const status = await packs.status()
    expect(status.catalog).toBe('idle')
    expect(status.packs.map((p) => [p.id, p.state, p.sizeExact])).toEqual([
      ['transcribe-light', 'not_installed', false],
      ['transcribe-accurate', 'not_installed', false],
      ['video-compatibility', 'not_installed', false],
    ])
    expect(status.packs.map((p) => [p.kind, p.quality])).toEqual([
      ['transcription', 'light'],
      ['transcription', 'accurate'],
      ['compatibility', null],
    ])
    expect(calls).toBe(0)
  })

  it('installs the compatibility pack (no model): a program, never a transcriber', async () => {
    server = await startFakePackServer({ packs: [fakeCompatibilityPack()] })
    const packs = manager(server.manifestUrl)
    await packs.install('video-compatibility')
    const compat = (await packs.status()).packs.find((p) => p.id === 'video-compatibility')!
    expect(compat).toMatchObject({ state: 'installed', installedVersion: '1.0.0', error: null })
    const program = await packs.program('video-compatibility')
    expect(program?.entry).toMatch(/ffmpeg.mjs$/)
    expect((await stat(program!.entry)).isFile()).toBe(true)
    expect(await packs.transcriber('video-compatibility')).toBeNull()
    const registry = JSON.parse(await readFile(join(dir, 'packs.json'), 'utf8'))
    expect(registry.packs['video-compatibility'].model).toBeUndefined()
    // Swapped program: refused before it can run as Kamo.
    await writeFile(program!.entry, 'console.log("not ffmpeg")')
    expect(await packs.program('video-compatibility')).toBeNull()
    // Busy while an export uses it.
    const release = packs.retain('video-compatibility')
    await expect(packs.remove('video-compatibility')).rejects.toMatchObject({ code: 'pack_busy' })
    release()
    await packs.remove('video-compatibility')
    expect(await packs.program('video-compatibility')).toBeNull()
  })

  it('never runs a pack whose program changed after the install', async () => {
    server = await startFakePackServer({ packs: [fakeTranscriptionPack()] })
    const packs = manager(server.manifestUrl)
    await packs.install('transcribe-light')
    const transcriber = await packs.transcriber()
    expect(transcriber).not.toBeNull()
    const original = await readFile(transcriber!.entry)
    // Same size, other bytes: only the hash can tell.
    const swapped = Buffer.from(original)
    swapped[0] = swapped[0] === 0x20 ? 0x21 : 0x20
    await writeFile(transcriber!.entry, swapped)
    expect(await packs.transcriber()).toBeNull()
    await writeFile(transcriber!.entry, original)
    expect(await packs.transcriber()).not.toBeNull()
    // The model too, once its size or mtime changes.
    const model = await readFile(transcriber!.model.path)
    const other = Buffer.from(model)
    other[0] = (other[0]! + 1) % 256
    await writeFile(transcriber!.model.path, other)
    expect(await packs.transcriber()).toBeNull()
  })

  it('ignores an installed pack whose recorded version would leave the pack folder', async () => {
    const registry = {
      version: 1,
      packs: {
        'transcribe-light': {
          version: '..',
          installedAt: new Date().toISOString(),
          entry: 'bin/w',
          model: { name: 'whisper-base', path: 'models/m.bin' },
          files: [],
        },
      },
    }
    await writeFile(join(dir, 'packs.json'), JSON.stringify(registry))
    const packs = manager('http://127.0.0.1:1/packs-manifest.json')
    expect(light(await packs.status()).installedVersion).toBeNull()
    expect(await packs.transcriber()).toBeNull()
  })

  it('tells a list not published yet (404) from a server error and from no connection', () => {
    expect(catalogErrorCode(new CatalogHttpError(404))).toBe('catalog_unpublished')
    expect(catalogErrorCode(new CatalogHttpError(500))).toBe('catalog_failed')
    expect(catalogErrorCode(new CatalogHttpError(403))).toBe('catalog_failed')
    expect(catalogErrorCode(new TypeError('fetch failed'))).toBe('offline')
    expect(catalogErrorCode(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe('offline')
    expect(catalogErrorCode(new ManifestError('not a packs manifest'))).toBe('manifest_invalid')
    expect(catalogErrorCode(new SyntaxError('Unexpected token'))).toBe('manifest_invalid')
  })

  it('reports an unpublished list once, without failing the pack the user asked for', async () => {
    const packs = manager('http://127.0.0.1:1/packs-manifest.json', {
      fetch: async () => new Response('Not Found', { status: 404 }),
    })
    const listed = await packs.refresh()
    expect(listed.catalog).toBe('error')
    expect(listed.catalogError).toBe('catalog_unpublished')

    await packs.install('transcribe-accurate')
    const status = await packs.status()
    expect(status.catalogError).toBe('catalog_unpublished')
    for (const pack of status.packs) {
      expect(pack.state).toBe('not_installed')
      expect(pack.error).toBeNull()
      expect(pack.sizeExact).toBe(false)
    }
  })

  it('reports a server error on the list as catalog_failed', async () => {
    const packs = manager('http://127.0.0.1:1/packs-manifest.json', {
      fetch: async () => new Response('', { status: 502 }),
    })
    expect((await packs.refresh()).catalogError).toBe('catalog_failed')
  })

  it('reports an offline list and lets the user try again', async () => {
    const packs = manager('http://127.0.0.1:1/packs-manifest.json')
    const status = await packs.refresh()
    expect(status.catalog).toBe('error')
    expect(status.catalogError).toBe('offline')
  })

  it('downloads, verifies and installs a pack, then removes it', async () => {
    server = await startFakePackServer({ packs: [fakeTranscriptionPack()] })
    const packs = manager(server.manifestUrl)
    const events: PacksStatus[] = []
    packs.onChange((status) => events.push(status))

    const listed = await packs.refresh()
    expect(listed.catalog).toBe('ready')
    expect(light(listed).sizeExact).toBe(true)
    expect(light(listed).availableVersion).toBe('1.0.0')

    await packs.install('transcribe-light')
    const installed = light(await packs.status())
    expect(installed.state).toBe('installed')
    expect(installed.installedVersion).toBe('1.0.0')
    expect(events.some((s) => light(s).state === 'downloading')).toBe(true)

    const transcriber = await packs.transcriber()
    expect(transcriber?.id).toBe('transcribe-light')
    expect(transcriber?.model.name).toBe('whisper-base')
    expect((await stat(transcriber!.entry)).isFile()).toBe(true)
    const registry = JSON.parse(await readFile(join(dir, 'packs.json'), 'utf8'))
    expect(registry.packs['transcribe-light'].files).toHaveLength(2)
    expect(registry.packs['transcribe-light'].files[0].sha256).toMatch(/^[0-9a-f]{64}$/)

    const release = packs.retain('transcribe-light')
    await expect(packs.remove('transcribe-light')).rejects.toMatchObject({ code: 'pack_busy' })
    release()
    await packs.remove('transcribe-light')
    expect(light(await packs.status()).state).toBe('not_installed')
    expect(await packs.transcriber()).toBeNull()
    await expect(stat(join(dir, 'packs', 'transcribe-light'))).rejects.toThrow()
  })

  it('pauses and resumes with an HTTP range', async () => {
    const pack = fakeTranscriptionPack('transcribe-light', '1.0.0', 2 * 1024 * 1024)
    server = await startFakePackServer({ packs: [pack], chunkBytes: 16 * 1024, chunkDelayMs: 2 })
    const packs = manager(server.manifestUrl)
    await packs.refresh()
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
    expect(server.ranges.some((r) => r.includes('fake-model.bin bytes='))).toBe(true)
    expect(await packs.transcriber()).not.toBeNull()
  })

  it('finds a download a closed app left half done', async () => {
    const pack = fakeTranscriptionPack('transcribe-light', '1.0.0', 2 * 1024 * 1024)
    server = await startFakePackServer({ packs: [pack], chunkBytes: 16 * 1024, chunkDelayMs: 2 })
    const first = manager(server.manifestUrl)
    await first.refresh()
    first.onChange((status) => {
      if ((light(status).progress?.receivedBytes ?? 0) > 128 * 1024) first.pause('transcribe-light')
    })
    await first.install('transcribe-light')
    // A new app session: the list shows it as paused, and Install resumes it.
    const second = manager(server.manifestUrl)
    expect(light(await second.refresh()).state).toBe('paused')
    await second.install('transcribe-light')
    expect(light(await second.status()).state).toBe('installed')
  })

  it('cancels and deletes what arrived', async () => {
    const pack = fakeTranscriptionPack('transcribe-light', '1.0.0', 2 * 1024 * 1024)
    server = await startFakePackServer({ packs: [pack], chunkBytes: 16 * 1024, chunkDelayMs: 2 })
    const packs = manager(server.manifestUrl)
    await packs.refresh()
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

  it('refuses a corrupted file and restarts it on the next try', async () => {
    server = await startFakePackServer({
      packs: [fakeTranscriptionPack()],
      corrupt: 'fake-model.bin',
    })
    const packs = manager(server.manifestUrl)
    await packs.install('transcribe-light')
    const failed = light(await packs.status())
    expect(failed.state).toBe('failed')
    expect(failed.error).toBe('checksum_mismatch')
    expect(await packs.transcriber()).toBeNull()
  })

  it('warns about disk space before downloading', async () => {
    server = await startFakePackServer({ packs: [fakeTranscriptionPack()] })
    const packs = manager(server.manifestUrl, { freeBytes: async () => 1000 })
    await packs.install('transcribe-light')
    const status = light(await packs.status())
    expect(status.error).toBe('disk_space')
    expect(status.requiredBytes).toBeGreaterThan(1000)
    expect(server.requests.filter((r) => r.startsWith('/files/'))).toEqual([])
  })

  it('works with a server that ignores ranges', async () => {
    const pack = fakeTranscriptionPack('transcribe-light', '1.0.0', 1024 * 1024)
    server = await startFakePackServer({
      packs: [pack],
      noRanges: true,
      chunkBytes: 16 * 1024,
      chunkDelayMs: 2,
    })
    const packs = manager(server.manifestUrl)
    await packs.refresh()
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

  it('offers an update and replaces the old version only once the new one is in', async () => {
    server = await startFakePackServer({
      packs: [fakeTranscriptionPack('transcribe-light', '1.0.0')],
    })
    const packs = manager(server.manifestUrl)
    await packs.install('transcribe-light')
    await server.close()

    server = await startFakePackServer({
      packs: [fakeTranscriptionPack('transcribe-light', '1.1.0')],
    })
    const next = manager(server.manifestUrl)
    const offered = light(await next.refresh())
    expect(offered.installedVersion).toBe('1.0.0')
    expect(offered.updateAvailable).toBe(true)
    // Not installed until asked.
    expect((await next.transcriber())?.version).toBe('1.0.0')
    await next.install('transcribe-light')
    const updated = light(await next.status())
    expect(updated.installedVersion).toBe('1.1.0')
    expect(updated.updateAvailable).toBe(false)
    expect(await readdir(join(dir, 'packs', 'transcribe-light'))).toEqual(['1.1.0'])
  })
})
