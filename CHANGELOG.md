# Changelog

All notable changes to Kamo are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Each release also has full notes in [`docs/releases/`](docs/releases/), which become its GitHub release page.

## [Unreleased]

## [0.2.0] — 2026-11-10

Full notes: [docs/releases/v0.2.0.md](docs/releases/v0.2.0.md).

### Added
- German, French and Korean, in the app and the extension (Settings → Language and the first-run language screen) and as spoken languages for transcription.
- Export MP4 and GIF in the same run: check both formats and every checked aspect comes out in each, with its own settings.
- "Start recording" in the tray menu, the Windows taskbar jump list and the Mac Dock menu: it records what you chose last on Home, with the countdown.
- A soft tick on each number of the 3-2-1 countdown; Settings → Recording turns it off.
- A *Noise suppression* switch for the microphone, under *Audio settings* on Home (on by default).
- Chrome extension (coming soon): a small recording bar (time, pause, stop) in its own window, never part of the video; clicking the toolbar icon while recording stops it.
- Groundwork for a Microsoft Store package. Installed from the Store, Kamo leaves updates to the Store.

### Changed
- Transcription works out of the box: the whisper.cpp program now ships inside the app (a few MB), and the Light (~148 MB) or Accurate (~488 MB) model downloads straight from Hugging Face, the official home of the whisper.cpp models, only when you ask, pinned to one version and checked with SHA-256. Nothing depends on a Kamo download server anymore.
- The Transcribe dialog offers Light and Accurate as two cards (speed, accuracy, size) with one *Download and transcribe* button; the chosen card shows the download (percentage, time left, Pause and Cancel), then follows the first transcript to "All set". Settings → Optional packs uses the same look.
- Home's microphone, computer sound and camera are three cards, with a level meter, a live waveform for computer sound and a wide camera preview.
- Settings: every section follows the same look (an illustrated header, cards with an icon, chips and status pills).
- A recording opens in the editor as soon as it is saved. When something went missing (audio, camera, cut short), Home explains it and offers *Open in editor*.
- Recording starts sooner after the countdown: the capture helper gets ready during the 3-2-1.
- Choosing *Select* on Home opens the selection frame right away.
- Long labels in German and French, and Chinese, Japanese and Korean text, fit their screens (tooltips on cut-off names, caption styles on two lines).
- Settings → Connect to an agent shows how to build the local MCP server from source while `@kamo/mcp` is not on npm, with your folders filled in.
- On Windows the app no longer has a Window menu that only repeated the title bar buttons.

### Fixed
- Clicks in the microphone track of some recordings: the microphone is now recorded straight from the device.
- A microphone level that jumped while nobody spoke: automatic gain and echo cancellation are now off.
- When a model download stops (offline, Hugging Face unreachable, a damaged file, not enough space), the Transcribe dialog shows one calm message instead of the same error twice, and *Try again* continues where it stopped.
- The permissions button says *Open Windows Settings* on Windows (it said *Open System Settings*, the Mac name).
- The command for a development build of the MCP server now starts it.
- The MCP docs name the *Optional packs* section of Settings correctly.

## [0.1.0] — first public release (Windows)

Full notes: [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md).

### Added
- Desktop app for Windows 10 (2004+) and 11: record the whole screen, a window or a selection, with microphone, computer sound and webcam, at 30 or 60 fps; mouse only, never the keyboard.
- Automatic zoom on every click with a spring camera, editable on the timeline; smooth cursor; trim; undo and redo.
- Webcam bubble (round, square, 16:9, 9:16; any corner or free position; shrinks on zoom) and a split layout in 9:16.
- Wallpapers, your own background image, padding, corners and shadow; 16:9, 1:1 and 9:16 with framing that follows the clicks.
- Export to MP4 (1080p or 4K, 30 or 60 fps), GIF and .srt; no watermark.
- Local transcription as an optional whisper.cpp pack, and captions in 12 styles, editable on the timeline.
- Local playlists, crash recovery, close to tray, automatic updates on Windows.
- Local MCP server (read-only, no network) and a *Connect to an agent* panel.
- Five languages (en, pt-BR, es, zh-CN, ja), light and dark themes, a welcome tour and *Copy diagnostics*.

### Coming soon
- Mac app and Chrome extension (built and tested in CI, not released yet).
- `@kamo/mcp` on npm, code-signed installers.

[Unreleased]: https://github.com/dssiqueira/kamo/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dssiqueira/kamo/releases/tag/v0.2.0
[0.1.0]: https://github.com/dssiqueira/kamo/releases/tag/v0.1.0
