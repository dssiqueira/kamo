# AGENTS.md — Kamo

> Front door. Every agent reads this file first, then everything it points to.
> This is the **public** repository (MIT). The project has three repositories (D-022): `kamo` (this one: app, extension, engine, local MCP), `kamo-cloud` (private: cloud server and business) and `kamo-site` (private: marketing site and landing pages).

## What it is
A screen recorder that automatically zooms on every click, smooths the cursor and exports a video that looks edited. Two entry points with **the same engine**:
- **Desktop app** (Mac + Windows): records the whole screen and any app. It is the main product.
- **Chrome extension** (and Chromium browsers): records browser tabs, with nothing to install besides the extension.

**The app is free and open source, with every feature.** It works 100% locally, with no account. Revenue comes from **Kamo Cloud**, an optional subscription to sync, share by link and build playlists.

Recordings also become context for AI: an **MCP server** lets Claude Code (or another agent) talk to everything that was recorded: transcripts, clicks, frames. The local MCP is free and reads the recordings folder; the cloud MCP comes with the subscription and also creates links and playlists.

## Where everything is
| File | Read when |
|---|---|
| `docs/context.md` | always: problem, scope, languages, what it is not, constraints and schedule |
| `docs/features.md` | before building any feature: behavior, acceptance criteria and edge cases. A feature is only done when all its criteria are checked |
| `docs/personas.md` | to decide flow, default or priority |
| `docs/data-model.md` | to touch `project.json`, events, zooms, export, transcript or thumbnails |
| `docs/flows.md` | to build or change any screen of the app or the extension |
| `DESIGN.md` | to write any UI: tokens, components, do's and don'ts |
| `docs/metrics.md` | before thinking about tracking anything (spoiler: in the app, nothing) |
| `docs/integrations.md` | to touch OS APIs, Chrome APIs, the encoder, optional packs, the Kamo Cloud API contract, build or publishing |
| `docs/decisions.md` | before proposing an architecture change: it may already be decided |
| `docs/plan.md` | at the start of each step: deliverables, spikes, pending inconsistencies and prerequisites |

## Repository structure
Monorepo with pnpm workspaces:
```
kamo/
├── packages/
│   ├── core/        # the engine: project format, zoom generation, virtual camera,
│   │                #   smooth cursor, frame rendering, export (WebCodecs)
│   ├── ui/          # editor, timeline, panels and React components (DESIGN.md)
│   ├── i18n/        # interface texts per language (ICU); published as `@kamo/i18n`
│   ├── design-tokens/ # tokens generated from DESIGN.md (CSS + JS); published as `@kamo/design-tokens`
│   └── cloud-client/  # typed client for the Kamo Cloud API (login, upload, links); published as `@kamo/cloud-client`
├── apps/
│   ├── desktop/     # Electron: native screen and mouse capture, files, installers
│   ├── extension/   # Chrome MV3: tab capture, click content script, OPFS
│   └── mcp/         # local MCP (npm `@kamo/mcp`): reads the projects folder, read-only, stdio, no network
├── THIRD_PARTY_NOTICES   # license notices (bundled fonts, dependencies)
├── AGENTS.md
├── DESIGN.md
└── docs/
```

## Stack
TypeScript everywhere · React + Vite · Tailwind + shadcn/ui · Canvas/WebGL for rendering · WebCodecs + MP4 muxer for export · Electron + native modules (screen and mouse capture only) on desktop · Manifest V3 in the extension · whisper.cpp for local transcription · i18next + ICU MessageFormat for languages · MCP TypeScript SDK in the local MCP · `@supabase/supabase-js` only inside `cloud-client`. The cloud server and the site live in the private repositories.

