# kamo-capture (Mac)

Native screen capture helper for the desktop app (D-023). It records one display with
ScreenCaptureKit (`showsCursor = false`, D-005), encodes H.264 into a fragmented MP4 with
AVAssetWriter (VideoToolbox) and writes the reference JPEGs, talking to the Electron main
process over stdio. The protocol is in `apps/desktop/src/main/capture/PROTOCOL.md`; `protocol.ts`
is the source of truth for field names. Video only for now: mouse events and audio come in step 3.

Requirements: macOS 13.3+, Xcode 15+ (Swift 5.9+). No third-party dependencies.

## Build

From `apps/desktop`:

```bash
swift build -c release --package-path native/mac --scratch-path native/mac/build
```

The binary lands in `native/mac/build/release/kamo-capture`, which is where `helper-path.ts`
looks in development (then `build/debug/`). Packaged builds copy it to
`Kamo.app/Contents/Resources/helpers/mac/kamo-capture` (`extraResources` in
`electron-builder.yml`); CI builds it before packaging. CI also builds it with
`-Xswiftc -warnings-as-errors`.

## Run by hand

```bash
./native/mac/build/release/kamo-capture
{"cmd":"start","displayId":"1","fps":30,"output":"/tmp/kamo/screen.mp4.partial","framesDir":"/tmp/kamo/frames","frameIntervalMs":5000,"frameWidth":480}
{"cmd":"pause"}
{"cmd":"resume"}
{"cmd":"stop"}
```

`displayId` is a `CGDirectDisplayID` (the main display is usually `1`; Electron's `Display.id`
is the same number). Create `framesDir` first, as main does. Ctrl-D (stdin EOF) also stops.
Events come out on stdout, diagnostics on stderr.

## Screen Recording permission

macOS attributes the permission to the _responsible_ app, not to the helper:

- **Development:** the app that started the process tree, i.e. your terminal (Terminal, iTerm,
  VS Code...). Allow it in System Settings → Privacy & Security → Screen & System Audio
  Recording, then restart that terminal. Without it the helper answers `start` with a fatal
  `permission_denied`.
- **Packaged:** Kamo.app, since the helper is a child process inside its bundle. To be verified
  on a signed build (step 10).

The helper never prompts (`CGPreflightScreenCaptureAccess` only); asking is the onboarding's job.

## Signing (step 10)

The helper has to be signed with the same Developer ID as the app, with the hardened runtime and
a secure timestamp, or notarization fails (electron-builder: list it in `mac.binaries`).
ScreenCaptureKit needs no entitlement (Screen Recording is a privacy permission, not an
entitlement) and the app is not sandboxed, so no entitlements file is needed for video. Step 3
(microphone) will need `com.apple.security.device.audio-input` on the hardened runtime, plus
`NSMicrophoneUsageDescription` in the app's `Info.plist`.
