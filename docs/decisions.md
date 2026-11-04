# decisions.md

> Each decision with date, rejected alternative and reason. Don't delete: mark as superseded. The AI doesn't reopen what is here without a new reason.

## D-001 — Electron + React instead of a native app
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** Electron + React + TS + Vite; native modules only for screen and mouse capture
- **Rejected:** Swift + C# (two native apps) and Tauri
- **Why:** a single codebase for both OSes, in TypeScript/React (the stack I know best and where AI gets things right most often). The same Chromium on both OSes guarantees that Canvas/WebGL preview and export look identical on Mac and Windows. Tauri uses WebKit on Mac and WebView2 on Windows (different rendering) and requires Rust for capture and encoding. Two native apps double the work.
- **Accepted cost:** bigger app (~100–130MB, within the D-019 budget) and more RAM
- **Revisit if:** download size becomes a recurring complaint

## D-002 — 100% local, no account
- **Date:** 2026-11-03 · **Status:** superseded by D-012
- **Decision:** no recording leaves the machine
- **Rejected:** cloud library with a sharing link (Loom model)
- **Why:** privacy is the differentiator, infrastructure stays close to zero and the app opens without login
- **Accepted cost:** no usage data to guide the product

## D-003 — Capture mouse only, never keyboard
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** the hook records only move/down/up/scroll
- **Rejected:** showing keyboard shortcuts on screen (KeyCastr style)
- **Why:** trust. A recorder that reads the keyboard is a potential keylogger, and the dev audience notices that right away.

## D-004 — Non-destructive editing
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** the raw video is never altered; all editing lives in `project.json` and is applied at render time
- **Rejected:** applying zoom directly to the file when the recording stops
- **Why:** you can regenerate zooms, undo and re-export as many times as you want

## D-005 — Cursor redrawn, not recorded
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** record the screen without the OS cursor and render our own cursor from the events
- **Rejected:** recording the system cursor and only applying zoom
- **Why:** without this you can't smooth, enlarge or hide the cursor

## D-006 — Previous monetization model
- Moved to the private repository `kamo-cloud` (`docs/decisions.md`). Superseded by D-013.

## D-007 — License provider
- Moved to the private repository `kamo-cloud` (`docs/decisions.md`). Cancelled.

## D-008 — Code license
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** the public repository `kamo` (desktop app, extension, `core`, `ui`, `i18n`, `design-tokens`, `cloud-client`, local MCP) is **MIT**. The Kamo Cloud server (`kamo-cloud`) and the site (`kamo-site`) stay in **private** repositories (D-022).
- **Rejected:** AGPL for the app (puts companies off) and an open-source cloud server
- **Why:** the whole app is free and open; the cloud server is a separately operated service
- **Consequence:** there is no official "host your own cloud"; anyone who wants 100% local uses the app and the local MCP, which work without any cloud

## D-009 — Distribution and signing
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** Mac distributed as a `.dmg` signed with Developer ID + notarized, from v0.1. Windows as an unsigned `.exe` in v0.1. Both via GitHub Releases.
- **Rejected:** Mac App Store (sandbox and store rules) and shipping the Mac build unsigned (macOS loses the screen recording permission on every update)
- **Why:** the Apple Developer account already exists; on Windows, the SmartScreen warning is just one extra click
- **Revisit if:** complaints about the Windows warning show up often in the issues
- **Architectures:** Mac Apple silicon (arm64) only and Windows x64 in v0.1. Intel Mac and Windows ARM only on recurring request

