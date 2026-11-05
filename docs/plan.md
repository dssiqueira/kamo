# plan.md — Execution plan

> How to get from the docs to a published app, step by step. The numbering is the same as in `AGENTS.md`. One step per session; a step only closes when the acceptance criteria of its features in `features.md` are checked and CI is green.
> Written on 2026-11-03 (step status updated 2026-11-04), from `AGENTS.md`, `DESIGN.md` and everything in `docs/`. Update the "Status" in `AGENTS.md` at the end of each step.

## How each step is executed
1. Read the step's section here + the features it cites + the decisions it cites
2. If the step has a **spike**, do the spike first and record the result (in `decisions.md` if it changes architecture)
3. Implement with tests; texts only via `packages/i18n` in the 5 languages (rule 14)
4. Check the acceptance criteria in `features.md` and update the Status in `AGENTS.md`
5. One commit per step (or per sub-step, when indicated), PR with green CI

---

## Before starting: prerequisites

### Development machine (Windows, today)
| Item | Status on 2026-11-03 | What for |
|---|---|---|
| Node 24 | ✅ installed | everything |
| pnpm | ✅ installed (2026-11-04: `packageManager` pins pnpm 12) | monorepo |
| Rust (rustup) + Visual Studio Build Tools (C++) | ✅ installed (2026-11-04; the Windows helper builds and records locally). Python 3 is no longer needed: the mouse hook lives in the helper (D-023), not in a `node-gyp` module | Windows capture helper (steps 2–3) |
| Access to an Apple silicon Mac (macOS ≥ 13.3) | ❌ still none (2026-11-04) | capture on Mac (steps 2, 3, 10). Without a Mac, validation is only possible through the `macos-14` CI, and the manual checklist is impossible |

### Accounts and names (do in phase 0, before they are needed)
- **`@kamo` org on npm:** the packages don't exist in the registry yet (404), but it wasn't possible to confirm whether the org is free. Create it now; if it's taken, decide on the alternative scope before step 1 (affects every `package.json` and `kamo-site`)
- **npm token** (`NPM_TOKEN`) in GitHub Actions, for the `0.0.x-next` prereleases
- **Apple Developer:** Developer ID Application certificate created by the Account Holder (step 10)
- **Chrome Web Store:** developer account (US$ 5) and API credentials (step 15)

---

## Inconsistencies found in the docs (resolve before the indicated step)
| # | Where | The problem | Proposal | By step |
|---|---|---|---|---|
| I-1 | `features.md` M-01 and `context.md` vs `integrations.md` and `data-model.md` | Default folder: `~/Kamo` or `~/Kamo/projects`? | Projects in `~/Kamo/projects/<id>`; the MCP accepts both (if given `~/Kamo`, it looks for `projects/` inside) | 2 |
| I-2 | `data-model.md` (`screen.mp4`) vs `integrations.md` (Windows via `desktopCapturer`) | Raw format on desktop | ✅ Resolved by D-023: the native helpers write `screen.mp4` (H.264) on both OSes; the extension records WebM or MP4 with `MediaRecorder` | 2 |
| I-3 | `AGENTS.md` phase 0 | Asks for a prerelease of `@kamo/core` "since step 1", but `core` only has real content after the project format lands | Split step 1 into 1a (scaffold + published tokens) and 1b (project format, interfaces + Electron) | 1 |
| I-4 | `data-model.md` Project.name | Default "Recording dd/mm hh:mm" is hardcoded in Portuguese and in BR format | i18n key `project.defaultName` with the date via `Intl.DateTimeFormat` | 2 |
| I-5 | `features.md` F-15 | Cites C-09, which lives in `kamo-cloud` | Replace with "see C-01 and `account.get` in the contract" | 17 |
| I-6 | F-08 / `DESIGN.md` | The 8 wallpapers and the mascot don't exist as files | Procedural wallpapers drawn by `core` (pastel, no image: weighs zero and is identical in preview and export). Mascot: SVG to be drawn before step 4 (countdown and empty screens) | 4 |
| I-7 | `DESIGN.md` Typography | Inter, Instrument Serif and JetBrains Mono must be bundled (the app has no network access) | Bundle only the Latin subsets (WOFF2, OFL license) and list them in `THIRD_PARTY_NOTICES` | 1 |
| I-8 | Step 0 of `AGENTS.md` | Numbered before 1, but only applies "from step 2" | Treat it as part of the step 2 deliverable (and of step 12 in the extension) | 2 |

