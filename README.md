<p align="center">
  <b>English</b> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="Kamo, a paper-cut chameleon, standing among leaves">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>Hit record. Click. Stop. It's already edited.</b><br>
  A free, open-source screen recorder that zooms in on every click, smooths your cursor<br>
  and exports a video that looks like someone spent an hour editing it. You spent zero minutes.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Platform: Windows today, Mac and Chrome coming soon" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20Mac%20%26%20Chrome%20soon-2F6F68?style=flat-square">
  <img alt="No telemetry" src="https://img.shields.io/badge/telemetry-none-A8D5A2?style=flat-square">
</p>

<h3 align="center">Out now for Windows</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac: coming soon" src="https://img.shields.io/badge/Mac-coming%20soon-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Chrome extension: coming soon" src="https://img.shields.io/badge/Chrome-coming%20soon-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>When the Chrome extension ships, it also runs in Edge, Brave and Arc. Can't wait? <a href="#build-from-source">Build it from source</a>.</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="A recording of a demo app: each click turns into a smooth zoom on the spot that was clicked">
</p>

> [!NOTE]
> **Kamo is young.** The Windows build is out, and Windows is where Kamo is built and tested every day. The Mac app and the Chrome extension are coming soon. Installers are not code-signed yet. Builds land on [GitHub Releases](https://github.com/dssiqueira/kamo/releases); if you hit a rough edge, [open an issue](https://github.com/dssiqueira/kamo/issues).

> [!TIP]
> **First launch on Windows.** The installer isn't code-signed yet, so SmartScreen may say "Windows protected your PC". Click **More info**, then **Run anyway**.

---

## What makes it different

**You don't edit. You record.** Kamo watches where you click (only the mouse, never the keyboard), and when you stop, the video already has a camera that follows the action, a cursor that glides instead of jitters, and a frame that looks designed.

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="Side by side: on the left the raw recording with a tiny, jittery cursor; on the right the same take in Kamo, zooming into each click on a sage background">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>Clicks become zooms.</b> Nearby clicks share one shot, so the camera never bounces. Every move is a spring (stiffness 170, damping 26), never a linear slide.</td>
    <td width="50%" valign="top"><b>A cursor that glides.</b> Kamo leaves the system cursor out of the recording and redraws it from your mouse path with the same spring. Bigger, smoother, with a ripple on each click.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Background, padding, corners and shadow</b> are on by default. Pick a preset, a solid color or your own image.</td>
    <td width="50%" valign="top"><b>Everything is editable.</b> Drag, stretch or delete zooms on the timeline, trim the ends. Your manual zooms are never overwritten when zooms regenerate.</td>
  </tr>
</table>

### One recording, every format

16:9 for YouTube, 1:1 for the feed, 9:16 for Reels and Shorts, exported together from the same timeline. MP4 up to 4K60, GIF, and `.srt` captions. Preview and export share the same rendering code, so what you see is what you get. No watermark, no time limit.

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="The same recording exported side by side in 16:9, 1:1 and a vertical 9:16 with the camera below the screen">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="A round webcam bubble in the corner that shrinks while the camera zooms in">
      <br><b>Webcam bubble.</b> Round, square or wide, in any corner or wherever you drag it. It shrinks while the camera zooms and comes back after. In 9:16 it can become its own card (split).
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="Captions in five styles: Bold, Kamo, Typewriter, Neon and Marker">
      <br><b>Captions in 12 styles.</b> Transcribed on your computer (an optional pack you download only if you want it). Fix a word on the timeline and the transcript follows. Burn them in or export an <code>.srt</code>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="The recording framed on a custom paper-cut sunset wallpaper">
      <br><b>Your own background.</b> Drop in a PNG, JPG or WebP. Kamo copies it into the project and crops it to fit every format.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="The editor's caption style gallery next to a caption in the Kamo style on the preview">
      </picture>
      <br><b>Pick a look, not a font.</b> Clean, Bold, Kamo, Neon, Typewriter, Cinema and six more, at the bottom or the middle, in three sizes. One click and the preview updates.
    </td>
  </tr>
</table>

<sub>Every clip on this page is a made-up demo app, edited and exported by Kamo, then shrunk into a GIF for GitHub. The "webcam" is an illustrated chameleon drawn on a canvas. No real screens or faces were harmed.</sub>

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="Four steps: Record a screen, window or selection; Click, and Kamo logs the mouse but never the keyboard; Zoom, where each click becomes a spring zoom; Export to MP4, GIF and .srt in 16:9, 1:1 and 9:16">
</picture>

## A tour of the app

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="Kamo's Home: choose Screen, Window or Select, toggle microphone, computer sound and camera, and see recent projects">
      </picture>
      <br><b>Home.</b> Screen, Window or Select. Mic, computer sound and camera are one toggle each. Your projects and local playlists live right below.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="The editor: live preview with zooms, a webcam bubble, the style panel and a timeline with zoom, webcam and caption lanes">
      </picture>
      <br><b>Editor.</b> Live preview in the middle, style on the right, zooms, webcam and captions on the timeline. Edits are non-destructive: the raw video is never touched.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="The Select frame over a demo app, with width and height fields and a Record button">
      </picture>
      <br><b>Select.</b> A frame you move and resize over the screen, with exact pixel sizes. Clicks outside it never make a zoom.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="The welcome tour: Kamo the chameleon says Hit Record, next to a sketch of the recording options">
      </picture>
      <br><b>Welcome tour.</b> Kamo walks you through it in three slides, in your language. Then it gets out of the way.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="The Chrome extension popup: Record this tab, with microphone, tab sound and camera toggles">
  <br><sub>The Chrome extension (coming soon): one popup, one button.</sub>
</p>

## Desktop or extension?

Same engine, same editor, same export. The difference is what they can record. Windows is out now; the Mac app and the extension are coming soon.

| | Desktop app<br><sub>Windows · Mac (Apple silicon, soon)</sub> | Chrome extension (soon)<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| Record the whole screen | ✅ | — |
| Record one window or a selection | ✅ | — |
| Record a browser tab | ✅ (as a window) | ✅ |
| Microphone | ✅ | ✅ |
| Computer sound / tab sound | ✅ | ✅ (tab sound) |
| Webcam bubble and 9:16 split | ✅ | ✅ |
| Auto zoom, spring camera, smooth cursor, timeline | ✅ | ✅ |
| Background presets and solid colors | ✅ | ✅ |
| Your own background image | ✅ | not yet |
| Local transcription and captions | ✅ | — (desktop only) |
| Export MP4 and GIF in 16:9, 1:1, 9:16 | ✅ | ✅ |
| 4K and 60fps export | ✅ | — (tabs record up to 1080p30) |
| Where projects live | A folder on your disk | Inside the browser (OPFS) |
| Readable by the local MCP server | ✅ | — |

## Private by design

- **100% local.** Recording, editing and exporting work offline, with no account.
- **No telemetry. No analytics.** Not "anonymized". None.
- **Nothing leaves your machine unless you choose to send it.**
- **Mouse only, never the keyboard.** Kamo records clicks and movement. It does not capture keystrokes, and the extension never reads the page you record. CI checks this on every pull request.
- **Small download.** The app records, edits and exports. Heavy things like the transcription model are optional packs, downloaded only when you ask for them.
- **Non-destructive.** Your raw recording is never altered; every edit lives in `project.json`.

## Use your recordings with AI

Kamo ships a small **local MCP server** so Claude Code (or any MCP client) can talk to what you recorded: transcripts, the click timeline, zooms, and a reference screenshot every 5 seconds.

> "Find the recording where I explained billing settings and write step-by-step docs from it."

It is **read-only and has no network access**: it reads your projects folder and answers the agent you connected. Nothing else.

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

The desktop app shows the exact command, with your folder filled in, under **Settings → Connect to an agent**. Tools, examples and other clients: [apps/mcp/README.md](apps/mcp/README.md).

## Build from source

Requires Node 24+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

Recording on the desktop needs the native capture helper: Rust and the Visual Studio Build Tools on Windows, Xcode on Mac. See [`apps/desktop/native`](apps/desktop/native). No recording setup handy? [`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) writes a realistic sample project you can open in the editor (it is the "Acme Studio" demo in the clips above).

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="Architecture: the desktop app and the Chrome extension both use packages/ui, which uses packages/core. The local MCP server reads the projects folder written by the desktop app.">
</picture>

A pnpm monorepo, TypeScript everywhere.

- **`packages/core`** is the engine: project format, zoom generation, virtual camera, smooth cursor, frame rendering and WebCodecs export (MP4 and GIF). Preview and export run the same code.
- **`packages/ui`** is the editor, timeline and panels (React).
- Neither knows where it runs: no Electron, Node or `chrome.*` inside them. Capture, events, storage and files come in through interfaces, so the extension reuses both as-is.
- **`apps/desktop`** is Electron, with small native helpers for capture: Rust (Windows Graphics Capture) and Swift (ScreenCaptureKit).
- **`apps/extension`** is Manifest V3: tab capture in an offscreen document, a mouse-only content script, projects in OPFS.
- **`apps/mcp`** is the local MCP server: stdio, read-only, no network.

New here, human or agent? Start at [AGENTS.md](AGENTS.md). It points to the product docs, decisions and plan in [docs/](docs/). UI follows [DESIGN.md](DESIGN.md).

## Languages

English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français and 한국어, picked from your system and switchable any time. Dates, numbers and durations are formatted for your language. Native speakers: reviews of the translations are one of the most useful contributions.

## Roadmap

The step-by-step plan lives in [docs/plan.md](docs/plan.md), and every feature with its acceptance criteria in [docs/features.md](docs/features.md). Next up: a tested Mac build, signed installers, the Chrome Web Store listing and `@kamo/mcp` on npm. An optional cloud for sharing links is planned; the app itself stays free and complete.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first; it covers the few rules the project holds firmly (platform-agnostic engine, mouse only, every string translated). By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE). Use it, fork it, ship it.

## Acknowledgements

Kamo stands on great open-source work: Electron, React, Vite, Tailwind CSS, mediabunny, gifenc, the MCP TypeScript SDK, whisper.cpp (built into the app; its models download from Hugging Face when you ask), and the Inter, Instrument Serif and JetBrains Mono typefaces. License notices for what ships inside the app are in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="Kamo smiling">
  <br><sub>Made with a chameleon's patience. Now go record something.</sub>
</p>
