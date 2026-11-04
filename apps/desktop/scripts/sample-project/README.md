# Sample project (dev tool)

Writes a realistic Kamo project to disk, so the editor can be built and tested on a machine
without the native capture helper.

```bash
apps/desktop/node_modules/.bin/electron apps/desktop/scripts/sample-project [--out <projectsDir>] [--name "Sample"]
```

- `--out`: projects folder (default `~/Kamo/projects`, the app's `defaultProjectsDir()`)
- `--name`: project name (default `Sample <date>`)

It takes about as long as the recording (~19s), prints the codec, the project id and folder,
and exits 0 (1 on failure, after removing the half-written project).

## What it writes

A normal project folder (`docs/data-model.md`):

| File | How |
|---|---|
| `screen.mp4` | A hidden, sandboxed window draws a fake product screen on a 1920×1080 canvas in real time and records it with `canvas.captureStream(30)` + `MediaRecorder` (`video/mp4;codecs=avc1.640028`, 12 Mbps). Falls back to `screen.webm` with a warning if MP4 is not supported. No cursor is drawn: Kamo redraws it (D-005). |
| `events.jsonl` | `scenario.ts` composes a ~19s session (clicks on a nav item, a button, a text field, a toggle and a Create button, a card drag, four scroll steps) with the generator of `packages/core/fixtures/generate.ts`, written with `formatEvents`. |
| `frames/NNNN.jpg` | The scene redrawn at t = 0, 5s, 10s… scaled to 480px wide, JPEG 0.7. |
| `project.json` | `createProject` (`display`, 1920×1080, scale 1, 30fps, no zooms) with `durationMs` measured from `MediaRecorder` start to stop. Written last. |

The UI under each click reacts at the click time (pressed button, sidebar selection, a side
panel that opens, typed text in the focused field, a toggle that flips, a new card, a drag that
reorders two cards, content that scrolls), so generated zooms have something to look at.

## How it works

- `main.mjs` (Electron main) owns every file write, through the app's `FileProjectStore`
  (atomic `.partial` + rename and temp-file writes). After writing, it reads the project back
  with `loadProject`/`parseEvents` and checks the event and frame counts.
- `page.js` runs sandboxed without Node; `preload.cjs` exposes only the IPC calls it needs, and
  video chunks and JPEGs travel to main as `ArrayBuffer`s.
- Electron's Node only strips TypeScript types, and the workspace sources use TypeScript-only
  syntax, so `main.mjs` registers a module hook that loads `.ts` files with a full type
  transform. The `stripTypeScriptTypes` experimental warning it prints is expected.
