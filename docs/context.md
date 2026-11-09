# context.md

## Product
**Kamo** (from chameleon: the animal that tracks its target with one eye and hits the exact spot with its tongue, the way the camera does with each click) — a screen recorder that automatically zooms on every click, smooths the cursor and exports a video that looks edited, with no editing needed. Two entry points with the same engine: the **desktop app** (Mac + Windows, records any app) and the **Chrome extension** (records browser tabs, no app to install).

**The app is free and open source, with every feature.** Revenue comes from **Kamo Cloud**, an optional subscription: your recordings synced and accessible from any device, organized into playlists and shared by link with your team and clients.

## Problem
Recording a product demo is easy. Making the video presentable is not: manual zoom in an editor, shaky cursor, ugly background, exports in 3 formats for LinkedIn, X and Reels. That costs 30–60 min per 2-minute video, or the person gives up and posts it ugly anyway.

And once it's done, the video becomes a lost file in a folder: to send it to the team or the client, the person uploads it to Drive, Slack or YouTube, and never finds it again.

## Audience
- PMs, founders and devs who record feature/launch demos
- Tech/AI content creators who post short tutorials
- CS/support teams who record how-tos

## Value proposition
"Hit record. Click. Stop. It's already edited."
- Automatic zoom on every click, with a camera that anticipates the movement
- Smoothed cursor (spring physics, not linear interpolation)
- Background, padding, rounded corners and shadow applied by default
- One timeline, three formats (16:9, 1:1, 9:16) exported together
- Truly free: no watermark, no time limit, no locked features
- Local by default: no account, nothing leaves your machine unless you send it
- **Kamo Cloud:** one click and the video becomes a link, stays in your library on any device and goes into a playlist
- **Talk to what you recorded:** connect Claude Code (or another agent) to your recordings via MCP and ask "which video did I explain the checkout in?" or "summarize yesterday's demo"

