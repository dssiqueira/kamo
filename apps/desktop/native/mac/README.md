# kamo-capture (Mac)

Native screen capture helper for the desktop app (D-023). It records one display, a region of it (`sourceRect`) or one window (`desktopIndependentWindow`, A-08) with
ScreenCaptureKit (`showsCursor = false`, D-005), encodes H.264 into a fragmented MP4 with
AVAssetWriter (VideoToolbox) and writes the reference JPEGs, talking to the Electron main
process over stdio. The protocol is in `apps/desktop/src/main/capture/PROTOCOL.md`; `protocol.ts`
is the source of truth for field names. It also emits the mouse events (F-03) from a listen-only,
mouse-only event tap (`Sources/kamo-capture/Mouse.swift`), on the same clock as the video, and, when `start.systemAudio` asks, the computer sound
(ScreenCaptureKit audio → AAC `system.m4a` through AVAssetWriter, D-024). Window, region and sound are
not tried on a Mac yet.

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
{"cmd":"start","displayId":"1","fps":30,"output":"/tmp/kamo/screen.mp4.partial","framesDir":"/tmp/kamo/frames","frameIntervalMs":5000,"frameWidth":480,"mouse":true}
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

## Mouse events and Input Monitoring (to verify on a Mac, F-13)

The mouse comes from a Quartz event tap created with `CGEvent.tapCreate`:

- `.cgSessionEventTap`, `.headInsertEventTap`, `.listenOnly`: it observes, it never changes or
  blocks an event. A session tap is enough (the global locations are the same as at the HID level)
  and is the level an unprivileged process may observe.
- The mask is built only from mouse types: moved, left/right/other down/up/dragged and scroll
  wheel. **No keyboard type, ever** (AGENTS.md rule 2, D-003); `pnpm guard:keyboard` fails CI if
  one shows up.
- It runs on its own thread and run loop. Events go to the recorder's queue, which converts them to
  video pixels and video time and thins moves to about 60Hz (PROTOCOL.md, Mouse events).
- Timestamps: `CGEventTimestamp` is documented as nanoseconds but reported to be mach ticks on
  Apple silicon, so both readings are tried against the host clock (the clock of the frames) and
  the arrival time is used if neither is within 250ms.

**Permission.** What we believe, not yet verified: macOS (10.15+) asks for **Input Monitoring**
(TCC `ListenEvent`) for event taps that observe the **keyboard**; a listen-only tap whose mask has
only mouse events is created without Input Monitoring and without Accessibility (which is only for
taps that modify or post events). If that is right, onboarding (F-13) does not need Input
Monitoring at all. If it is wrong, `tapCreate` returns nil, the helper sends a non-fatal
`mouse_unavailable` and keeps recording video without mouse events.

To verify on macOS 14 and 15, with a terminal (dev) and a signed Kamo.app (packaged) that have
**not** been granted Input Monitoring or Accessibility:

1. Record a few seconds and check that `mouse` lines come out on stdout (or that the project's
   `events.jsonl` is not empty) and that no `mouse_unavailable` is sent.
2. stderr logs `listen event access preflight: true|false` (`CGPreflightListenEventAccess`): note
   it, since a `false` there with mouse events flowing confirms that the mouse tap does not need it.
3. Check that no system prompt appears and that Kamo does not show up in System Settings → Privacy &
   Security → Input Monitoring.
4. Click, drag across two displays, scroll with a wheel and with a trackpad (natural scrolling on
   and off: record the sign of `dy`), and compare the click times with the video (≤ 33ms).

## Signing (step 10)

The helper has to be signed with the same Developer ID as the app, with the hardened runtime and
a secure timestamp, or notarization fails (electron-builder: list it in `mac.binaries`).
ScreenCaptureKit needs no entitlement (Screen Recording is a privacy permission, not an
entitlement) and the app is not sandboxed, so no entitlements file is needed for video. The mouse
event tap needs no entitlement either (Input Monitoring, if it turns out to be needed, is also a
privacy permission). Step 3
(microphone) will need `com.apple.security.device.audio-input` on the hardened runtime, plus
`NSMicrophoneUsageDescription` in the app's `Info.plist`.