## Technical risks and spikes
| Risk | Step | Spike |
|---|---|---|
| Hiding the system cursor on Windows (`desktopCapturer`/WGC). Without it, D-005 falls | 2 | Test `getDisplayMedia`/`desktopCapturer` with `cursor: "never"` in current Electron; plan B: native helper with Windows Graphics Capture (`IsCursorCaptureEnabled = false`) |
| Common clock across video, mouse and audio (≤ 33ms and ≤ 40ms) | 2–3 | Use a single monotonic clock in the main process and record the first frame's offset in `project.json` |
| Mac: does the mouse-only tap still require Input Monitoring? | 3 | Test on macOS 14/15 with our Swift helper |
| WebCodecs H.264 + AAC encoder available on all target machines | 9 | `VideoEncoder.isConfigSupported` / `AudioEncoder.isConfigSupported` with software fallback; FFmpeg only as an optional pack (D-019) |
| Installer ≤ 130MB | 10 | Measure the `.dmg` and the `.exe` as early as step 1b, with CI failing above the limit |
| Whisper in the browser | after 23 | Out of scope for now; only evaluate after desktop |

---

## Phase 0 — validate (part of `kamo`)
- [ ] Publish `@kamo/design-tokens@0.0.x-next` (comes out of step 1a) — workflow ready; blocked on the `@kamo` npm org and the `NPM_TOKEN` secret
- [ ] Publish `@kamo/core@0.0.x-next` (comes out of step 1b) — same blocker
- The other phase 0 deliverables (landing, waitlist, W-01) belong to the `kamo-site` and `kamo-cloud` repositories

---

## Desktop v0.1

### Step 1a — Monorepo, tokens, i18n and CI ✅ (2026-11-03)
> Done. Only what depends on an account is pending: the `@kamo` org and the `NPM_TOKEN` secret (without it the prerelease workflow skips publishing). TypeScript pinned to 6.0 because `typescript-eslint` doesn't support 7 yet. Tailwind v4: instead of a JS preset, the package generates `tailwind.css` with `@theme inline`. Resolved here: I-3, I-4 (`project.defaultName` key + `formatProjectDate`) and I-7 (fonts via `@fontsource`, Latin subset).

**Deliverables**
- Root `package.json` with pnpm workspaces, `packageManager`, `strict` TypeScript with project references, ESLint + Prettier, Vitest
- `packages/design-tokens`: script that reads the `DESIGN.md` front matter and generates `tokens.css` (CSS variables, light and dark), `tokens.ts` and a Tailwind preset; `pnpm --filter design-tokens build`
- `packages/i18n`: i18next + ICU, English keys, `en`, `pt-BR`, `es`, `zh-CN`, `ja` files; `Intl` helpers (date, duration, number, file size, `hh:mm:ss:ff` timecode); `check-keys` script that fails if a key is missing in any language
- `packages/core`, `packages/ui`, `packages/cloud-client`, `apps/desktop`, `apps/extension`, `apps/mcp`: empty packages that compile
- Lint rule that forbids `electron`, `node:*`, `fs`, `path` and `chrome` in `core` and `ui` (rule 1)
- WOFF2 fonts (Latin subset) + initial `THIRD_PARTY_NOTICES` + MIT `LICENSE`
- GitHub Actions: lint + typecheck + test + `check-keys` on every PR; `0.0.x-next` prerelease of `design-tokens` on every merge to `main`

