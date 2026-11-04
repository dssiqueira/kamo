# data-model.md

> Projects are always local: each one is a folder on the user's disk (or in the extension's OPFS). The cloud is optional and stores only the exported video and its metadata (see "Kamo Cloud" at the end).

## Layout on disk
```
~/Kamo/
└── projects/
    └── <project-id>/
        ├── project.json      # metadata + edits (source of truth)
        ├── screen.mp4        # raw capture
        ├── webcam.mp4        # optional (webcam bubble)
        ├── audio.m4a         # microphone, optional: AAC-LC 48kHz in fragmented MP4, from MediaRecorder (D-024)
        ├── system.m4a        # computer sound, optional, same format (desktop; in the extension, the audio lives inside screen.webm)
        ├── events.jsonl      # raw mouse events
        ├── frames/           # reference thumbnails every 5s (JPEG, 480px wide, named by video second: 0005.jpg), captured DURING recording, straight from the stream (no decoding afterwards)
        ├── transcript.json   # local transcript (A-05, only with the pack installed)
        └── captions.json     # optional: caption style and adjustments
```
Global settings: `app-data/settings.json`. Optional packs: `app-data/packs/<pack>/<version>/` + `app-data/packs.json` (what is installed, version and SHA-256). Kamo Cloud session (if logged in): OS keychain, never in a plain file.

