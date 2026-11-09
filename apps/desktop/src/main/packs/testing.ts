// Test and local-check helpers for packs (A-07, D-042) and transcription (A-05): a tiny HTTP
// server that serves fake models the way Hugging Face does (a redirect to a "CDN", ranges),
// and a fake whisper-cli (a Node script that writes a canned transcript). Nothing here ships in
// the app's flow: tests import it, and `scripts/fake-pack-server.ts` runs it for manual checks.
// No real whisper or model is ever downloaded.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { PackId } from '../../shared/packs.ts'
import { KNOWN_PACKS, type KnownPack } from './config.ts'

/**
 * Behaves like `whisper-cli -m <model> -f <wav> -l <lang> -oj -ojf -of <out> -pp`: checks the
 * model and the WAV exist, prints progress on stderr, and writes `<out>.json` with one segment
 * every 2 seconds of audio. FAKE_WHISPER_FAIL=1 makes it exit 3; FAKE_WHISPER_SLOW_MS slows it; FAKE_WHISPER_KEEP_WAV=<file>
 * keeps a copy of the audio it got.
 */
export const FAKE_WHISPER_SCRIPT = `
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const model = arg('-m'), wav = arg('-f'), out = arg('-of'), lang = arg('-l') ?? 'auto'
if (!model || !wav || !out || !args.includes('-ojf')) { console.error('usage'); process.exit(2) }
statSync(model)
const header = readFileSync(wav).subarray(0, 44)
if (header.toString('ascii', 0, 4) !== 'RIFF' || header.readUInt32LE(24) !== 16000) {
  console.error('not 16kHz'); process.exit(4)
}
if (process.env.FAKE_WHISPER_FAIL === '1') { console.error('boom'); process.exit(3) }
if (process.env.FAKE_WHISPER_KEEP_WAV) copyFileSync(wav, process.env.FAKE_WHISPER_KEEP_WAV)
const durationMs = Math.round((header.readUInt32LE(40) / 2 / 16000) * 1000)
const slow = Number(process.env.FAKE_WHISPER_SLOW_MS ?? 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (const p of [0, 25, 50, 75, 100]) {
  process.stderr.write('whisper_print_progress_callback: progress = ' + p + '%\\n')
  if (slow) await sleep(slow / 5)
}
const transcription = []
for (let from = 0, n = 1; from < durationMs; from += 2000, n++) {
  const to = Math.min(durationMs, from + 1800)
  transcription.push({
    offsets: { from, to },
    text: ' Fake segment ' + n + '.',
    tokens: [
      { text: '[_BEG_]', offsets: { from, to: from } },
      { text: ' Fake', offsets: { from, to: from + 500 } },
      { text: ' segment', offsets: { from: from + 500, to: from + 1200 } },
      { text: ' ' + n + '.', offsets: { from: from + 1200, to } },
    ],
  })
  transcription.push({ offsets: { from: to, to: Math.min(durationMs, from + 2000) }, text: ' [BLANK_AUDIO]' })
}
writeFileSync(out + '.json', JSON.stringify({
  params: { model, language: lang },
  result: { language: lang === 'auto' ? 'en' : lang },
  transcription,
}))
`

/** Writes the fake whisper-cli into `dir` and returns its path (the program in tests and dev). */
export async function writeFakeWhisper(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'whisper-cli.mjs')
  await writeFile(path, FAKE_WHISPER_SCRIPT)
  return path
}

export interface FakeModel {
  id: PackId
  body: Uint8Array
}

/** A fake model of `bytes` bytes (a pattern, so a corrupted copy has another hash). */
export function fakeModel(id: PackId = 'transcribe-light', bytes = 256 * 1024): FakeModel {
  const body = new Uint8Array(bytes)
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + 7 + (id.length & 3)) & 0xff
  return { id, body }
}

