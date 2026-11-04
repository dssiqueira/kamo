# Capture helper protocol

The desktop records the screen through a small native helper per OS (D-023): Rust on Windows (Windows Graphics Capture + Media Foundation, through the official `windows` crate), Swift on Mac (ScreenCaptureKit). The Electron main process starts it, talks to it over stdio and owns everything else (project folder, recovery marker, `project.json`).

`protocol.ts` holds the zod schemas for every message below; this file and that one must agree. `fake-helper.ts` is a reference implementation in TypeScript used by the tests.

## Transport

- **JSON Lines**, UTF-8, one JSON object per line, `\n` terminated (`\r\n` is tolerated).
- **stdin**: commands from main. **stdout**: events from the helper, and nothing else. **stderr**: free-form diagnostics; main copies each line into the local log (`capture.helper.stderr`), so it must never contain screen content or user data.
- Lines longer than 64 KiB are dropped by main.
- Main ignores (with a warning in the log) any line that is not JSON, any event with an unknown `event` type, and extra fields on known events. New event types therefore do not break an older main.
- Commands are strict: unknown fields are a bug in main.
- **stdin EOF means `stop`**: if main goes away, the helper finalizes what it has and exits.

## Lifecycle

```
spawn ──► ready ──start──► started ──pause──► paused ──resume──► resumed ──stop──► stopped ──► exit 0
                                  └── frame (every 5s of video time), mouse (F-03) ───┘
```

1. On launch the helper sends `ready`. Main waits up to 10s.
2. Main sends `start`. The helper answers `started` once the first frame is being encoded (main waits up to 10s), or a fatal `error` and exits non-zero.
3. While recording it writes `screen.mp4.partial` progressively, sends `frame` for each reference thumbnail and `mouse` for each mouse event (unless `start` said `mouse: false`).
4. `pause` / `resume` are answered by `paused` / `resumed`. Paused time is not video time: the video is continuous (F-02).
5. On `stop` the helper finalizes the MP4, sends `stopped` and exits 0. Main waits up to 30s for `stopped`, then for the process to exit, and only then renames `screen.mp4.partial` → `screen.mp4` (Windows file locks).

## Commands (stdin)

| Command | Fields | Notes |
|---|---|---|
| `start` | `displayId: string`, `fps: 30 \| 60`, `output: string`, `framesDir: string`, `frameIntervalMs: int`, `frameWidth: int`, `mouse?: boolean` | `output` is the absolute path of `screen.mp4.partial`; `framesDir` is the absolute path of the project's `frames/` (main creates it). Today `frameIntervalMs` is 5000 and `frameWidth` 480. `mouse` (default `true`): send `mouse` events; `false` records video only and installs no mouse hook. Only the first `start` counts. |
| `pause` | — | Ignored if already paused. |
| `resume` | — | Ignored if not paused. |
| `stop` | — | Finalize and exit. |

```json
{"cmd":"start","displayId":"65537","fps":30,"output":"C:\\Users\\me\\Kamo\\projects\\<id>\\screen.mp4.partial","framesDir":"C:\\Users\\me\\Kamo\\projects\\<id>\\frames","frameIntervalMs":5000,"frameWidth":480,"mouse":true}
```

`displayId` is the Electron `Display.id` as a string (what Home lists, F-01). Each helper maps it to its own API (Windows: the `HMONITOR` whose device matches; Mac: `CGDirectDisplayID`, which is what Electron uses).

## Events (stdout)

