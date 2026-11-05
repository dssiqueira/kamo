# Changelog

All notable changes to Kamo are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Each release also has full notes in [`docs/releases/`](docs/releases/), which become its GitHub release page.

## [Unreleased]

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

[Unreleased]: https://github.com/dssiqueira/kamo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dssiqueira/kamo/releases/tag/v0.1.0