## Non-negotiable rules
1. **`packages/core` and `packages/ui` don't know where they are running.** No Electron, Node or `chrome.*` inside them. Capture, events, storage and files come in through interfaces (`CaptureSource`, `EventSource`, `ProjectStore`, `FileSink`), and each app implements its own.
2. **Never capture the keyboard.** Mouse events only. In the extension, the content script also doesn't read the page content.
3. **Nothing leaves the machine unless the user sends it.** Only what the user sent with "Send to cloud" goes up, or the automatic upload they turned on themselves (C-12, off by default, private videos). No telemetry, no analytics in the app.
4. **The free app is complete.** No recording, editing or exporting feature sits behind an account or payment. Only what costs infrastructure (cloud) is paid.
5. **The app only talks to the cloud through `packages/cloud-client`.** No URL, key or server detail scattered across the code. The API contract is versioned and agreed with the `kamo-cloud` repository.
6. **Light installer.** The base app only records, edits and exports. No AI model, FFmpeg or heavy binary inside the installer or the extension: those come as **optional packs**, downloaded only when the user asks (see D-019; the transcription model from Hugging Face, while the few-MB `whisper-cli` ships in the app, D-042). Budget: desktop installer ≤ 130MB, extension ≤ 5MB. A PR that blows the budget doesn't get in.
7. **The local MCP is read-only and has no network access.** It reads the recordings folder and answers the agent the user connected. Nothing else.
8. **Non-destructive editing.** The raw video is never altered; editing lives in `project.json`.
9. **The user's manual zoom is never overwritten** by automatic regeneration.
10. **Spring animation, never linear** (stiffness 170, damping 26).
11. Preview and export use the same rendering code from `core`. If they differ, it's a bug.
12. New dependency only with a one-line justification.
13. Changed architecture? Record it in `docs/decisions.md` with date, discarded alternative and reason.
14. **No interface text written directly in code.** Every visible text comes from `packages/i18n`, with an English key and translation in the launch languages (D-021). Dates, numbers, durations and prices always formatted with `Intl`. CI fails if a key is missing in any language.
15. **Everything in this repo is in English** (code, comments, docs, commit messages). Business strategy for Kamo Cloud (pricing, plans, revenue, go-to-market) never goes here: it lives in the private `kamo-cloud` repo.

## Quality and release
- **`core` tests** (Vitest): zoom generation, camera and cursor tested with sample `events.jsonl` in `packages/core/fixtures/`; snapshots of the results
- **Visual regression:** frames rendered by `core` compared with reference images on every PR
- **E2E (Playwright):** the extension loaded in Chromium; the `cloud-client` tested against a mock of the API contract
- **Native capture:** manual checklist on Mac and Windows at every release (record, permissions, system sound, update)
- **CI (GitHub Actions):** lint + typecheck + tests on every PR; size budget check (installer, extension, `@kamo/mcp`)
- **Prereleases:** `@kamo/design-tokens` and `@kamo/core` go out as `0.0.x-next` on every merge to `main` since step 1, because `kamo-site` uses these packages since phase 0
- **Release:** `v*` tag triggers a build on `macos-15` (signing + notarization) and `windows-latest`, publishes to GitHub Releases, publishes the extension to the Chrome Web Store and publishes to npm `@kamo/mcp`, `@kamo/core`, `@kamo/design-tokens`, `@kamo/i18n` and `@kamo/cloud-client` (used by the private repositories)

## Commands
```bash
pnpm install
pnpm --filter desktop build:native   # native capture and mouse modules
pnpm --filter desktop dev            # desktop app in development
pnpm --filter extension dev          # extension (load dist/ in chrome://extensions)
pnpm --filter mcp dev                # local MCP (test with the MCP Inspector)
pnpm --filter design-tokens build    # regenerates the tokens from DESIGN.md
pnpm test                            # core tests (zooms, camera, cursor)
pnpm lint && pnpm typecheck
```

## Build order
One feature per session. Don't skip steps. Numbering is global, the same across the three repositories; steps marked with another repository are built there.

**Phase 0 — validate** (before the app code)
- **[kamo-site]** Simple Kamo home + waitlist with the Kamo Cloud test (site S0 steps)
- **[kamo-cloud]** Waitlist API (W-01)
- **[kamo]** Publish prereleases of `@kamo/design-tokens` (and later `@kamo/core`) to npm, so the site can use them right away