### In the extension
The project format is **the same** (same `project.json`, same files); only where it lives changes:
- Projects live in the extension's **OPFS** (Origin Private File System), with the same folder structure
- Settings in `chrome.storage.local`
- Kamo Cloud session in `chrome.storage.local` (the extension has no keychain; it stays isolated in the extension's storage)
- Recorded video in `screen.webm` (what the browser records), with the tab audio and the microphone inside it, on separate tracks (Opus); `audio.m4a` and `system.m4a` do not exist in the extension. The `core` reads both formats and export converts to MP4
- Reference thumbnails in `frames/` in OPFS, captured by the offscreen document during recording
- The editable project is not synced between the extension and the desktop; what shows up on every device is the video uploaded to Kamo Cloud

The `core` reads and writes projects only through the `ProjectStore` interface. The desktop implements it with the file system, the extension with OPFS.

## Entities

### Project
| Field | Type | Rule |
|---|---|---|
| id | string (uuid) | generated on creation |
| name | string | default: i18n key `project.defaultName` ("Recording {date}"), with the date formatted by `Intl` in the UI language |
| createdAt | ISO date | |
| durationMs | number | |
| source | `{ kind: display \| window \| region \| tab, displayId?, windowTitle?, rect?: { x, y, width, height }, width, height, scaleFactor, fps }` | from the capture; `tab` = recorded by the extension; `window` and `region` from v0.4 (A-08) |
| style | Style | |
| zooms | Zoom[] | sorted by startMs, no overlap |
| cursor | CursorSettings | |
| webcam | WebcamSettings \| null | webcam bubble (A-03): visible, position (corner), optional anchor (free center dragged in the preview, 0..1 of the output frame; absent = in the corner), size (small/medium/large), shrinkOnZoom, hidden stretches `{ startMs, endMs }[]` and optional offsetMs; the camera itself is in `webcam.mp4`; null when recorded without the camera |
| captions | CaptionSettings \| null | captions (v0.4) |
| transcript | `{ status: none \| pending \| done \| failed, language?, model? }` | transcription state; the content lives in `transcript.json` |
| cloud | CloudLink[] | videos from this project uploaded to the cloud; empty if never uploaded |
| trim | `{ startMs, endMs }` | trim of the start and end (F-16); does not alter the raw video |
| audio | `{ mic: { enabled, volume, offsetMs? }, system: { enabled, volume, offsetMs? } }` | recorded tracks and the volume of each in the export. `enabled` is true when the track's file exists. `offsetMs` (optional, missing = 0, so older version 1 files stay valid): where the track's first sample sits on the video timeline; negative when the audio started before the first video frame (export skips its first `-offsetMs`), positive when it started later (export adds silence first). Measured at recording time from the MediaRecorder `start` of each track and the helper's `started` (D-024). Pauses stop audio and video together, so one offset covers the whole take. A microphone unplugged mid-recording leaves silence in the file from that point on. If AAC/MP4 recording is ever unavailable, the desktop falls back to Opus in `audio.webm` / `system.webm` |
| exports | `{ aspect, resolution, fps, format, path, createdAt }[]` | history of local exports (used by the MCP and by "Show in folder") |
| pendingUpload | `{ uploadId, aspect, partsDone: number[], totalParts, startedAt } \| null` | state of the in-progress multipart upload, to resume after closing the app (C-02) |
| version | number | schema version, for migration |

### MouseEvent (events.jsonl)
| Field | Type | Rule |
|---|---|---|
| t | number (ms) | relative to the start of the recording |
| x, y | number | always in pixels of the recorded video. Desktop: display coordinates normalized by scaleFactor. Extension: tab coordinates (CSS px) × devicePixelRatio, adjusted by the browser zoom |
| type | `move` \| `down` \| `up` \| `scroll` | **never** keyboard events |
| button | `left` \| `right` \| `middle` | only on down/up (required there) |
| dx, dy | number | only on scroll (required there): wheel delta |
| outside | `true` | only on move, optional: the pointer is outside the recorded area (e.g. another display); the camera ignores these stretches (F-03) |

Lines are parsed tolerantly: an invalid or truncated line (crash mid-recording) is skipped and reported, never fatal. Unknown fields make a line invalid, so a keyboard field can never slip in.

### Zoom
| Field | Type | Rule |
|---|---|---|
| id | string | |
| startMs / endMs | number | minimum duration 600ms |
| scale | number | 1.0–4.0, default 2.0 |
| target | `{ x, y }` | center of the zoom; follows the cursor if `follow = true` |
| follow | boolean | default true |
| origin | `auto` \| `manual` | auto = generated from a click |
| leadMs | number | default ~300ms — camera starts moving before the click |

### Style
| Field | Type | Rule |
|---|---|---|
| background | `{ kind: preset \| image \| color, value }` | `image` from v0.4 |
| padding | number (%) | 0–20, default 8 |
| radius | number (px) | default 12 |
| shadow | boolean | default true |

### CursorSettings
| Field | Type | Rule |
|---|---|---|
| smooth | boolean | default true |
| stiffness / damping | number | default 170 / 26 |
| size | number | 1.0–3.0 |
| clickRipple | boolean | default true |
| hidden | boolean | hides the cursor in the whole video; default false |
| autoHide | boolean | disappears after 3s still and comes back when moved; default true |

### ExportJob
| Field | Type | Rule |
|---|---|---|
| projectId | string | |
| aspects | (`16:9` \| `1:1` \| `9:16`)[] | `9:16` from v0.4 |
| resolution | `1080p` \| `4k` | `4k` from v0.4 |
| fps | 30 \| 60 | 60 from v0.4 |
| format | `mp4` \| `gif` | `gif` from v0.4 |
| uploadToCloud | boolean | if checked, uploads to Kamo Cloud when finished (requires login) |
| captions | `none` \| `burn` \| `srt` | captions burned into the video, an `.srt` file alongside, or nothing; only with a transcript (A-06) |
| status | `queued` \| `rendering` \| `done` \| `failed` | |
| outputPaths | string[] | |

### Transcript (transcript.json)
| Field | Type | Rule |
|---|---|---|
| language | `pt` \| `en` \| … | detected by Whisper |
| model | string | e.g. `whisper-base` |
| createdAt | ISO date | |
| segments | `{ startMs, endMs, text }[]` | aligned to the continuous video time (no pauses); no empty segments |
| edited | boolean | true if the user corrected it through the captions |

The local MCP reads this file, `project.json`, `events.jsonl` and the thumbnails in `frames/`. It does not decode video, so it needs neither FFmpeg nor a native binary.

### CloudLink (local, inside the Project)
| Field | Type | Rule |
|---|---|---|
| videoId | uuid | id of the video in the cloud |
| shortId | string | short id of the link (`/v/<shortId>`) |
| aspect | `16:9` \| `1:1` \| `9:16` | one link per uploaded format |
| uploadedAt | ISO date | |

## Automatic zoom generation rules
1. Each left-button `down` becomes a zoom candidate
2. Clicks less than ~1.5s apart **and** within a radius of ~25% of the screen go into the same shot
3. A shot starts `leadMs` before the first click and ends ~1s after the last one
4. Zooms never overlap; if they collide, the larger one absorbs the smaller one
5. Manual user edits become `origin: manual` and are never overwritten by regeneration

## Kamo Cloud
The cloud tables (profiles, videos, playlists, shares, subscriptions, transcripts, agent connections) live in the private `kamo-cloud` repository (`docs/data-model.md`). The app only knows the API contract (see `integrations.md` → "Kamo Cloud API") and stores the `CloudLink` and the `pendingUpload` locally.
