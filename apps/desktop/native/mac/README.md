# kamo-capture (Mac)

Native screen capture helper for the desktop app (D-023). It records one display, a region of it (`sourceRect`) or one window (`desktopIndependentWindow`, A-08) with
ScreenCaptureKit (`showsCursor = false`, D-005), encodes H.264 into a fragmented MP4 with
AVAssetWriter (VideoToolbox) and writes the reference JPEGs, talking to the Electron main
process over stdio. The protocol is in `apps/desktop/src/main/capture/PROTOCOL.md`; `protocol.ts`
is the source of truth for field names. It also emits the mouse events (F-03) from a listen-only,
mouse-only AppKit global monitor (`Sources/kamo-capture/Mouse.swift`, D-043), on the same clock as the video, and, when `start.systemAudio` asks, the computer sound
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

While recording the helper never prompts (`CGPreflightScreenCaptureAccess` only). The onboarding asks through `kamo-capture --request-screen-access` (prints `{"granted":true|false}` and exits): Electron has no API for it. On macOS 26 neither `CGRequestScreenCaptureAccess` nor `desktopCapturer` adds Kamo to the System Settings list (tccd: "does not allow prompting"); asking ScreenCaptureKit for the shareable content does, and shows the system dialog. Each such call shows the dialog again, so nothing that refreshes (the window list, thumbnails) may call it without the permission.

## Mouse events (D-043)

The mouse comes from an AppKit global monitor, `NSEvent.addGlobalMonitorForEvents`, in
`Sources/kamo-capture/Mouse.swift`:

- The mask (`MouseTap.eventMask`) has only mouse types: moved, left/right/other down/up/dragged
  and scroll wheel. **No keyboard type, ever** (AGENTS.md rule 2, D-003); `pnpm guard:keyboard`
  allows only this exact call and fails CI on any keyboard type or an all-events mask.
- A global monitor only observes: it cannot change or block an event. It does not see events sent
  to the helper itself, which has no windows.
- It runs on the main thread, so `main.swift` runs an `NSApplication` (activation policy
  `.prohibited`: no Dock icon, no menu) instead of `dispatchMain()`. Events go to the recorder's
  queue, which converts them to video pixels and video time and thins moves to about 60Hz
  (PROTOCOL.md, Mouse events).
- Timestamps: `CGEventTimestamp` (from `event.cgEvent`) is documented as nanoseconds but reported
  to be mach ticks on Apple silicon, so both readings are tried against the host clock (the clock
  of the frames) and the arrival time is used if neither is within 250ms.

**No permission.** Mouse events through a global monitor need no privacy permission (only key
events need Accessibility), so onboarding asks for no Input Monitoring. The Quartz event tap used
before does not work on macOS 26 without Input Monitoring: it is created, then tccd logs
"Service kTCCServiceListenEvent does not allow prompting; returning denied" and no event arrives
(0 in 60s, against 1540 moves and 15 clicks for the monitor on the same Mac).

## Local Kamo.app without a Developer ID

macOS ties Screen Recording and Microphone to the app's signature. An ad-hoc signature is tied to
the binary's hash, so every rebuild is a new app to System Settings: the switch stays on for the old
build and the new one is denied (tccd logs `Failed to match existing code requirement`). Pinning
the designated requirement to the bundle identifier does not help on macOS 26. Sign local builds
with a stable identity instead; a self-signed code-signing certificate in the login keychain is
enough (it shows as `CSSMERR_TP_NOT_TRUSTED` and still signs):

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac dir --arm64 --publish never
KAMO_SIGN_IDENTITY="Kamo Local" sh scripts/sign-mac-local.sh release/mac-arm64/Kamo.app
open release/mac-arm64/Kamo.app
```

Create the certificate once (subject `CN=Kamo Local`, `extendedKeyUsage = critical,codeSigning`,
`keyUsage = critical,digitalSignature`) with `openssl req -x509`, export it with `openssl pkcs12`
and `security import … -T /usr/bin/codesign`. After switching signatures, remove the old Kamo
entry from the privacy lists (−) once and grant again.

## Signing (step 10)

The helper has to be signed with the same Developer ID as the app, with the hardened runtime and
a secure timestamp, or notarization fails (electron-builder: list it in `mac.binaries`).
ScreenCaptureKit needs no entitlement (Screen Recording is a privacy permission, not an
entitlement) and the app is not sandboxed, so no entitlements file is needed for video. The mouse
monitor needs no entitlement either. Step 3
(microphone) will need `com.apple.security.device.audio-input` on the hardened runtime, plus
`NSMicrophoneUsageDescription` in the app's `Info.plist`.