export interface FakeModelServerOptions {
  models: FakeModel[]
  /** Bytes per write and pause between them, to make progress (and pausing) observable. */
  chunkBytes?: number
  chunkDelayMs?: number
  /** Ignore Range headers (a server without resume support). */
  noRanges?: boolean
  /** Serve wrong bytes (same size) for this pack: a damaged download. */
  corrupt?: PackId
  /**
   * Like Hugging Face: `/resolve/<file>` answers 302 to `/cdn/<file>`, which serves it.
   * Default true; false serves the file at `/resolve/<file>` directly.
   */
  redirect?: boolean
  /** Answer every file request with this HTTP status instead (a server error). */
  status?: number
  /** Send this many bytes of each response, then nothing more (the connection stays open). */
  stallAfterBytes?: number
  /** The version the packs report (default `rev1`). */
  version?: string
}

export interface FakeModelServer {
  url: string
  /** KNOWN_PACKS with each fake model's URL, size and SHA-256 (version `rev1`). */
  packs: KnownPack[]
  /** Range requests seen (`<path> bytes=<n>-`). */
  ranges: string[]
  requests: string[]
  close(): Promise<void>
  server: Server
}

export function sha256Hex(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex')
}

export async function startFakeModelServer(
  options: FakeModelServerOptions,
): Promise<FakeModelServer> {
  const files = new Map<string, FakeModel>()
  for (const model of options.models) {
    const known = KNOWN_PACKS.find((pack) => pack.id === model.id)!
    files.set(known.source.file, model)
  }
  const ranges: string[] = []
  const requests: string[] = []
  const redirect = options.redirect ?? true
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname
    requests.push(path)
    const match = /^\/(resolve|cdn)\/([^/]+)$/.exec(path)
    const model = match ? files.get(match[2]!) : undefined
    if (!match || !model) {
      response.writeHead(404).end()
      return
    }
    if (options.status) {
      response.writeHead(options.status).end()
      return
    }
    if (match[1] === 'resolve' && redirect) {
      // Hugging Face keeps the Range header across its redirect to the CDN; fetch does too.
      response.writeHead(302, { location: `/cdn/${match[2]}?signed=1` }).end()
      return
    }
    let data = model.body
    if (options.corrupt === model.id) data = new Uint8Array(model.body.byteLength).fill(1)
    let start = 0
    const range = request.headers.range
    if (range && !options.noRanges) {
      ranges.push(`${path} ${range}`)
      const parsed = /^bytes=(\d+)-$/.exec(range)
      start = parsed ? Number(parsed[1]) : 0
      if (start >= data.byteLength) {
        response.writeHead(416).end()
        return
      }
      response.writeHead(206, {
        'content-length': data.byteLength - start,
        'content-range': `bytes ${start}-${data.byteLength - 1}/${data.byteLength}`,
      })
    } else {
      response.writeHead(200, { 'content-length': data.byteLength })
    }
    const chunk = options.chunkBytes ?? 64 * 1024
    const delay = options.chunkDelayMs ?? 0
    let at = start
    let sent = 0
    const pump = () => {
      if (response.destroyed) return
      if (at >= data.byteLength) {
        response.end()
        return
      }
      if (options.stallAfterBytes !== undefined && sent >= options.stallAfterBytes) return
      const end = Math.min(data.byteLength, at + chunk)
      response.write(Buffer.from(data.subarray(at, end)))
      sent += end - at
      at = end
      if (delay) setTimeout(pump, delay)
      else setImmediate(pump)
    }
    pump()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const packs = KNOWN_PACKS.map((pack): KnownPack => {
    const model = options.models.find((m) => m.id === pack.id)
    if (!model) return pack
    return {
      ...pack,
      version: options.version ?? 'rev1',
      source: {
        ...pack.source,
        url: `${base}/resolve/${pack.source.file}`,
        size: model.body.byteLength,
        sha256: sha256Hex(model.body),
      },
    }
  })
  return {
    url: base,
    packs,
    ranges,
    requests,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
