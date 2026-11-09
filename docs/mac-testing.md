# Testing on a Mac

How to build Kamo on a Mac and run the first real pass (issue #7). The release checklist
(`docs/release-checklist.md`) is the full list; this file gets you to the point where you can
start it, and lists what has never run on a real Mac.

Needs: an Apple silicon Mac with macOS 13.3 or later, Xcode 15+ (or its Command Line Tools:
`xcode-select --install`), Node 24 and pnpm (`corepack enable`).

## 1. Build

```bash
git clone https://github.com/dssiqueira/kamo.git && cd kamo
pnpm install
swift build -c release --package-path apps/desktop/native/mac --scratch-path apps/desktop/native/mac/build
pnpm check
```

`pnpm check` should be green on the Mac too (lint, typecheck, tests, i18n).

## 2. Run from source (fastest loop)

```bash
pnpm --filter @kamo/desktop dev
```

In development macOS gives the permissions to the **terminal** that started Kamo, not to Kamo:
allow Terminal (or iTerm, VS Code) in System Settings → Privacy & Security → Screen & System
Audio Recording, and Microphone and Camera when asked, then quit and reopen the terminal.

## 3. Package an unsigned app (what users get, minus the signature)

```bash
pnpm --filter @kamo/desktop exec electron-vite build
pnpm --filter @kamo/desktop exec electron-builder --publish never -c.mac.identity=null
```

The dmg and the zip land in `apps/desktop/release/`. Open the dmg, drag Kamo to Applications.
It is not signed, so the first open needs right-click → Open (or
`xattr -dr com.apple.quarantine /Applications/Kamo.app`). Here the permissions belong to
Kamo.app itself. An unsigned app gets a new identity on every rebuild, so macOS may ask again
after each one; `tccutil reset ScreenCapture app.kamo.desktop` clears an old grant.

Signing and notarization (Developer ID) only happen in the release workflow, with the Apple
secrets in `docs/release-checklist.md`.

## 4. Never tried on a real Mac yet

Check these first; each one has only been compiled in CI.

- [ ] Onboarding asks for Screen Recording, then Microphone, and sees the grant without a restart
- [ ] Record the main display; then a second display, a window and a region (A-08)
- [ ] Clicks become zooms and the cursor lines up on a Retina display. The mouse tap is listen-only and mouse-only: it should need **no** Input Monitoring or Accessibility grant. If the editor has no clicks, look for `mouse_unavailable` in the log (`apps/desktop/native/mac/README.md` explains why)
- [ ] Computer sound (ScreenCaptureKit audio, D-024): a video playing during the recording is heard in the export, in sync
- [ ] Microphone and webcam bubble; the camera is asked only when the webcam is turned on
- [ ] Menu bar icon while recording; closing the window keeps Kamo in the Dock; Cmd+Q quits
- [ ] Export 1080p30, 4K and 60fps with the hardware encoder (Settings → Copy diagnostics names it)
- [ ] Transcription pack (once the `packs` release exists): the downloaded `whisper-cli` runs without a Gatekeeper block

## 5. When something fails

- Log: `~/Library/Application Support/Kamo/logs/kamo.log`
- Settings → Help → Copy diagnostics, pasted into the issue
- Signing or library-validation errors show up in Console.app (filter by `Kamo` or `kamo-capture`)

Open an issue with the log and the diagnostics, or comment on #7.