## D-010 — Chrome extension as a second entry point
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** besides the desktop app, a Chrome extension (MV3) that records tabs, using the same engine and the same editor. Monorepo with platform-independent `packages/core` and `packages/ui`, and `apps/desktop` and `apps/extension` as thin adapters.
- **Rejected:** desktop only (loses people who record web products and don't want to install an app) and replacing the desktop app with the extension (loses recording of native apps and the full screen)
- **Why:** the main personas record a lot of web product; the extension removes install friction and runs on Mac, Windows, Linux and ChromeOS. Since Electron is also Chromium, the engine serves both.
- **Order:** desktop first (v0.1), extension later (v0.2)
- **Accepted cost:** architectural discipline from day one (no Electron inside `core` and `ui`) and one more store to maintain

## D-011 — Export with WebCodecs in core, instead of FFmpeg
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** export runs in `packages/core` with WebCodecs (the system's hardware encoder) + a JS MP4 muxer. The same code on desktop and extension.
- **Rejected:** FFmpeg on desktop and WebCodecs only on the extension (two export pipelines to maintain and test) and ffmpeg.wasm in the extension (slow and heavy)
- **Why:** a single pipeline guarantees the same video on both entry points; Electron already has WebCodecs because it is Chromium
- **Plan B:** FFmpeg on desktop only, if WebCodecs fails on some machine, as an optional pack downloaded at the time of failure (D-019)
- **Supersedes:** the mention of FFmpeg as the main export in the original stack

## D-012 — Local by default, cloud optional
- **Date:** 2026-11-03 · **Status:** accepted · **Supersedes:** D-002
- **Decision:** the app keeps working 100% without an account and without internet. Kamo Cloud is optional: nothing is uploaded unless the user clicks "Send to cloud".
- **Rejected:** staying 100% local (no sharing) and a mandatory account Loom-style (kills the privacy promise and the zero friction to get started)
- **Why:** sharing and finding videos later is a real pain for the personas
- **Accepted cost:** there is now a backend, accounts, privacy law compliance (LGPD) and moderation to take care of
- **Addendum:** for those who want everything synced, there is automatic upload (C-12), off by default; videos uploaded this way start as private

## D-013 — Free app + Kamo Cloud as the only paid thing
- **Date:** 2026-11-03 · **Status:** accepted · **Supersedes:** D-006
- **Decision:** all record, edit and export functions are free, including 4K, 9:16, GIF, webcam, captions and custom wallpaper. Revenue comes only from the Kamo Cloud subscription (monthly and annual).
- **Rejected:** paid local features and a watermark on the free plan
- **Why:** the app is open source and complete; only what costs infrastructure is paid. The message stays simple: "the app is free, the cloud is optional".
- **Open:** price, plans and cloud limits are decided in the private repository `kamo-cloud` (`docs/negocio.md`)

## D-014 — Subscription billing provider
- Moved to the private repository `kamo-cloud` (`docs/decisions.md`).

## D-015 — The cloud stores the exported video, not the editable project
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** "Send to cloud" uploads the exported MP4 and a thumbnail. The project (raw video, events, `project.json`) stays only on the machine.
- **Rejected:** syncing the whole project to edit on any device
- **Why:** the raw video is several times larger than the export, storage cost would explode, and editing on another device isn't the main pain. What people want is to **view and share** from anywhere.
- **Consequence:** re-uploading the same project replaces the video and keeps the link
- **Update (2026-11-03):** the reference thumbnails (`frames/`, ~20KB each) and, if the user leaves it checked at upload, the transcript are also uploaded. They are light and power search and the cloud MCP (D-018)
- **Revisit if:** users frequently ask to keep editing on another machine

## D-016 — Videos on Cloudflare R2
- Moved to the private repository `kamo-cloud` (`docs/decisions.md`).

## D-017 — Local transcription as the basis for captions, search and MCP
- **Date:** 2026-11-03 · **Status:** accepted (updated by D-019: transcription is an optional pack)
- **Decision:** transcription is done locally with whisper.cpp and saved to `transcript.json`. Captions, search and MCP use the same transcript. With the pack installed, the user chooses whether to transcribe automatically or only on request.
- **Rejected:** cloud transcription via API (breaks "nothing leaves the machine" and has a per-minute cost) and built-in, mandatory transcription (would bloat the installer for everyone, see D-019)
- **Why:** local keeps privacy and zero cost
- **Accepted cost:** with optional transcription, many recordings will have no text, and the MCP will only have clicks, frames and metadata for them. Accepted in exchange for a light installer. Also: CPU usage after recording, for those who install it

## D-018 — Free local MCP + cloud MCP with the subscription
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** an open-source local MCP server (`@kamo/mcp`, stdio, read-only, no network) that reads `~/Kamo`, and a remote MCP server (HTTP + OAuth) included in Kamo Cloud, which accesses the whole library and performs actions (links, visibility, playlists).
- **Rejected:** cloud-only MCP (would betray open source and "local by default") and a local MCP with write access (risk of the agent deleting or altering recordings by accident)
- **Why:** the local one keeps the promise that the app is complete without the cloud; the cloud one accesses the library from any device and performs actions (links, playlists) that only exist in the cloud
- **Accepted limitation:** the local MCP does not see extension recordings (they live inside the browser); for those, the path is the cloud MCP
- **Revisit if:** users frequently ask for write tools in the local one (e.g. rename, generate export)

## D-019 — Light installer + optional packs
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** the installer and the extension ship only what is needed to record, edit and export. Transcription (whisper.cpp + model) and FFmpeg become optional packs, downloaded from GitHub Releases assets only when the user asks, and installed in `app-data/packs/`. Budget: desktop installer ≤ 130MB, extension ≤ 5MB, `@kamo/mcp` ≤ 5MB.
- **Rejected:** bundling Whisper and FFmpeg in the installer (would add 220MB to 570MB for everyone, including people who just want to record) and asking about transcription on the very first recording (pushes a heavy download on people who didn't ask)
- **Why:** many people will download it just to record. A small download converts better, and respects people with limited internet or disk.
- **Consequence:** the local MCP uses reference thumbnails saved every 5s instead of decoding video, so it doesn't depend on FFmpeg
- **Revisit if:** Electron alone goes over the budget (then consider better compression or a web installer)

## D-020 — Engine written from scratch
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** the whole engine is Kamo's own code: project format, zoom generation, virtual camera, smoothed cursor, frame composition, WebGL renderer, WebCodecs export and the native capture helpers. It is built from the rules in `data-model.md` and `features.md`, with tests from the first module.
- **Rejected:** forking or copying modules from existing open-source recorders (their architecture conflicts with D-003, D-010, D-011 and D-019, and the code would carry third-party notices to maintain)
- **Why:** an engine designed around `core`/`ui` being platform-agnostic from day one, with clear authorship and nothing to untangle later
- **Accepted cost:** more work in phases 1–3; the schedule absorbs it from its slack, and scope stays the project's biggest risk

## D-021 — Global from launch, in 5 languages
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** launch v0.1 in English, Portuguese (Brazil), Spanish, Simplified Chinese and Japanese; add German, French and Korean in v0.2 (along with the Chrome Web Store page); Hindi, Indonesian and Arabic only on demand. All text in `packages/i18n`, with English as the source, AI translation with a glossary and native review before each release.
- **Rejected:** launching only in Portuguese and English and translating later (retrofitting a language is expensive) and launching in 10+ languages at once (review and support become impossible for a one-person team)
- **Why:** the product is visual and simple to explain, so it translates well; serving people in their own language from the start is cheaper than adapting later
- **Accepted cost:** about 1 extra week spread across the schedule (native reviews, store pages, localized landing page), using system fonts for Chinese, Japanese and Korean (bundling CJK fonts would blow the extension budget)
- **Limit:** support in English and Portuguese; in mainland China, the extension and parts of the cloud are limited

## D-022 — Three repositories: `kamo`, `kamo-cloud` and `kamo-site`
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:**
  - **`kamo` (public, MIT):** `packages/core`, `ui`, `i18n`, `design-tokens`, `cloud-client`; `apps/desktop`, `extension`, `mcp`. The product's Vibe Doc and DESIGN.md
  - **`kamo-cloud` (private):** `apps/web` (library, player, account), `apps/mcp-cloud`, `supabase/`, billing, waitlist API. The cloud and business Vibe Doc
  - **`kamo-site` (private):** institutional site and commercial LPs. Consumes `@kamo/design-tokens` and `@kamo/core` from npm and sends the waitlist to the `kamo-cloud` API
- **Rejected:** one repo per app (separate desktop and extension would break the shared engine), site inside the public repository (commercial LPs and tests would be exposed) and site inside `kamo-cloud` (giving a designer access would expose the backend)
- **Why:** each repository has a different audience: the open-source community, only the owner, and a designer or agency
- **Accepted cost:** API contract between `kamo` and `kamo-cloud` versioned and agreed on; `@kamo/design-tokens` and `@kamo/core` packages published to npm for the site to use

## D-023 — Native capture helper per OS
- **Date:** 2026-11-03 · **Status:** accepted
- **Decision:** screen capture on desktop runs in a small native helper process per OS, started and controlled by the Electron main process over stdio: **Windows** in Rust with the official `windows` crate (Windows Graphics Capture with `IsCursorCaptureEnabled = false`, H.264 through Media Foundation) and **Mac** in Swift (ScreenCaptureKit with `showsCursor = false`). The helpers write `screen.mp4` (H.264) straight into the project folder. From step 3 on, the same helpers also emit the mouse events (mouse-only hooks, D-003), on the same clock as the video. Electron's `desktopCapturer` is still used for the live thumbnails on Home.
- **Rejected:** recording through Electron (`getDisplayMedia` + `MediaRecorder`). Spike on Electron 45 / Chromium 156, Windows 11: the `cursor: 'never'` constraint is ignored (`getSupportedConstraints().cursor` is false, the track reports `cursor: "always"`) and the system cursor shows up in every frame, which breaks D-005. Also rejected: hiding the system cursor while recording (the user needs to see it) and erasing it afterwards (the pixels under it are lost).
- **Why:** D-005 needs video without the system cursor. A helper also gives one clock for video and mouse events (≤ 33ms budget, F-03) and keeps native code out of the Electron process.
- **Language on Windows (2026-11-04):** Rust instead of C++. Performance and binary size are the same (the OS captures and the hardware encodes); Rust adds memory safety, where a crash means a lost take, plus cargo instead of CMake. The step 3 mouse hook on Windows goes in the same helper.
- **Accepted cost:** two native codebases (Rust and Swift) and their toolchains: Rust + Visual Studio Build Tools (MSVC linker) on Windows and Xcode on Mac (or the `macos-14` CI runner). Each helper must stay small (installer budget, rule 6).
- **Spike notes:** `MediaRecorder` in this Chromium records `video/mp4;codecs=avc1` natively, which the extension can use (E-01).
- **Reference frames are JPEG** (480px wide, `frames/0005.jpg`), not WebP: neither Windows (WIC) nor macOS (ImageIO) ships a WebP encoder, and at this size JPEG costs about the same. The extension writes the same format.
