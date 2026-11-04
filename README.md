# Kamo

**Hit record. Click. Stop. It's already edited.**

[![CI](https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg)](https://github.com/dssiqueira/kamo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Kamo is a free, open-source screen recorder that zooms in on every click, smooths your cursor with spring physics, and exports a video that looks like someone spent an hour editing it. You spent zero minutes.

It comes in two flavors that share one engine: a **desktop app** (Mac on Apple silicon, and Windows) that records your whole screen or any app, and a **Chrome extension** that records browser tabs without installing anything else. Everything runs on your machine. No account, no watermark, no telemetry.

The name comes from the chameleon: it tracks its target with one eye and hits the exact spot. The camera does the same with each click.

> **Status: early development.** We are on step 1 of the desktop v0.1 roadmap (monorepo, design tokens, i18n and CI are done; the project format and the Electron window are in progress). **There is nothing to download yet**, and no feature below works today. Watch the repo if you want to see it come together.

## What Kamo will do

**Recording** (desktop v0.1, extension v0.2)
- Record a full display with a 3-2-1 countdown, pause and resume, and recovery if something crashes mid-take
- Capture mouse position and clicks alongside the video, synced to the frame
- Microphone and computer sound
- Browser tabs through the Chrome extension (v0.2)

**Editing** (v0.1)
- Zoom blocks generated automatically from your clicks, with nearby clicks grouped into one shot so the camera doesn't bounce
- A virtual camera that moves with a spring, never a linear slide
- Smoothed cursor
- Wallpaper, padding, rounded corners and shadow applied by default
- A timeline where you drag, stretch and tweak zooms, and trim the start and end. Your manual zooms are never overwritten by regeneration

**Export**
- 1080p30 in 16:9 and 1:1 (v0.1)
- 4K, 60fps, vertical 9:16 and GIF (v0.4)
- Preview and export share the same rendering code, so what you see is what you get

**Privacy**
- Local by default: recordings live in a folder on your disk
- Nothing leaves your machine unless you send it yourself

**AI and MCP** (v0.4)
- Local transcription with an optional download pack, plus captions generated from it
- A local, read-only MCP server so Claude Code (or another agent) can talk to what you recorded: transcripts, click timelines, reference frames

```bash
npx @kamo/mcp   # planned, not published yet
```

## Principles

- **Free and complete.** No watermark, no time limit, no locked features. The app has everything.
- **Local first.** No account to record, edit or export.
- **Mouse only, never the keyboard.** Kamo records clicks and movement. It does not capture keystrokes, and the extension does not read page content.
- **No telemetry.** No analytics in the app.
- **Non-destructive editing.** The raw video is never touched; edits live in `project.json`.
- **Small installer.** The base app records, edits and exports. Heavy things (like the transcription model) are optional packs, downloaded only when you ask.
- **Springs, not slides.** Every camera move uses spring animation.

## Roadmap

| Version | What it brings |
|---|---|
| **v0.1 Desktop** | Record the screen, capture mouse and audio, editor, auto zoom, spring camera, smooth cursor, timeline, 1080p export, installers for Mac and Windows |
| **v0.2 Extension** | Chrome (and Chromium) extension recording tabs, same editor and engine, export with download |
| **v0.3 Kamo Cloud** | Optional subscription: upload, short links, playlists, sharing and a web library |
| **v0.4 Transcription and MCP** | Optional transcription pack, captions, local MCP server, 4K/60fps, 9:16 and GIF, webcam bubble, custom wallpaper, window and region capture |
| **v0.5 Cloud MCP** | For subscribers: search and manage the whole cloud library from an agent |

**Kamo Cloud** is the only paid piece. It is an optional subscription for sharing links and playlists, and it is what funds the project. The app itself stays free.

The detailed step-by-step plan is in [docs/plan.md](docs/plan.md).

## Repository structure

```
kamo/
├── packages/
│   ├── core/            # the engine: project format, zooms, virtual camera, cursor, rendering, export
│   ├── ui/              # editor, timeline, panels and React components
│   ├── i18n/            # interface text per language (@kamo/i18n)
│   ├── design-tokens/   # tokens generated from DESIGN.md (@kamo/design-tokens)
│   └── cloud-client/    # typed client for the Kamo Cloud API (@kamo/cloud-client)
├── apps/
│   ├── desktop/         # Electron: native screen and mouse capture, files, installers
│   ├── extension/       # Chrome MV3: tab capture, click content script
│   └── mcp/             # local MCP server (@kamo/mcp): read-only, stdio, no network
├── docs/
├── AGENTS.md
└── DESIGN.md
```

## Development

Requires Node 24+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm check                          # lint, typecheck, tests and i18n in one go
pnpm test
pnpm --filter design-tokens build   # regenerate tokens from DESIGN.md
pnpm i18n:check                     # every locale has every key
```

New here, human or agent? Start at [AGENTS.md](AGENTS.md), then follow it into [docs/](docs/). It covers the product, features and acceptance criteria, data model, flows, decisions already made, and the plan. UI work follows [DESIGN.md](DESIGN.md).

## Contributing

Issues and pull requests are welcome. Everything in the repo (code, docs, commits, issues) is in English. A few rules the project holds firmly:

- `packages/core` and `packages/ui` are platform-agnostic: no Electron, Node or `chrome.*` inside them. Platform things come in through interfaces.
- Every visible UI string comes from `packages/i18n`, with an English key and a translation in every launch language. CI fails if a key is missing.
- Mouse only. Never capture the keyboard.
- New dependencies need a one-line justification.
- Architecture changes get recorded in [docs/decisions.md](docs/decisions.md).

Please read [AGENTS.md](AGENTS.md) before opening a larger PR.

## Privacy

The app talks to nothing by default. There is no telemetry and no analytics. Kamo Cloud is opt-in: a recording only goes up when you choose to send it. The MCP server reads your recordings folder and nothing else, and it has no network access.

## Languages

The interface launches in English, Portuguese (pt-BR), Spanish (es), Simplified Chinese (zh-CN) and Japanese (ja). Dates, numbers and durations are formatted with `Intl`.

## License

[MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
