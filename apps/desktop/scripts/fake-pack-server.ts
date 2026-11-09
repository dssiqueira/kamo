// Fake transcription models for trying the Transcribe dialog and Settings → Optional packs
// locally (A-07, D-042), without downloading the real models from Hugging Face:
//
//   node scripts/fake-pack-server.ts [--real-sizes] [--fail=<status>] [--stall]
//
// It serves the models like Hugging Face does (a redirect, then ranges), writes a models file
// and a fake whisper-cli to a temp folder, and prints the two variables to start an unpackaged
// build with (KAMO_PACKS_DEV_MODELS, KAMO_WHISPER_CLI). With `--real-sizes` the models weigh
// what the real ones do (~148 MB and ~488 MB, held in memory) and arrive at about 4 MB/s;
// `--fail=503` answers every download with that status; `--stall` stops sending after 2 MB.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeModel, startFakeModelServer, writeFakeWhisper } from '../src/main/packs/testing.ts'

const realSizes = process.argv.includes('--real-sizes')
const fail = process.argv.find((arg) => arg.startsWith('--fail='))?.slice('--fail='.length)

const server = await startFakeModelServer({
  models: [
    fakeModel('transcribe-light', realSizes ? 147_951_465 : 8 * 1024 * 1024),
    fakeModel('transcribe-accurate', realSizes ? 487_601_967 : 24 * 1024 * 1024),
  ],
  // Slow enough to see the progress and try Pause.
  chunkBytes: 64 * 1024,
  chunkDelayMs: realSizes ? 15 : 10,
  ...(fail ? { status: Number(fail) } : {}),
  ...(process.argv.includes('--stall') ? { stallAfterBytes: 2 * 1024 * 1024 } : {}),
})
const dir = await mkdtemp(join(tmpdir(), 'kamo-fake-packs-'))
const models = Object.fromEntries(
  server.packs.map((pack) => [
    pack.id,
    {
      url: pack.source.url,
      size: pack.source.size,
      sha256: pack.source.sha256,
      version: pack.version,
    },
  ]),
)
const modelsFile = join(dir, 'models.json')
await writeFile(modelsFile, JSON.stringify(models, null, 2))
const whisper = await writeFakeWhisper(dir)
console.log(`KAMO_PACKS_DEV_MODELS=${modelsFile}`)
console.log(`KAMO_WHISPER_CLI=${whisper}`)
