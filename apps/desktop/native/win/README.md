# kamo-capture (Windows)

Native screen capture helper for the desktop app (D-023), in Rust with Microsoft's `windows`
crate. It records one monitor with **Windows Graphics Capture** without the system cursor
(`IsCursorCaptureEnabled = false`, D-005), encodes **H.264 into a fragmented MP4** with the
**Media Foundation Sink Writer** (hardware encoder), writes the reference JPEGs with **WIC** and
emits the mouse events (F-03) from a **mouse-only** low-level hook, all on one clock, talking to
the Electron main process over stdio. The protocol is
`apps/desktop/src/main/capture/PROTOCOL.md`; `protocol.ts` is the source of truth for field names.
Audio comes later in step 3.

Requirements: Windows 10 2004+ (cursor-free capture; borderless capture needs Windows 11), Rust
stable (edition 2024) and the Visual Studio Build Tools (MSVC linker, `x86_64-pc-windows-msvc`).
Dependencies: `windows`, `serde`, `serde_json` (reasons in `Cargo.toml`).

## Build

From `apps/desktop`:

```bash
cargo build --release --manifest-path native/win/Cargo.toml --target-dir native/win/build
```

The binary lands in `native/win/build/release/kamo-capture.exe` (~320KB), which is where
`helper-path.ts` looks in development (then `build/debug/`). Packaged builds copy it to
`<resources>/helpers/win/kamo-capture.exe` (`extraResources` in `electron-builder.yml`); CI builds
it before packaging. CI also runs, from `native/win`:

```bash
cargo fmt --check
cargo clippy --all-targets --target-dir build -- -D warnings
cargo test --target-dir build
```

## Run by hand

```bash
./native/win/build/release/kamo-capture.exe
{"cmd":"start","displayId":"1","fps":30,"output":"C:\\temp\\kamo\\screen.mp4.partial","framesDir":"C:\\temp\\kamo\\frames","frameIntervalMs":5000,"frameWidth":480,"mouse":true,"monitorPoint":{"x":0,"y":0}}
{"cmd":"pause"}
{"cmd":"resume"}
{"cmd":"stop"}
```

`monitorPoint` picks the monitor (physical pixels of the virtual screen); `{"x":0,"y":0}` is
always on the primary monitor. `displayId` is only logged. Create `framesDir` first, as main does.
Ctrl-Z then Enter (stdin EOF) also stops. Events come out on stdout, diagnostics on stderr
(technical only: no paths, window titles or screen content).

`KAMO_CAPTURE_CPU=1` forces the CPU encoding path (below), for testing.

## Design

**Threads.** The main thread owns all state (`recorder.rs`) and handles one message at a time:
commands from the stdin thread, frames from WGC's free-threaded frame pool, mouse events from the
hook thread. Thumbnails are encoded to JPEG on their own thread. No locks.

**Monitor.** Electron's `Display.id` is not an `HMONITOR`, so main sends `monitorPoint` and the
helper uses `MonitorFromPoint(MONITOR_DEFAULTTONULL)`. The process is per-monitor DPI aware (v2),
so monitor rects, hook coordinates and capture sizes are all physical pixels.

**Capture.** `IGraphicsCaptureItemInterop::CreateForMonitor` → `Direct3D11CaptureFramePool`
(free-threaded, BGRA, 2 buffers) → `GraphicsCaptureSession` with the cursor off, the yellow border
off when the OS allows it (`GraphicsCaptureAccess::RequestAccessAsync(Borderless)`, granted
without a prompt to unpackaged apps on Windows 11; on older systems the border stays and stderr
says so) and `MinUpdateInterval` = 1/fps where supported (Windows 11 24H2). Windows that set
`WDA_EXCLUDEFROMCAPTURE` (Electron's `setContentProtection(true)`, used by Kamo's floating bar)
are left out by the compositor: verified, a content-protected window over the recorded monitor
does not appear in the MP4. A removed monitor closes the capture item (and fails
`GetMonitorInfo`, checked every second): non-fatal `display_lost`, the file is finalized.