## Scope — Desktop (v0.1)
- [ ] Display selection + 3s countdown + record/stop
- [ ] Mouse click capture (position + timestamp), never keyboard
- [ ] Automatic generation of zoom blocks from clicks
- [ ] Nearby clicks grouped into a single shot (the camera doesn't bounce)
- [ ] Smoothed cursor
- [ ] Editor with timeline: drag, stretch, change level and delete zooms
- [ ] Style: wallpaper (8 presets), padding, corners, shadow
- [ ] Microphone and computer sound, with per-track volume
- [ ] Trim the start and end of the recording
- [ ] MP4 export 1080p30 in 16:9 and 1:1
- [ ] "Copy diagnostics" for support without telemetry
- [ ] Mac (Apple silicon) + Windows (x64) builds

## Chrome extension (v0.2)
For those who record web products and don't want to install an app. Same engine, same editor, same export.
- [ ] Record the current tab from the popup, with countdown
- [ ] Capture clicks inside the tab (content script, mouse only)
- [ ] Automatic zooms, virtual camera and smooth cursor identical to the desktop
- [ ] Editor opening in an extension tab, with the same timeline
- [ ] MP4 export 1080p30 in 16:9 and 1:1, with direct download
- [ ] Works in Chrome, Edge, Brave and Arc (all Chromium)

**Accepted limitation:** the extension records only browser tabs. Recording other apps, or the full screen with automatic zoom, is a desktop thing.

## Kamo Cloud (v0.3) — subscription, the only paid thing
- [ ] Optional account (email or Google), requested only when the user wants to use the cloud
- [ ] "Send to cloud" at the end of the export (desktop and extension)
- [ ] Web library: all uploaded recordings, from any device, at `kamo.<domain>/library`
- [ ] Player page with a short link for each video
- [ ] Playlists: group videos in sequence, with a single link for the whole playlist
- [ ] Sharing: public by link, private, or restricted to invited emails
- [ ] View count per video (without tracking who watches)
- [ ] Monthly and annual subscription, with recurring billing

**Open:** pricing and plans (decided in the private `kamo-cloud` repository).

## Transcription, local MCP and advanced features (v0.4) — free, in the app
- **Local transcription** with Whisper (desktop first), as an **optional package**: it doesn't ship in the installer; the user downloads it only if they want to transcribe. Once installed, it runs in the background and nothing leaves the machine
- **Captions** generated from the transcript
- **Local MCP** (open source, `npx @kamo/mcp`): the user's agent reads and searches the recordings in the `~/Kamo` folder: transcripts, click timeline, metadata and reference thumbnails (one every 5s). Read-only, no network
- 4K / 60fps / GIF export
- Vertical 9:16 crop
- Webcam bubble (shrinks when the camera zooms)
- Wallpapers with your own image
- Record a window or a region of the screen

**Accepted limitation:** the local MCP sees only desktop recordings. Extension recordings are stored inside the browser; for those, the path is the cloud MCP.

## Cloud MCP (v0.5) — comes with the Kamo Cloud subscription
- Remote MCP server with login (OAuth): the agent accesses the whole library, from any device, including recordings made in the extension (for those, only metadata and thumbnails, until the extension has transcription)
- Text search across all uploaded transcripts
- Actions: create a share link, change visibility, create and assemble playlists, see views
- Example: "grab the 3 onboarding videos I recorded this week, build a playlist and give me the link"

## Languages
Kamo is global from launch. All text in the interface, landing page, stores and web library ships translated.

| Phase | Languages | Why |
|---|---|---|
| **Launch (v0.1)** | English, Portuguese (Brazil), Spanish, Simplified Chinese, Japanese | English is the global base; Portuguese is home; Spanish covers Latin America and Spain; Chinese and Japanese are large markets of creators and devs, and Japan pays well for software (and "kamo" is duck in Japanese, which makes for an even friendlier mascot there) |
| **Extension (v0.2)** | + German, French, Korean | strong SaaS and creator markets; they arrive together with the Chrome Web Store page |
| **Later** | + Hindi, Indonesian, Arabic | only with demand; Arabic requires right-to-left (RTL) layout, so the interface is built ready for it from the start |

**How to translate without it becoming a separate project:**
- Source texts in English, keys in `packages/i18n`
- First version translated by AI, with a fixed glossary (feature names, tone of voice, Kamo's jokes adapted, not translated literally)
- Review by a native speaker per language before each release (community, friends or freelancer)
- Language chosen automatically from the system/browser, with manual switching in Settings

**Known limits:**
- In mainland China, the Chrome Web Store, Google login and part of the cloud don't work well; the desktop app and the local MCP work. The Chinese languages also apply to Taiwan, Hong Kong, Singapore and the Chinese community outside China
- Support (issues, email) in English and Portuguese; other languages can write in, and the reply uses translation

## Stack
> This is the stack of the public `kamo` repository. The Kamo Cloud server lives in the private `kamo-cloud` repository, and the institutional site and landing pages in the private `kamo-site` repository (D-022).

- **Public monorepo:** pnpm workspaces with `packages/core`, `ui`, `i18n`, `design-tokens`, `cloud-client`, and `apps/desktop`, `extension`, `mcp` (see AGENTS.md)
- **Engine (`core`):** plain TypeScript: zooms, camera, cursor, Canvas/WebGL rendering, WebCodecs export + MP4 muxer
- **Editor (`ui`):** React + Vite + Tailwind + shadcn/ui
- **Desktop:** Electron; capture with ScreenCaptureKit (Mac) and Windows Graphics Capture (Win); mouse via our own native module, mouse only (no `uiohook-napi`, which listens to the keyboard)
- **Extension:** Chrome Manifest V3; tab recording via `tabCapture` in an offscreen document; clicks via content script; projects in OPFS
- **Kamo Cloud:** server in the private `kamo-cloud` repository (Supabase + Cloudflare R2 + Vercel); here only `packages/cloud-client`, which talks to it
- **Billing:** subscription provider (see D-014)
- **Transcription and captions:** local whisper.cpp (desktop first)
- **MCP:** official MCP TypeScript SDK; local via stdio (npm package), cloud via HTTP with OAuth
- **Site and landing pages:** private `kamo-site` repository (Astro + React islands, consuming `@kamo/design-tokens` and `@kamo/core`)
- **Distribution:** GitHub Releases + electron-builder + auto-update (desktop) · Chrome Web Store (extension)

## What it is NOT
- Not a video editor: no multi-track, complex cuts or color grading (that's DaVinci)
- Not a Loom with a mandatory account: the app works 100% without an account and without internet; the cloud is optional
- Has no analytics or telemetry inside the app
- Not a social network: no feed, likes or public profile
- Doesn't edit video in the cloud: editing is always in the app; the cloud stores the exported video and the transcript
- Has no AI of its own and sends nothing to AI on its own: the MCP only answers the agent the user themselves connected
- The desktop app doesn't run on Linux (for now; the extension does)
- Doesn't run on Intel Macs in v0.1 (Apple silicon only); universal build only if there is recurring demand
- Doesn't cut sections from the middle of the video: only the start and the end
- The extension doesn't exist for Firefox or Safari (for now)
- No real-time collaborative editing

## Constraints
- Nothing leaves the machine unless the user sends it: clicking "Send to cloud" or turning on automatic upload (off by default)
- Open and start recording in < 5s, without login
- Export of 1 min 1080p30 in < 1 min on an average machine
- The free app is complete, not a demo: no record, edit or export feature sits behind payment
- **Light for those who just want to record:** desktop installer ≤ 130MB and extension ≤ 5MB. Transcription models and any AI model are optional packages, downloaded on demand (the small transcription program ships in the app, D-042)

## Schedule
> Assumption: ~10h per week, building with Claude Code. Starts on Nov 9, 2026, with a pause for the year-end holidays. The steps are the ones in `AGENTS.md`.

| Phase | Weeks | Dates | Steps | Deliverable |
|---|---|---|---|---|
| 0. Validate | 1 | Nov 9–15 | — | Simple landing page with Kamo following the mouse + waitlist |
| 1. Capture | 2–3 | Nov 16–29 | 1–3 | Monorepo set up; desktop app opens on both OSes, records the screen and logs the clicks |
| 2. Magic editor | 4–6 | Nov 30–Dec 20 | 4–8 | Stop recording and the video already appears with background, zooms and smooth cursor; editable zooms on the timeline. All in `core` and `ui` |
| — Holidays | — | Dec 21–Jan 3 | — | Pause. If there's time left, record demos with the app itself |
| 3. Export and package | 7–8 | Jan 4–17 | 9–10 | MP4 export in 16:9 and 1:1; signed `.dmg` and `.exe`; closed beta with ~20 people from the waitlist |
| 4. Launch desktop v0.1 | 9 | Jan 18–24 | 11 | Final landing page; GitHub release |
| 5. Extension v0.2 | 10–12 | Jan 25–Feb 14 | 12–15 | Extension recording tabs with the same editor; submitted for Chrome Web Store review by Feb 8 |
| 6. Publish extension | 13 | Feb 15–21 | — | Publish as soon as the review approves (can take days to weeks) |
| 7. Kamo Cloud v0.3 | 14–21 | Feb 22–Apr 18 | 16–22 | Account, upload to cloud, library, player, playlists, sharing and subscription |
| 8. Launch Kamo Cloud | 22 | Apr 19–25 | — | Cloud beta with people who already use the app, then general availability |
| 9. Transcription, local MCP and advanced v0.4 | 23–28 | Apr 26–Jun 6 | 23–30 | Local transcription, captions, local MCP with the command ready for Claude Code; 4K/60fps, 9:16, GIF, webcam, own wallpaper, record a window or region. All free |
| 10. Cloud MCP v0.5 | 29–31 | Jun 7–27 | 31–34 | Transcription in the cloud, remote MCP with OAuth and link and playlist tools. Included in the subscription |

**Milestones that cannot slip:** the end of phase 2 (if the magic editor isn't beautiful, nothing else matters), the closed beta before launch and the rule that `core` and `ui` don't depend on Electron. If that rule breaks, the extension stops being "3 weeks of adaptation" and becomes a new project.


## Goals and criteria
Business goals live in the private `kamo-cloud` repository.