**Done when:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` pass from scratch, and `kamo-site` can install `@kamo/design-tokens@next`.

### Step 1b — Project format, platform interfaces + Electron window ✅ (2026-11-03, Mac pending CI)
> Done locally on Windows: project format with migrations, events.jsonl reader/writer with six fixtures, platform interfaces + in-memory store, hardened Electron window (electron-vite, React 19, Tailwind v4, i18n), NSIS installer at 113.8MB (16MB of headroom under the 130MB budget, with no features yet: watch it from step 2 on) and a packaged smoke test. The Mac half of "done when" is the `desktop-package` CI job on `macos-14`. Notes for later: `appId` is `app.kamo.desktop` (change before the first signed release if the domain differs); the desktop Vite config strips JSON import attributes in dev (`@kamo/i18n` locales), and the extension will need the same; default cursor size is 1.5× (not set in the docs).

**Deliverables** (all written from scratch, D-020)
- Project format in `core`: types for every entity in `data-model.md` (`Project`, `MouseEvent`, `Zoom`, `Style`, `CursorSettings`, `ExportJob`, `Transcript`, `CloudLink`), runtime validation, defaults and `version`-based migrations
- Platform interfaces in `core`: `CaptureSource`, `EventSource`, `ProjectStore`, `FileSink`, plus an in-memory `ProjectStore` for tests
- `events.jsonl` reader and writer (streaming, tolerant to a truncated last line after a crash)
- `packages/core/fixtures/`: sample `events.jsonl` (no clicks, spaced clicks, click burst, clicks at the edge, drag, mouse outside the display) to be used by steps 5–7
- `apps/desktop`: Electron + Vite + React, minimum window 1024×680 with the `DESIGN.md` theme and i18n, `contextIsolation` on, typed preload, no `nodeIntegration`
- electron-builder configured (dmg arm64, nsis x64) and size check in CI
- `@kamo/core` prerelease on npm

**Done when:** the window opens on Windows (local) and on Mac (`macos-14` CI builds and runs a smoke test), and the project format tests pass.

### Step 2 — List displays and record the screen (F-01, F-02, frames from step 0) ⏳ (2026-11-04, Windows done, Mac untested)
> Done: Home with live display thumbnails, countdown, floating bar (excluded from capture), stop shortcut, on-disk store with recovery marker and disk check, local log, the stdio helper protocol with a fake helper and end-to-end tests, and the Swift Mac helper (builds on `macos-14`, ships in the dmg). Since then: the Rust Windows helper (0a934bc: WGC with no cursor or border, hardware H.264 into a fragmented MP4, reference JPEGs; verified recording both monitors, pause, protected window excluded, a killed helper leaves a playable file), recovery of interrupted recordings from Home (b3470e2; the video and the mouse events, not yet the audio or the webcam), the Record button naming its screen, the bar opening on the monitor with Kamo's window and a recording tray icon (62f7ebb). Pending: a real recording test on a Mac, the first-frame latency check (≤ 3.5s from Record), and a 30-minute recording test.

**Spike (done, D-023):** Electron capture always includes the system cursor on Windows, so recording goes through a native helper per OS (Rust on Windows, Swift on Mac). Requires Rust (rustup) and Visual Studio Build Tools (C++ workload, for the MSVC linker) on the Windows dev machine.
- Home with displays and live thumbnails (≥ 1/s), primary pre-selected, choice remembered
- 3-2-1 countdown in a transparent window on the chosen display; Esc cancels
- Recording at 30fps at native resolution, no cursor; Mac via our ScreenCaptureKit helper (Swift), Windows via `desktopCapturer`/WGC
- Floating bar (excluded from capture), timecode, seamless pause/resume, global stop shortcut
- Chunked disk writes (30 min without blowing memory), recovery of interrupted recording, warning when disk < 1GB, discard < 1s
- Filesystem `ProjectStore` in `~/Kamo/projects/<id>/` (I-1)
- **Reference frames:** 480px JPEG every 5s in `frames/` (written by the helper; JPEG because neither OS ships a WebP encoder), taken from the stream during recording
- Rotating local logger in `app-data/logs/` (basis of F-17), no personal data

### Step 3 — Mouse + microphone + system sound (F-03, F-04) ⏳ (2026-11-04, Windows done, Mac partial)
> Done: mouse events inside each capture helper instead of a separate `@kamo/mouse-hook` module (D-023): `WH_MOUSE_LL` in the Rust helper (0a934bc) and a listen-only, mouse-only `CGEventTap` in the Swift helper (ba3ae78), ~60Hz, video pixels, pauses removed, "outside" moves; the CI keyboard guard (c7cf8da, `pnpm guard:keyboard`); microphone and computer sound through a hidden recorder page (bdf7d4c, D-024): `audio.m4a`/`system.m4a`, mic picker, level meters, per-track `offsetMs`, volume and mute in the editor and the export. Windows computer sound uses Chromium's loopback (`getDisplayMedia`) rather than a WASAPI module of our own. Pending: Mac computer sound (ScreenCaptureKit audio in the Swift helper), the Input Monitoring spike on a real Mac, and the sync measurements (≤ 33ms events, ≤ 40ms audio).

**Spike:** Input Monitoring on Mac.
- `@kamo/mouse-hook`: mouse-only native module; Windows `WH_MOUSE_LL` (N-API + prebuilds in CI), Mac via Swift helper with a mouse-only mask, listen-only
- `events.jsonl` with move (~60Hz), down, up, scroll, button; coordinates in video pixels (scale factor); pauses discounted; "outside the display"
- CI test that searches the code for system-wide keyboard capture (`WH_KEYBOARD`, keyboard event masks in `CGEventTap`, `uiohook`, `globalShortcut` other than the stop shortcut…) and fails if it finds any (D-003). Key handling inside Kamo's own focused windows (Esc on the countdown, Space in the editor) is UI, not capture, and is allowed
- Microphone (`audio.m4a`) with device selection and level meter; system sound (`system.m4a`) via ScreenCaptureKit / WASAPI loopback
- Sync ≤ 33ms (events) and ≤ 40ms (audio), measured with a test recording with an audible click

### Step 4 — Editor, style and projects (F-08, F-10 partial, F-12) ⏳ (2026-11-04, almost done)
> Done: Canvas 2D renderer in `core` (8 procedural wallpapers, padding, corners, cached shadow, camera crop, vector cursor and spring ripple; same code for export), editor page with live preview, side panel and autosave, Home project list (rename, trash, show in folder, damaged projects), `kamo-media://` with Range for the video, settings (remembered display, last style as default), and a sample project generator for development. Canvas 2D instead of WebGL for now: identical in preview and export and fast enough with the cached backdrop; WebGL only if profiling asks. Since then: Kamo the mascot in the empty project list, the countdown, onboarding and export (2c4154c, c63340a, 5d6d4d4), and the paper-cut look in the editor (07daa07). Pending: visual regression in CI, opening the raw video of a damaged project (Home already lists it with the button). Since then also: the auto-zoom toggle is saved in the project (`autoZoom`) and the preview plays the microphone and computer tracks in sync (F-10).