**Conversion.** Each captured frame goes through the D3D11 video processor on the GPU: BGRA (full
range) → NV12 BT.709 limited range at the video size. The video is the monitor's physical size,
even, scaled down so the longest side is at most 4096 (H.264 encoder limits). `started` reports
that size and `scaleFactor` = video pixels per DIP (the monitor's DPI / 96 times any downscale),
like Electron's `Display.scaleFactor` and the Mac helper's pixels per point.

**Encoding.** Sink writer with `MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS` and the container forced
to fragmented MP4 (`MFTranscodeContainerType_FMPEG4`; the file is named `.partial`), so a crash
leaves a playable file: a helper killed after 3.2s left 2.1s that Chromium plays. Two paths:

- **GPU** (default): the sink writer gets the D3D11 device (`MF_SINK_WRITER_D3D_MANAGER`) and each
  sample wraps an NV12 texture (`MFCreateDXGISurfaceBuffer`, with its length set, or WriteSample
  says E_INVALIDARG). No copy to system memory. NV12 textures are pooled and reused only once
  Media Foundation released them (COM reference counts back to their idle values).
- **CPU** (fallback if the GPU path cannot be set up, or fails on the first frame): each new
  frame's NV12 is read back through a staging texture into a memory buffer. Conversion still
  happens on the GPU; the cost is one copy per new frame (3MB at 1080p, 12MB at 4K) and a GPU
  sync.

Rate control: constant quality (`eAVEncCommonRateControlMode_Quality`, the encoder's default
quality), then unconstrained VBR, then the encoder's defaults, whichever the encoder accepts;
keyframe every 2s (the editor seeks a lot). On NVENC at 3440x1440 a repeated frame costs ~200
bytes and a keyframe ~1MB, so a still screen is about 4Mbps.

**Timeline and pauses.** WGC only delivers a frame when the screen changes. The encoder is fed at
a constant rate instead: slot _k_ is at _k_/fps of video time and shows the newest frame captured
at or before it, so a static screen repeats the last frame (tiny P-frames) and the MP4 has a
steady 30/60fps timeline. A slot is encoded 50ms after its time, so a frame captured just before
it has arrived. All times are QPC in 100ns units, which is also the unit and origin of
`Direct3D11CaptureFrame.SystemRelativeTime`:
`video time = host time − first frame − paused time`. While paused no slot is written; the
newest frame captured during the pause becomes what the video shows right after the resume.
`paused`/`resumed` report the video time of the pause, and `durationMs` is slots × 1/fps, which
excludes the pauses and equals the MP4's duration.

**Reference frames.** When a slot crosses a multiple of `frameIntervalMs`, its NV12 frame goes
through a second video processor to `frameWidth`×(aspect) BGRA, is read back (small) and handed
to the thumbnail thread, which encodes `NNNN.jpg` with WIC at quality 0.7 and only then sends
`frame`. `stopped` waits for that thread, so every `frame` precedes it.

**Mouse.** `WH_MOUSE_LL` on its own thread with a `GetMessage` loop; the hook only handles mouse
messages (move, left/right/middle down/up, wheel, horizontal wheel), stamps each with QPC and
always calls `CallNextHookEx`. **No other hook and no keyboard API, ever** (AGENTS.md rule 2;
`pnpm guard:keyboard` fails CI otherwise). On the main thread `MouseTrack` maps physical screen
pixels to video pixels of the recorded monitor (minus its origin, times video/physical), thins
moves and scrolls to ~60Hz keeping the last position, marks moves off the monitor `outside`,
drops downs and scrolls off it, clamps the `up` of a drag that left it, and converts wheel notches
to video pixels (one notch = 100 DIP, Chromium's default). `mouse: false` installs no hook; a hook
that cannot be installed is a non-fatal `mouse_unavailable`.

**Errors.** `display_not_found` (no `monitorPoint`, or no monitor there), `permission_denied`
(WGC unsupported or blocked, access denied), `encoder_failed` (no D3D11 video device, Media
Foundation missing, as on Windows N without the Media Feature Pack, or the encoder refuses
frames), `display_lost` and `disk_full` (free space under 200MB, checked every 5s, or a disk-full
write error: the file is finalized and `stopped` follows), `internal`. Panics report a fatal
`internal` on stdout before aborting.

## Not verified yet

- `display_lost` and `disk_full` by unplugging a monitor or filling a disk (logic only).
- Intel and AMD hardware encoders (developed on NVIDIA; the CPU path and the rate-control
  fallbacks are there for them), hybrid-GPU laptops, HDR monitors, Windows 10.
- Mouse events against a real recording with clicks and drags (the mapping, throttle and
  off-monitor rules are unit tested).