**Desktop v0.1**
0. (from step 2) Reference frames: **during recording**, save a thumbnail every 5s in `frames/`, straight from the stream (basis of the MCP and the library, with no need to decode afterwards)
1. Monorepo scaffold (`core`, `ui`, `i18n`, `design-tokens`, `desktop`, empty `extension`); Electron window opening on both OSes; project format, platform interfaces and sample fixtures in `core`, with tests (engine written from scratch, D-020)
2. List displays and record the screen (no mouse yet)
3. Capture mouse events (mouse-only native module) + microphone and system sound, synchronized with the video
4. Editor (in `ui`) with preview + style (background, padding, corners, shadow) + project list on Home
5. Zoom generation from clicks (in `core`, with tests)
6. Virtual camera with spring (in `core`)
7. Smoothed cursor (in `core`)
8. Timeline with editable zoom blocks + trimming the start and end (in `ui`)
9. WebCodecs export 1080p30 in 16:9 and 1:1 (in `core`)
10. Permissions onboarding + "Copy diagnostics" + packaging + GitHub release
11. **[kamo-site]** Landing page (uses `@kamo/design-tokens` and `@kamo/core` published on npm)

**Extension v0.2** (reuses `core` and `ui` entirely)
12. Popup + tab recording via offscreen document
13. Click content script + conversion to video coordinates
14. Editor as an extension page + projects saved in OPFS
15. Export with download + publishing to the Chrome Web Store

**Kamo Cloud v0.3**
16. **[kamo-cloud]** Supabase: tables, RLS and login (magic link + Google + email code)
17. **[kamo + kamo-cloud]** `packages/cloud-client` + login on desktop (deep link) and in the extension (`launchWebAuthFlow` and code)
18. **[kamo + kamo-cloud]** "Send to cloud": resumable multipart upload with signed URLs, including thumbnails adjusted to the trim
19. **[kamo-cloud]** Web library + player page with short link
20. **[kamo-cloud]** Playlists (create, order, playlist link)
21. **[kamo-cloud]** Sharing (public, private, by email) + view count + reporting and removal
22. **[kamo-cloud]** Subscription, plan limits, account, export and deletion (LGPD) · **[kamo]** optional automatic upload (C-12)

**Transcription, local MCP and advanced features v0.4** (free, in the app)
23. Optional pack manager + transcription pack (whisper.cpp + model), downloaded only when the user asks; background transcription saved in `transcript.json` (desktop)
24. Captions generated from the transcript
25. Local MCP (`apps/mcp`): list, search, read transcript, click timeline, reference frames
26. "Connect to an agent" panel in the app, with the command ready for Claude Code
27. 4K / 60fps export
28. 9:16 vertical crop + GIF
29. Webcam bubble
30. Wallpaper with own image + record a window or a region (A-08)

**Cloud MCP v0.5** (subscription)
31. **[kamo + kamo-cloud]** (C-02, v0.5 part, in the app) Transcript uploads along with the video (search/MCP and show-in-player checkboxes) + text search in the library (M-03). Thumbnails already upload since step 18
32. **[kamo-cloud]** Cloud MCP with OAuth (`apps/mcp-cloud`): read and search the whole library, from any device
33. **[kamo-cloud]** Action tools: create link, change visibility, create and assemble playlists, see views
34. **[kamo-cloud]** "Agent connections" in the account, with revocation

## Status
- **Current step:** first public release, **v0.1.0 for Windows** (the Mac app and the Chrome extension are "coming soon": the release workflow builds them only with the repository variables `RELEASE_MAC` / `RELEASE_EXTENSION` set to `true`). Release notes in `docs/releases/v0.1.0.md`, changelog in `CHANGELOG.md`, README in five languages. Before tagging: the user's manual pass on Windows (`docs/release-checklist.md`). Cloud (16–22, 31–34) waits for `kamo-cloud`
- **Last thing that worked:** 2026-11-05: 60fps recording from Home (A-01, step 27 done; real 60fps recording and 1080p60 export on Windows); "Copy diagnostics" in the extension (F-17, on All projects); E-01…E-06 criteria checked against the code in `docs/features.md`. 2026-11-04: `pnpm check` green (1127 tests) and the 19 visual references match; real short recordings of a window and a region on Windows; 4K30 and 1080p60 exports; GIF with burned-in captions; extension end-to-end smoke with a stand-in tab stream (real `tabCapture` untested in automation)
- **Blockers:** a real Mac (capture, permissions, computer sound, window/region; Swift only compiled in CI); Apple Developer ID (and optionally a Windows code-signing certificate) for signed releases; the `@kamo` npm org and `NPM_TOKEN`; a Chrome Web Store developer account and its API credentials; native review of the 5 locales

## First prompt
> Read AGENTS.md and everything it points to. Confirm for me what we are going to build, who will use it, what the product looks like and what the first feature is.