- `packages/ui`: shadcn/ui + Tailwind with the tokens preset; base components from `DESIGN.md` (button-primary, panel, chip, timecode, toasts, cloud-badge)
- Editor: preview in the center using the `core` renderer, side panel (background, padding, corners, shadow), play/pause, space and arrows
- 8 procedural wallpapers + solid color (I-6); the last style becomes the default
- Home: project list (thumbnail, name, duration, date), rename, delete to trash, show in folder, empty state with the mascot
- Autosave of `project.json` with migration by `version`; corrupted project → open only the raw video
- Visual regression: reference frames rendered by `core` compared in CI

### Step 5 — Zoom generation (F-05) ✅ (2026-11-04)
> Engine part done on 2026-11-04, ahead of steps 3–4 while the native helpers were blocked (the plan already allowed 5–7 in parallel). `generateZooms` and `visibleZooms` in `packages/core/src/zoom/`. The editor now generates zooms on first open and has the "Regenerate zooms" button, the auto-zoom toggle and the "no clicks" notice. The toggle is now saved in `project.autoZoom` (undoable, respected by the export).

- Grouping by time (~1.5s) and distance (~25%), `leadMs`, minimum 600ms, no overlap (the larger one absorbs), edge offset
- "Regenerate zooms" preserves `manual`; auto-zoom toggle hides without deleting
- Performance test: 10 min of events in < 1s; snapshots with the fixtures

