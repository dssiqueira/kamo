// Test and local-check helpers for packs (A-07) and transcription (A-05): a tiny HTTP server
// that serves a fake packs-manifest.json and a fake transcription pack (a Node script that
// behaves like whisper-cli and writes a canned transcript). Nothing here ships in the app's
// flow: tests import it, and `scripts/fake-pack-server.ts` runs it for manual checks with
// KAMO_PACKS_MANIFEST_URL. No real whisper binary or model is ever downloaded.
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { platformKey } from './config.ts'

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

export interface FakeFile {
  path: string
  body: Uint8Array
  executable?: boolean
}

export interface FakePack {
  id: string
  version: string
  modelName: string
  modelPath: string
  entry: string
  files: FakeFile[]
}

/** A fake transcription pack: the script as its program and a small "model". */
export function fakeTranscriptionPack(
  id: 'transcribe-light' | 'transcribe-accurate' = 'transcribe-light',
  version = '1.0.0',
  modelBytes = 256 * 1024,
): FakePack {
  const model = new Uint8Array(modelBytes)
  for (let i = 0; i < model.length; i++) model[i] = (i * 31 + 7) & 0xff
  return {
    id,
    version,
    modelName: id === 'transcribe-light' ? 'whisper-base' : 'whisper-small',
    modelPath: 'models/fake-model.bin',
    entry: 'bin/whisper-cli.mjs',
    files: [
      {
        path: 'bin/whisper-cli.mjs',
        body: new TextEncoder().encode(FAKE_WHISPER_SCRIPT),
        executable: true,
      },
      { path: 'models/fake-model.bin', body: model },
    ],
  }
}

export interface FakePackServerOptions {
  packs: FakePack[]
  /** Bytes per write and pause between them, to make progress (and pausing) observable. */
  chunkBytes?: number
  chunkDelayMs?: number
  /** Ignore Range headers (a server without resume support). */
  noRanges?: boolean
  /** Serve this body instead of the real one for the given path (a corrupted download). */
  corrupt?: string
  platform?: string
}

export interface FakePackServer {
  url: string
  manifestUrl: string
  /** Range requests seen (`<path> bytes=<n>-`). */
  ranges: string[]
  requests: string[]
  close(): Promise<void>
  server: Server
}

export async function startFakePackServer(options: FakePackServerOptions): Promise<FakePackServer> {
  const files = new Map<string, Uint8Array>()
  const ranges: string[] = []
  const requests: string[] = []
  let base = ''
  const manifest = () => ({
    schema: 1,
    packs: options.packs.map((pack) => ({
      id: pack.id,
      version: pack.version,
      kind: 'transcription',
      model: { name: pack.modelName, path: pack.modelPath },
      platforms: {
        [options.platform ?? platformKey()]: {
          entry: pack.entry,
          files: pack.files.map((file) => {
            const name = `${pack.id}-${pack.version}-${file.path.replace(/\//g, '-')}`
            files.set(`/files/${name}`, file.body)
            return {
              path: file.path,
              url: `${base}/files/${name}`,
              size: file.body.byteLength,
              sha256: createHash('sha256').update(file.body).digest('hex'),
              ...(file.executable ? { executable: true } : {}),
            }
          }),
        },
      },
    })),
  })
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname
    requests.push(path)
    if (path === '/packs-manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(manifest()))
      return
    }
    const body = files.get(path)
    if (!body) {
      response.writeHead(404).end()
      return
    }
    let data = body
    if (options.corrupt && path.endsWith(options.corrupt)) {
      data = new Uint8Array(body.byteLength).fill(1)
    }
    let start = 0
    const range = request.headers.range
    if (range && !options.noRanges) {
      ranges.push(`${path} ${range}`)
      const match = /^bytes=(\d+)-$/.exec(range)
      start = match ? Number(match[1]) : 0
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
    const pump = () => {
      if (response.destroyed) return
      if (at >= data.byteLength) {
        response.end()
        return
      }
      const end = Math.min(data.byteLength, at + chunk)
      response.write(Buffer.from(data.subarray(at, end)))
      at = end
      if (delay) setTimeout(pump, delay)
      else setImmediate(pump)
    }
    pump()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    url: base,
    manifestUrl: `${base}/packs-manifest.json`,
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