| Event | Fields | When |
|---|---|---|
| `ready` | `version: string` | Once, on launch. |
| `started` | `width: int`, `height: int`, `scaleFactor: number`, `fps: 30 \| 60` | Recording began. `width`/`height` are video pixels (physical pixels of the display); they go into `project.json → source`. |
| `paused` | `tMs: number` | After `pause`; `tMs` is the video time at the pause. |
| `resumed` | `tMs: number` | After `resume`; equals the `tMs` of the pause (paused time is not video time). |
| `frame` | `file: string`, `tMs: number` | A reference thumbnail was written to `framesDir/file`. JPEG, `frameWidth` px wide, aspect kept. `file` is the video second, zero-padded to 4 digits: `0000.jpg`, `0005.jpg`, `0010.jpg`. Written straight from the capture stream, no decoding afterwards. |
| `mouse` | `t: number`, `type`, `x: number`, `y: number`, `button?`, `dx?`, `dy?`, `outside?: true` | One mouse event; see [Mouse events](#mouse-events). |
| `stopped` | `durationMs: number`, `frames: int` | The MP4 is finalized and closed. `durationMs` excludes pauses. The helper exits 0 right after. |
| `error` | `code`, `message: string`, `fatal: boolean` | See below. `message` is technical English for the log, never shown to the user. |

Error codes: `display_not_found`, `permission_denied`, `encoder_failed`, `disk_full`, `display_lost`, `mouse_unavailable`, `internal`.

- **`fatal: true`**: the helper cannot go on and exits non-zero **without** `stopped`. Used for start failures (`display_not_found`, `permission_denied`, `encoder_failed`) and for anything that leaves no usable file. Main deletes the project folder if recording never started, and keeps it for recovery otherwise.
- **`fatal: false`** with `display_lost` or `disk_full`: the helper stops **by itself**, finalizes what it has, sends the error, then `stopped`, then exits 0. Main saves the project and tells the user why it stopped (F-02 edge cases).
- **`fatal: false`** with another code: a warning; recording continues. `mouse_unavailable` means the mouse cannot be observed (Mac: the event tap could not be created, i.e. a missing permission); the video goes on and `events.jsonl` stays empty. When it happens before `started`, the helper sends it right after `started`.

## Mouse events

F-03, D-003, D-023. The helper hooks the **mouse only**: never a keyboard event type, not even in an event mask (AGENTS.md rule 2). Each event is one line:

```json
{"event":"mouse","t":1016.7,"type":"move","x":812.5,"y":430}
{"event":"mouse","t":1200,"type":"down","button":"left","x":812.5,"y":430}
{"event":"mouse","t":1500,"type":"scroll","x":812.5,"y":430,"dx":0,"dy":-24}
{"event":"mouse","t":2000,"type":"move","x":-35,"y":430,"outside":true}
```

Apart from `event`, the fields are exactly those of a line of `events.jsonl` (`MouseEventRecord` in `packages/core/src/events/events.ts`, data-model.md): main strips `event`, validates the rest with that strict schema and writes it with `formatEvent`. An event that does not validate (an unknown `type`, a `button` on a move, `outside` on a click...) is dropped with a warning in the log.

- `t`: video time in ms, the **same time base as `frame` and `durationMs`** (host clock − first frame − pauses). Sent only while recording: never before `started`, never between `paused` and `resumed` (main drops any that come), never for a moment that fell in a pause, never after `stopped`. So `0 ≤ t ≤ durationMs`. Target offset from the video: ≤ 1 frame (33ms).
- `type`: `move` \| `down` \| `up` \| `scroll`. A drag is `down`, moves, `up`. Moves are thinned to about 60Hz, keeping the last position before the pointer rests.
- `x`, `y`: pixels of the recorded video, origin at its top left (display position in points minus the display origin, times video pixels per point, so the scale factor and any downscaling are included).
- `button`: `left` \| `right` \| `middle`, on `down`/`up` only (other buttons are not sent).
- `dx`, `dy`: on `scroll` only, wheel delta in video pixels, coalesced to about 60Hz. Positive `dy` means scrolling toward the top of the content (a classic wheel rolled away from the user); the helpers pass the OS sign through, so the meaning under macOS natural scrolling is still to be checked on a Mac.
- `outside: true`: on `move` only, the pointer is off the recorded display; the camera ignores those stretches. `x`/`y` are then outside `[0, width] × [0, height]`. Off the display, `down` and `scroll` are not sent; an `up` is sent only if its `down` was, clamped to the display edge, so a drag that leaves the display still ends.

Main streams them into `events.jsonl` through the store's `openWritable`: `events.jsonl.partial` while recording, renamed to `events.jsonl` with the project on a clean stop (empty when the mouse is off or unavailable). If the helper crashes, main closes the file as `events.jsonl` next to the marker and the video partial; if main itself dies, `events.jsonl.partial` stays. Either way the marker is what recovery looks for.

A process that exits before `stopped` (any exit code) is a crash. Main keeps the folder with `recording.lock` and `screen.mp4.partial`, and recovery offers it on the next launch ("We found an interrupted recording"). The helper should therefore write a file that is as playable as possible when cut short (fragmented MP4 is the target).

## What main does around the helper (`recording.ts`)

1. Free space ≥ 1GB on the projects volume, else `low_disk` before anything is created.
2. Create `<projects>/<id>/recording.lock` (recovery marker), then `frames/` and `events.jsonl.partial`.
3. Spawn, wait for `ready`, send `start`, wait for `started`. On failure: kill, delete the folder, reject with the helper's code (`start_timeout` / `helper_crashed` otherwise).
4. While recording: validate each `mouse` event and append it to `events.jsonl.partial`.
5. On `stopped` (asked for or not): wait for exit, discard if shorter than 1s (folder deleted, `{ discarded: 'too_short' }`), else rename the video partial, close `events.jsonl`, write `project.json`, remove the marker.

## Where the helper lives

The binary is called `kamo-capture` (`kamo-capture.exe` on Windows). `helper-path.ts` resolves it and returns `null` when it is missing, so the UI can say so instead of failing at spawn.

| | Windows | Mac |
|---|---|---|
| Sources | `apps/desktop/native/win/` (cargo) | `apps/desktop/native/mac/` (Swift package) |
| Dev build | `cargo build --release --manifest-path native/win/Cargo.toml --target-dir native/win/build` | `swift build -c release --package-path native/mac --scratch-path native/mac/build` |
| Dev path | `native/win/build/release/kamo-capture.exe` (then `debug/`) | `native/mac/build/release/kamo-capture` (then `debug/`) |
| Packaged | `<resources>/helpers/win/kamo-capture.exe` | `<resources>/helpers/mac/kamo-capture` |

Dev paths are relative to `apps/desktop` (`app.getAppPath()` in development). Packaged builds copy the binary with electron-builder `extraResources` (`from: native/${os}/build/<config>/…`, `to: helpers/${os}/`), where `${os}` is `win` or `mac`. On Mac the helper is signed with the app; macOS should attribute its screen recording permission to Kamo (the responsible process), which the Swift helper step must verify.