### Step 6 — Virtual camera with spring (F-06) ✅ (2026-11-04)
> Engine part done on 2026-11-04, ahead of steps 3–4 while the native helpers were blocked (the plan already allowed 5–7 in parallel). `buildCameraTrack`/`cameraAt`/`viewportAt` in `packages/core/src/camera/`, 240Hz exact-spring samples. Applied in the renderer through the shared scene (preview and export), and the smoke export checks the exported frames against the renderer (~50 dB PSNR, 6c8d9fa).

- 170/26 spring (never easing curves); arrival at the target at the instant of the click (± 1 frame), resolving the start through `leadMs`
- Framing clamped to the edges; cursor never leaves the frame with `follow`; adjacent zooms without returning to 1.0×
- Deterministic per-frame tests (the same function feeds preview and export)

### Step 7 — Smoothed cursor (F-07) ✅ (2026-11-04)
> Engine part done on 2026-11-04, ahead of steps 3–4 while the native helpers were blocked (the plan already allowed 5–7 in parallel). `buildCursorTrack`/`cursorAt` and the vector `CURSOR_ARROW` in `packages/core/src/cursor/`, exact at every click. Drawn by the renderer with a spring-driven ripple (`render/ripple.ts`), with the cursor settings (size, hide, ripple) in the side panel.

- Vector arrow, spring, zero error on the click frame, ripple, size 1–3×, hide, auto-hide after 3s
- "Cursor" side panel

### Step 8 — Timeline and trim (F-09, F-16) ⏳ (2026-11-04, almost done)
> Done: pure edits and undo history in `core` (randomized tests), the timeline component and its integration in the editor (move/resize/scale/delete/create zooms, trim handles, scrub, mic/computer rows, undo/redo). Since then: `pnpm i18n:usage` checks that every key used in code exists (13c73bf, part of `pnpm check` and CI), and a Webcam lane hides the bubble in stretches (A-03). Since then also the "Trim the last 2s?" suggestion in the editor (`project.endTrimSuggestion`). Pending: a DOM test for drag interactions.

- Tracks: video (trim handles), audio (volume and mute per track), zooms (pink blocks)
- Move, stretch, scale 1–4× (step 0.25), delete, double click creates 2s/2.0×, no overlap, scrub on the ruler
- Undo/redo ≥ 50 steps; `project.trim`; suggestion "Trim the last 2s?"
- Closes phase 2: **a milestone that can't slip** ("stopped recording and it's already edited")

### Step 9 — WebCodecs export (F-11) ⏳ (2026-11-04, almost done)
> Done (6c8d9fa, D-025): `@kamo/core/export` decodes the raw video with mediabunny, renders every frame through the preview's scene and renderer, encodes H.264 (hardware first, software fallback with a warning) and AAC 48kHz mixed from the mic/system tracks with volume, mute, trim and offsets; the Formats sheet (live 16:9 and 1:1 previews, sequential exports with a progress bar each, cancel, retry); the desktop sink (`.partial` renamed on commit, " (2)" names, disk-full mapping, partial deleted on cancel/failure/close, `project.exports`, show in folder); and a smoke export that checks files, durations and pixels. mediabunny is an optional peer of `@kamo/core` (df5b754). On the dev machine 19s of 1080p export in ~3s (16:9). Pending: the `isConfigSupported` spike on other real machines and the CI benchmark.

**Spike:** `isConfigSupported` on real machines.
- Offline render through the same code as the preview; `VideoEncoder` H.264 + `AudioEncoder` AAC + MP4 muxer (mediabunny; justify in the dependency)
- 16:9 and 1:1 with virtual camera, track mixing with volume, respecting the trim
- `FileSink` on desktop; name `<project> <format> <resolution><fps>.mp4`, " (2)" on collision, Videos folder, cancel deletes the partial file, full disk
- Goal: 1 min in < 1 min on an average machine; benchmark in CI with a short video

