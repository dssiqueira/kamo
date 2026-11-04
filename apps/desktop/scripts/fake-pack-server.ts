// A local fake of the packs on GitHub Releases (A-07), for checking the pack download and the
// transcription flow without downloading whisper.cpp or a model. Run from apps/desktop:
//
//   node scripts/fake-pack-server.ts
//
// then start an unpackaged build with KAMO_PACKS_MANIFEST_URL set to the printed URL. The
// "transcription pack" is a Node script that answers like whisper-cli with a canned transcript.
import { fakeTranscriptionPack, startFakePackServer } from '../src/main/packs/testing.ts'

const server = await startFakePackServer({
  packs: [
    fakeTranscriptionPack('transcribe-light', '1.0.0', 8 * 1024 * 1024),
    fakeTranscriptionPack('transcribe-accurate', '1.0.0', 24 * 1024 * 1024),
  ],
  // Slow enough to see the progress and try Pause.
  chunkBytes: 64 * 1024,
  chunkDelayMs: 10,
})
console.log(`KAMO_PACKS_MANIFEST_URL=${server.manifestUrl}`)