### Step 10 — Onboarding, diagnostics, packaging and release (F-13, F-14, F-15, F-17) ⏳ (2026-11-04, app side done)
> Done (dc91eb0, 3b767b0, a178b3a): onboarding with one permission per screen and live detection, Settings (theme, language without restart, folders, editable stop shortcut, permissions, updates, help, about, close to tray, D-026), Copy diagnostics with "Open issue on GitHub", electron-updater (launch + daily, background download, never restarts while recording or exporting), single-instance lock. Pending: the release workflow on the `v*` tag with Mac signing and notarization (no `release.yml` yet; CI only builds unsigned installers and checks the 130MB budget), `docs/release-checklist.md`, the closed beta, the native review of the 5 languages, and every Mac check (needs a real Mac).

- Permissions onboarding (Mac: Screen Recording, Microphone and, if step 3 confirms, Input Monitoring; Windows: Microphone), with automatic detection
- Settings: theme, folders, shortcut, language without restart, permissions, packs (empty for now), help
- Copy diagnostics + open a GitHub issue with the text
- electron-updater via GitHub Releases, without restarting during recording/export
- Release workflow on the `v*` tag: `macos-14` (signing + notarization) and `windows-latest`; 130MB budget in CI
- Manual native capture checklist (`docs/release-checklist.md`) + closed beta with ~20 people
- Native review of the 5 languages before the tag

### Step 11 — [kamo-site] Landing
On the `kamo` side: ensure `@kamo/design-tokens` and `@kamo/core` are stable on npm and a `README` with the download and the SmartScreen notice.

---

## Extension v0.2
### Step 12 — Popup + tab recording (E-01) ⏳ (started 2026-11-04)
- Vite with multiple entry points: popup (≤ 150KB, no `core`), offscreen, service worker, editor, welcome
- `tabCapture` → offscreen → chunked `MediaRecorder` into OPFS; tab audio returned to the user; microphone with permission requested on a visible page
- Countdown overlaid and removed before the 1st frame; badge with the time; nothing injected during recording
- Reference frames in OPFS; recovery of interrupted recording
- i18n: + German, French and Korean (D-021) and `_locales/`

### Step 13 — Clicks in the tab (E-02)
- Mouse-only content script via `scripting` + `activeTab`; CSS px × DPR × zoom → video pixels
- Re-injection on navigation; `optional_host_permissions` for another domain; warning "clicks not captured after X:XX"
- Code test that forbids keyboard listeners and DOM reading in the content script

### Step 14 — Editor and projects in OPFS (E-03)
- OPFS `ProjectStore`; `core` reads `screen.webm` with Opus tracks
- `packages/ui` editor in an extension tab; "All projects"; space usage and 2GB warning
- Playwright E2E with the extension loaded in Chromium

### Step 15 — Export, welcome and store (E-04, E-05, E-06)
- WebCodecs export + `chrome.downloads`; software fallback with a warning; confirmation on close
- Test that compares frames rendered in the extension and on desktop (before encode)
- Welcome, permission justifications, privacy statement, store page in 8 languages
- CI: 5MB budget and 150KB for the popup; publishing via the Chrome Web Store API; then Edge Add-ons

---

## Kamo Cloud v0.3
### Step 16 — [kamo-cloud] Supabase, RLS and login
On the `kamo` side: freeze the `/v1` contract from `integrations.md` in a shared types file and a mock.

### Step 17 — `cloud-client` + login (C-01)
- `packages/cloud-client`: typed client of the `/v1` contract, the only place with `@supabase/supabase-js`, URL and public key; errors with a stable code translated by `i18n`
- Desktop: `kamo://auth` deep link, session in the keychain (`safeStorage`/Keychain/Credential Manager), renewal
- Extension: `launchWebAuthFlow` (Google) and 6-digit code; session in `chrome.storage.local`
- Client tests against the contract mock

### Step 18 — Send to cloud (C-02)
- Checkbox unchecked by default; multipart upload straight to the signed URLs, resumable (`pendingUpload`), pause/resume
- Thumbnail from the middle frame + `frames/` adjusted to the trim; "Replace or create new"; link copied + Open / Playlist / Visibility
- Plan limit → popover, never a modal

### Steps 19–21 — [kamo-cloud] Library, playlists, sharing
On the `kamo` side: nothing beyond keeping the contract and `@kamo/i18n` published.

### Step 22 — Automatic upload (C-12) + [kamo-cloud] subscription and LGPD
- Option in Settings, off by default; private videos; transcript with its own option; only on unmetered networks; stops at the plan limit and warns once; "Update in cloud"

---

## Transcription, local MCP and advanced v0.4
### Step 23 — Optional packs + transcription (A-07, A-05) ⏳ (2026-11-04, built ahead of order; real packs not published yet)
> Done: pack manager in main (`apps/desktop/src/main/packs`: manifest, resumable downloads with Electron `net`, SHA-256, atomic install, remove, update with confirmation), background transcription (`apps/desktop/src/main/transcription`: queue that survives a restart, hidden decoder window → 16kHz WAV, whisper.cpp child process at low priority, `transcript.json` via `packages/core/src/transcript`), Settings → Packs and Transcription, the Transcribe button and status on Home's cards with the download offer and the one-time question. Tested end to end against a local fake release (`scripts/fake-pack-server.ts`, a Node script standing in for whisper-cli), including the real Electron build decoding a recorded `audio.m4a`. Pending: run `.github/workflows/packs.yml` (creates the `packs` release), a manual check with the real whisper.cpp and models on Windows and Mac (speed target of A-05, Gatekeeper on the downloaded binary), the editor's Transcribe button (with step 24).
- Pack manager: `packs-manifest.json` in the releases, download with progress/pause, SHA-256, `app-data/packs/`, Install/Remove/update with confirmation
- Light and Accurate transcription packs (whisper.cpp + model) assembled in CI as release assets
- Background transcription (utility process), `transcript.json`, resume after closing, one-time question about automatic mode

### Step 24 — Captions (A-06) ⏳ (2026-11-04)
> Done: `packages/core/src/captions` (cues: wrapping in units with CJK line breaking, long segments split on their word timings, trim clipping, `toSrt`; the caption edits that correct the transcript), `render/captions.ts` (presets, placement in the screen frame for every format and the split layout, spring fade) drawn by the core renderer, `project.captions`, the captions lane with inline text editing, the side panel's Captions section (Transcribe, or the pack offer with its size; presets, position, size), one undo history for the project and the captions' text, and the export choice (none / burned in / `.srt` next to each MP4). Main writes caption edits to `transcript.json` (`edited: true`) and refuses to transcribe over an edited transcript unless the user agreed (`transcript_edited`). Checked in the Electron build with a hand-written Portuguese transcript: presets in 16:9 and the 9:16 split, inline edit with undo and redo saved to disk, the replace question, the pack offer, a 9:16 burned-in export and a 16:9 `.srt`. Pending: trying the timing drags by hand, a real whisper transcript, the extension (after its editor, step 14).
- Editable caption track (fixes the transcript), 3 presets, export with none / burned-in / `.srt` adjusted to the trim

### Step 25 — Local MCP (M-01) ⏳ (2026-11-04, built ahead of order; publishing pending)
> Done (082ded8): `apps/mcp` with the 6 tools, pagination, folder discovery (`--dir` → `settings.json` → `~/Kamo/projects`), corrupted projects skipped with a warning; a source scan plus a runtime trap prove no writes and no network; 500 recordings searched in under 1s, frames well under 500ms; tarball 17kB. Pending: publishing `@kamo/mcp` to npm (same blocker as phase 0) and a check with the MCP Inspector and Claude Code.
- `apps/mcp`: MCP SDK, stdio, 6 tools, pagination, folder discovery (`--dir` → `settings.json` → `~/Kamo/projects`)
- Tests: no writes, no network (block `net`/`fetch` in the test), 500 recordings in < 1s, `get_frame` < 500ms, package < 5MB
- `@kamo/mcp` publishing; test with MCP Inspector

### Step 26 — "Connect to an agent" panel ✅ (2026-11-04)
> Done: Settings → Connect to an agent (`packages/ui/src/settings/AgentSection.tsx`, commands built in `agent.ts`): the `claude mcp add` command and the `mcpServers` JSON with the projects folder as `--dir` (through `cmd /c` on Windows), Copy buttons, what the agent reads, a link to `apps/mcp/README.md`; unpackaged builds add a development command running `apps/mcp/dist/cli.js`. Checked in the Electron build. Pending: the npx command needs `@kamo/mcp` on npm (step 25); the cloud MCP option comes with step 32.
- Ready-made command with the current folder, Copy button, instructions for other clients

### Steps 27–30 — Advanced (A-01, A-02, A-03, A-04, A-08)
- 27 ⏳ (2026-11-04: export done — 1080p/4K and 30/60fps in the Formats sheet, AVC level per size and rate, encoder probe with fallback 4K60 → 4K30 → 1080p and a notice, 4K only for recordings above 1080p; checked with real 4K30 and 1080p60 exports. The 60fps recording option on Home is not built): 60fps recording on Home + 4K/60 export when the source allows
- 28 ✅ (2026-11-04: 9:16 done; GIF done — 10/15fps, ≤ 1280px, estimated size and a warning over 10 MB, captions burned in with their colors kept in every palette, `gifenc` in a worker; checked with real GIFs in 16:9, 1:1 and 9:16): 9:16 following camera and cursor; GIF ≤ 15fps and ≤ 1280px with estimated size
- 29 ✅ (2026-11-04, built ahead of order: 48517e3, e1c5319, cf42d40, 57f94d0, 0c38467, 7d0fa3c): webcam in a separate file, bubble (4 corners, 3 sizes), shrinks on zoom, hidden per segment; camera requested only here. Also square, 16:9 and 9:16 shapes and free drag. Not yet tried by the user in a full real flow on a Mac
- 30 ⏳ (2026-11-04: wallpaper with own image done on desktop, A-04; window and region done on Windows, Mac written and untested): wallpaper with own image copied into the project; record a window and a region (`source.kind`). Done: helper protocol `listWindows`/`windows`, `start.windowId` / `start.region`, `window_not_found` / `window_lost` (PROTOCOL.md); Rust helper (WGC for an HWND, fitted into the video when resized; region as a GPU crop of the monitor; mouse mapped to the window or region, clicks outside dropped); Swift helper (desktop-independent window filter, `sourceRect`); Home's Screen · Window · Select switch (with icons), window list with thumbnails (desktopCapturer) and search, a ScreenToGif-style selection frame (movable, resizable, click-through middle, W × H fields, size presets, Record on its toolbar; its line stays around the area while recording, left out of the video), choice remembered, Record button names it. Verified on Windows 11 with short real window and region recordings (move, resize, close, clicks inside and outside). Pending: a real Mac test; on Mac, a window covering the recorded one is not treated as outside. Also in this step, D-024's Mac computer sound in the Swift helper (ScreenCaptureKit audio → `system.m4a`), untested on a Mac

---

## Cloud MCP v0.5
### Step 31 — Transcript in the cloud (C-02 v0.5 part)
- Two checkboxes on upload, `transcripts.put/delete` in `cloud-client`, timestamps adjusted to the trim

### Steps 32–34 — [kamo-cloud]
On the `kamo` side: cloud MCP option in the "Connect to an agent" panel when the person subscribes.

---

## Order and parallelism
- Steps are sequential within each version. The only ones that can run in parallel without file conflicts: 5, 6 and 7 (each is a `core` module with its own tests), once step 4 is done
- v0.2 only starts after v0.1 is released; no extension step may require a change in `core` or `ui` that breaks desktop
