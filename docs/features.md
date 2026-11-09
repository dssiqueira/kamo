# features.md

> Each feature with its expected behavior, acceptance criteria (what must be true for it to be done) and edge cases. Screens and states are in `flows.md`, fields and data rules in `data-model.md`.
> Checked boxes = implemented and verified by automated tests or in the running app (on Windows, the dev machine). _Mac untested_ marks a checked criterion whose Mac half (Swift helper, permissions) has not run on a real Mac yet. Criteria that need a measurement nobody has taken yet (latency, sync, long recordings, average-machine speed) stay open. Status as of 2026-11-04.
> IDs: `F-xx` = desktop v0.1 · `E-xx` = extension v0.2 · `C-xx` = Kamo Cloud v0.3 (subscription) · `A-xx` = advanced features v0.4 · `M-xx` = MCP (local v0.4, cloud v0.5).
> **Everything that is F, E, A and the local MCP is free.** Only the cloud (C and the cloud MCP) has a paid plan.
> The engine features (F-05 to F-11) live in `packages/core` and `packages/ui` and apply the same way to the extension. The `E-xx` items cover only what is specific to Chrome.

## Map
| ID | Feature | Step (AGENTS.md) | Plan |
|---|---|---|---|
| F-01 | Choose a display and start recording | 2 | Free |
| F-02 | Record the screen | 2 | Free |
| F-03 | Capture mouse events | 3 | Free |
| F-04 | Record the microphone and computer sound | 3 | Free |
| F-05 | Generate zooms automatically | 5 | Free |
| F-06 | Virtual camera | 6 | Free |
| F-07 | Smoothed cursor | 7 | Free |
| F-08 | Frame style | 4 | Free |
| F-09 | Edit zooms on the timeline | 8 | Free |
| F-10 | Real-time preview | 4–8 | Free |
| F-11 | Export | 9 | Free |
| F-12 | Manage projects | 4 | Free |
| F-13 | Permissions onboarding | 10 | Free |
| F-14 | Automatic update | 10 | Free |
| F-15 | Settings and theme | 10 | Free |
| F-16 | Trim the start and the end | 8 | Free |
| F-17 | Copy diagnostics | 10 | Free |
| E-01 | Record the tab from the popup | 12 | Free |
| E-02 | Capture clicks in the tab | 13 | Free |
| E-03 | Editor and projects in the extension | 14 | Free |
| E-04 | Export and download | 15 | Free |
| E-05 | Welcome and clear limits | 15 | Free |
| E-06 | Chrome Web Store publication | 15 | Free |
| C-01 | Account and login | 16–17 | Cloud |
| C-02 | Send to cloud | 18 | Cloud |
| C-12 | Automatic upload (optional) | 22 | Cloud |
| A-07 | Optional package manager | 23 | Free |
| A-05 | Local transcription (optional package) | 23 | Free (desktop first) |
| A-06 | Automatic captions | 24 | Free (desktop first) |
| M-01 | Local MCP | 25–26 | Free (desktop) |
| A-01 | 4K and 60fps export | 27 | Free |
| A-02 | Vertical 9:16 crop and GIF | 28 | Free |
| A-03 | Webcam bubble | 29 | Free |
| A-04 | Wallpaper with your own image | 30 | Free |
| A-08 | Record a window or a selection of the screen | 30 | Free |

---


> The cloud server and web features (C-03 to C-10, M-02, M-03) live in the private `kamo-cloud` repository. C-01, C-02 and C-12 are here because they happen inside the app.

## F-01 — Choose a display and start recording
**Behavior:** the Home lists all connected displays with a live thumbnail. The user picks one, adjusts the toggles (microphone, show cursor) and clicks Record. A 3-2-1 countdown appears full screen on the chosen display and recording starts when it ends.

**Acceptance criteria**
- [x] Lists all displays, with the primary one preselected
- [x] Thumbnails update at least once per second
- [x] The chosen display and the toggles are remembered for the next recording (display, microphone, computer sound and camera; there is no "show cursor" toggle on Home: cursor visibility lives in the editor, F-07)
- [x] Esc during the countdown cancels and returns to the Home without creating a project
- [ ] From the Record click to the first frame: at most 3.5s (3s of countdown + 0.5s) — not measured yet

**Edge cases**
- Display disconnected while the Home is open → disappears from the list; if it was the chosen one, selects the primary
- No screen recording permission → Record button disabled with a link to onboarding (F-13)
- Display with a different scale (Retina + regular monitor) → the thumbnail and the recording respect each one's scale

---

## F-02 — Record the screen
**Behavior:** records the chosen display **without the system cursor** (the cursor is redrawn later, see D-005), at 30fps in native resolution. A floating bar shows the timecode and the pause and stop buttons. When stopped, opens the Editor with the project ready.

**Acceptance criteria**
- [x] The video comes out without the system cursor _(Mac untested)_
- [x] The floating bar does not appear in the video _(Mac untested)_
- [x] Pausing and resuming produces a continuous video, without the paused stretch _(Mac untested)_
- [x] The global shortcut (⌘⇧2 / Ctrl+Shift+2) stops the recording even with another app in focus
- [ ] When stopped, the Editor opens in at most 3s for a 2-minute recording — a clean save opens the editor straight away (it loads while the window is still hidden, then the window shows); measured 0.27s from Stop to the editor with its video ready for a 2.5s recording on Windows. A 2-minute recording is not measured yet. A recording saved with warnings (cut short, audio or camera missing) stays on Home, whose notice explains them and offers "Open in editor"; the same for a recovered recording
- [ ] 30-minute recordings work without freezing or noticeably dropping frames — not tested yet (the helpers write a fragmented MP4 to disk as they go)

**Edge cases**
- Disk with less than 1GB free → warns before starting; if it runs out during recording, stops and saves what was already recorded
- App closed or crashed midway → the recorded portion is recoverable on the next launch ("We found an interrupted recording"); built, but the audio and webcam of an interrupted take are not recovered yet
- Display disconnected during recording → stops and saves
- Recording shorter than 1s → discards it and warns

---

## F-03 — Capture mouse events
**Behavior:** during recording, logs the mouse movements, clicks and scroll to `events.jsonl` with the timestamp relative to the start of the video. **Never** logs the keyboard (D-003).

**Acceptance criteria**
- [x] Logs move (sampled at ~60Hz), down, up and scroll, with left/right/middle button _(Mac untested)_
- [x] Coordinates normalized to the recorded display, respecting the scale factor _(Mac untested)_
- [ ] Offset between event and video: at most 1 frame (33ms) — not measured yet
- [x] Pause events are not included (time stays aligned with the continuous video) _(Mac untested)_
- [x] No app code calls a keyboard API (verifiable by searching the code)

**Edge cases**
- Mouse outside the recorded display (on another monitor) → logged as "outside", and the camera ignores those stretches
- Click and drag → logs down, moves and up normally; becomes a single zoom that follows the drag

---

## F-04 — Record the microphone and computer sound
**Behavior:** two independent toggles on the Home: **microphone** (records to `audio.m4a`) and **computer sound** (records the system audio to `system.m4a`: the sound of the app being demonstrated, a playing video, notifications). Both stay in sync with the video.

**Acceptance criteria**
- [x] Shows a level meter for each source on the Home before recording
- [ ] Computer sound: ScreenCaptureKit on Mac (macOS 13+), WASAPI loopback on Windows — Windows done (Chromium loopback through `getDisplayMedia`, D-024); Mac written in the Swift helper (`capturesAudio`, AAC `system.m4a` on the video clock, offset in `stopped`) and builds in CI, not tried on a Mac yet; no level meter on Mac (Home says so)
- [x] Kamo plays no sound of its own during recording, so computer sound never captures the app (Windows loopback records the whole system, including Kamo; excluding only its own process would require a native module and Windows 10 2004+, which is not worth it)
- [ ] Offset between audio and video: at most 40ms in the exported video — offsets are recorded per track (`offsetMs`), not measured yet
- [x] Lets the user choose the microphone when there is more than one
- [x] In the Editor, volume and mute per track (microphone and computer), applied on export

**Edge cases**
- No microphone permission → records only the video and warns
- Microphone disconnected during recording → the video continues, the audio is silent from that point on, and the Editor warns
- Headphone user → computer sound is still recorded (capture is digital, not through the microphone)

---

## F-05 — Generate zooms automatically
**Behavior:** when the Editor opens, turns the clicks into zoom blocks following the rules in `data-model.md` (grouping by time and distance, `leadMs`, no overlap).

**Acceptance criteria**
- [x] Each left click generates or joins a zoom
- [x] Clicks less than ~1.5s apart and within ~25% of the screen distance become a single zoom
- [x] No zoom is shorter than 600ms
- [x] "Regenerate zooms" redoes only the `auto` zooms and keeps the `manual` ones
- [x] Turning off "auto-zoom" hides the automatic zooms without deleting them
- [x] Generates the zooms for a 10-minute recording in under 1s

**Edge cases**
- Recording with no clicks → no zoom, with the notice "no clicks, nothing to zoom into"
- Clicks very close to the edge of the screen → the zoom is shifted so it does not show an area outside the video
- Right or middle click → does not generate a zoom

---

## F-06 — Virtual camera
**Behavior:** applies the zooms as a camera that moves with spring physics. It starts moving `leadMs` before the click, to arrive at the point exactly at the time of the click, and inside a zoom with `follow` on it smoothly follows the cursor.

**Acceptance criteria**
- [x] Zoom in and out with a spring (stiffness 170, damping 26), never linear
- [x] The camera reaches the target at the instant of the click (± 1 frame)
- [x] Never shows an area outside the recorded video (framing is clamped to the edges)
- [x] Inside a zoom, the cursor never leaves the frame
- [x] The preview and the export show exactly the same movement (same scene and renderer; the smoke export matches the renderer at ~50 dB PSNR)

**Edge cases**
- Two back-to-back zooms (one ends, the other starts) → the camera goes straight from one target to the other, without returning to 1.0×
- Zoom too short for the spring to complete → the camera prioritizes reaching the target, even if the return becomes faster

---

## F-07 — Smoothed cursor
**Behavior:** draws its own cursor on top of the video from the events. The shaky mouse path becomes a smooth glide between the clicked points, and the cursor always lands exactly on each click.

**Acceptance criteria**
- [x] Path smoothed with a spring, with no visible jitter
- [x] At each click, the cursor is exactly at the logged position (zero error on the click frame)
- [x] Click "ripple" effect, which can be turned off
- [x] Adjustable size from 1.0× to 3.0×
- [x] Option to hide the cursor completely
- [x] Sharp cursor at any zoom level (drawn as a vector, not scaled from a bitmap)

**Edge cases**
- Cursor still for more than 3s → fades out gradually and comes back when the mouse moves (option, on by default)
- The cursor shape changes in the system (pointer, hand, text) → in the MVP, always uses the arrow; different shapes are left for later

---

## F-08 — Frame style
**Behavior:** the video appears over a wallpaper, with padding, rounded corners and shadow, applied by default to every new recording.

**Acceptance criteria**
- [x] 8 ready-made wallpapers (in pastel, matching `DESIGN.md`), plus solid color
- [x] Padding from 0 to 20%, corners from 0 to 32px, shadow on/off
- [ ] Every change appears in the preview in under 100ms — not measured yet
- [x] The last style used becomes the default for the next recordings
- [x] The style applies to the whole video (it does not change per segment in the MVP)

---

## F-09 — Edit zooms on the timeline
**Behavior:** each zoom is a pink block on the timeline that can be moved, stretched, rescaled, deleted or created from scratch.

**Acceptance criteria**
- [x] Dragging the middle moves the block; pulling the edge changes the duration
- [x] Clicking the block opens the scale control (1.0× to 4.0×, steps of 0.25)
- [x] Delete or Backspace deletes the selected block
- [x] Double-clicking an empty space on the track creates a 2s zoom at 2.0× scale, centered on the cursor at that instant
- [x] Any edited block becomes `origin: manual`
- [x] Undo and redo (⌘Z / ⌘⇧Z, Ctrl+Z / Ctrl+Y) with at least 50 steps
- [x] Blocks do not overlap: dragging a block against another stops at the limit
- [x] Clicking and dragging on the timeline ruler moves the playhead (scrub)
- [x] Everything is saved automatically to `project.json`

**Edge cases**
- Block stretched past the end of the video → clamped to the end
- Zoom with 1.0× scale → counts as "no zoom" in that stretch, but remains a block (useful for holding the camera)

---

## F-10 — Real-time preview
**Behavior:** the Editor plays the video with style, camera and cursor applied, as it will look in the export.

**Acceptance criteria**
- [ ] Playback at 30fps without stuttering on an average machine (M1 / i5 with 8GB) — not measured yet
- [x] Space plays and pauses; arrows step 1 frame
- [x] What appears in the preview is identical to the export (same rendering code)
- [x] Audio in sync with the image: the preview plays the microphone and computer tracks with the export's offset and volume rules (hidden audio elements on the video's clock; small drift pulled in by a few % of rate, more than 150ms re-seeked); volume and mute apply live; frame steps and seeks are silent

---

## F-11 — Export
**Behavior:** on the Formats screen, the user checks the formats and exports. Each format comes out as an MP4 file.

**Acceptance criteria**
- [x] MP4 H.264 + AAC, 1080p, 30fps, in 16:9 and 1:1
- [x] The checked formats export in sequence, with a progress bar per file
- [x] In 1:1, the framing follows the virtual camera (it is not just a fixed center crop)
- [x] File name: `<project name> <format> <resolution><fps>.mp4` (e.g. `Demo 16x9 1080p30.mp4`)
- [x] Saves to the system Videos folder by default, which can be changed
- [x] "Show in folder" button at the end
- [x] Can be canceled midway; the incomplete file is deleted
- [ ] Exporting 1 minute at 1080p30 takes less than 1 minute on an average machine — on the dev machine 19s export in ~3s; CI now benchmarks the packaged app, but on GPU-less runners, so the average-machine figure is still open
- [x] No watermark, ever

**Edge cases**
- Disk full during export → stops, deletes the incomplete file and warns
- A file with the same name already exists → appends " (2)" to the name
- User closes the app during export → asks whether to cancel

---

## F-12 — Manage projects
**Behavior:** each recording becomes a project in a local folder (see `data-model.md`). The Home lists the recent ones.

**Acceptance criteria**
- [x] Lists projects with thumbnail, name, duration and date, newest to oldest
- [x] Rename (double-click the name) and delete (with confirmation; goes to the system trash)
- [x] "Show in folder" opens the project folder
- [x] Every edit is saved automatically, with no "Save" button
- [x] `project.json` with a `version` field, migrated automatically when the format changes
- [x] Local playlists (free, desktop): a row of chips above the list (All · each playlist · New playlist) filters it; a card's playlist button opens a checklist of playlists plus "New playlist"; inside a playlist, drag the cards or use the arrows to reorder, "Remove from playlist", rename and delete the playlist (with confirmation; the recordings stay). Saved in `<projects>/playlists.json` (see `data-model.md`); keyboard accessible. The extension does not have them yet

**Edge cases**
- Project folder deleted outside the app → disappears from the list without error
- Corrupted `project.json` → offers to open only the raw video and recreate the edit (Home lists it with the button; opening the raw video in the editor is not built yet)
- Project deleted in the app → leaves every playlist at once. Folder deleted or moved from outside → hidden from its playlists and cleaned from the file on the next playlist change (so a folder that comes back before that keeps its place)
- `playlists.json` unreadable → set aside as `playlists.broken-<time>.json` and playlists start over; written by a newer Kamo → Home shows none and refuses changes instead of overwriting it

---

## F-13 — Permissions onboarding
**Behavior:** on first use, Kamo first asks which language to speak, then explains the app in a three-slide welcome tour (record → click → edit and export), then guides the user through the system permissions, one per screen, explaining why each one is needed (see `flows.md`).

**Acceptance criteria**
- [x] Mac: Screen Recording, Microphone and (if step 3 confirms it is still required) Input Monitoring; Windows: Microphone _(Mac untested; whether Input Monitoring is needed is still open, so it is off for now)_
- [x] Camera is only requested when the user turns on the webcam for the first time (v0.4), never in onboarding
- [x] Automatically detects when the permission is granted, without the user having to restart the app (when the system allows it; otherwise, warns that it needs to be reopened) _(Mac untested)_
- [x] On Mac, if Input Monitoring is required, makes it clear that it is only for the mouse and that the app never reads the keyboard _(Mac untested)_
- [x] Screen Recording is mandatory; the rest can be skipped
- [x] The permissions also appear in Settings, with status and a shortcut to the system settings
- [x] Welcome tour before the permissions: three slides with Kamo explaining from a speech bubble, each with a small drawn vignette; dots, Back, Next and "Skip the tour"; → / Enter / ← / Esc inside Kamo's window; spring transitions, still with reduced motion
- [x] The tour shows only until the onboarding is finished once; opening the onboarding again for a missing permission skips it
- [x] Settings → Help → "Show the welcome tour" replays it (not during a recording or an export) _(desktop only; the extension keeps its own welcome page, E-05)_
- [x] Language screen before the tour on first run: the five languages by their own names (each with its own `lang`), the OS language preselected with "Same as your system" (else English); a pick switches the window at once; arrows / Enter, radio group; saved as Settings' language (`system` if the system's was kept) and main rebuilds its menus. Not on the permission reopen or the tour replay _(desktop only; the extension follows Chrome's language)_

---

## F-14 — Automatic update
**Behavior:** the app checks GitHub Releases for new versions and updates without the user having to download again.

**Acceptance criteria**
- [x] Checks on launch and every 24h (installed builds only; not yet run against a real GitHub release)
- [x] Downloads in the background and shows "New version ready, restart now?"
- [x] Never restarts on its own during a recording or an export
- [ ] The app update neither includes nor deletes the optional packages — packs live in `app-data/packs/`, outside the app folder (A-07), but an update over installed packs has not been tried yet
- [ ] On Mac (signed), permissions persist after the update — needs signing and a real Mac

---

## F-15 — Settings and theme
**Acceptance criteria**
- [x] Theme: Light (default) / Dark / System
- [x] Projects folder and export folder
- [x] Global stop shortcut, editable
- [x] Close to tray: closing the main window keeps Kamo running in the tray (menu bar on Mac), with Open Kamo and Quit in its menu; on by default on Windows, off on Mac (D-026). Quitting from the tray or the app menu, OS shutdown and installing an update always quit
- [x] Language: English, Portuguese (Brazil), Spanish, Simplified Chinese and Japanese in v0.1 (D-021), following the system language, with manual switching without restarting
- [x] Dates, durations, numbers and file sizes formatted to each language's standard (`Intl`)
- [ ] No screen breaks with text 35% longer than English (German, French) or with Chinese and Japanese characters — not reviewed yet
- [ ] Kamo Cloud account (see C-01 and C-09) and permissions (see F-13) — permissions done; the account waits for C-01 (step 17)

---

## F-16 — Trim the start and the end
**Behavior:** every recording has a few dead seconds at the start (clicking to start the countdown, getting settled) and at the end (looking for the stop button). Handles at the ends of the timeline trim those stretches, without altering the raw video.

**Acceptance criteria**
- [x] Handles at the start and end of the video track; dragging trims
- [x] The preview, the zooms and the export respect the trim; zooms outside the trim disappear from the timeline (but are not deleted)
- [x] Trim saved in `project.trim`, undoable like any edit
- [x] Optional automatic suggestion: "Trim the last 2s?" when the last event is the click on Stop — a discreet chip next to the timecode; one click trims (undoable), × dismisses; never shown again for that project (`project.endTrimSuggestion`)
- [x] Cuts in the middle of the video remain out of scope (it is not a video editor)

**Edge cases**
- Trim that leaves less than 1s of video → prevented, with a warning
- Audio stays aligned after the trim

---

## F-17 — Copy diagnostics
**Behavior:** the app has no telemetry, so when something goes wrong the user needs an easy way to send context. Settings → Help → **Copy diagnostics** gathers technical information into text to paste into a GitHub issue or an email.

**Acceptance criteria**
- [x] Includes: app and package versions, OS and version, architecture, GPU, status of each permission, whether the hardware encoder is available, and the last 200 lines of the local error log (no optional packs exist yet to list)
- [x] Rotating local log (max 5MB) in `app-data/logs/`, with technical events only: never project name, transcript, path with the user name, or screen content
- [x] Shows the text before copying, so the person sees what they are about to send
- [x] "Open GitHub issue" button with the diagnostics already in the body
- [x] Nothing is sent automatically, ever
- [x] In the extension, the same button on the Settings page — the extension has no Settings page, so it is in the footer of "All projects": the same dialog (text shown first, Copy, Open issue on GitHub in a new tab) and report format minus the desktop-only lines (extension version, browser from UA-CH, OS, locale, storage used/quota, microphone/camera/sites permissions, hardware H.264, and the last 50 errors kept in `chrome.storage.session`, URLs and user folders stripped, never page content). Unit tested; _(not yet tried in a real Chrome)_. Errors from the offscreen recorder are not logged yet (it has no `chrome.storage`)

---

## E-01 — Record the tab from the popup
**Behavior:** the user clicks the Kamo icon, presses Record in the popup and the current tab starts recording after the countdown. The recording runs in an offscreen document and is saved in chunks to OPFS as it goes.

**Acceptance criteria**
> Checked against the code and the unit tests on 2026-11-05 (steps 12–15). There is no automated end-to-end test of the extension in Chrome, and real `tabCapture` was never exercised in automation: _(Chrome)_ marks what only a real recording can confirm.
- [x] Records the current tab at up to 1080p30 (or the tab's resolution, if smaller) — `captureSize` (CSS size × devicePixelRatio, fit in 1920×1080, even sides) and `maxFrameRate: 30`; the real track size is read back (`shared/capture.ts`, tested)
- [x] The video comes out without the cursor (the cursor is redrawn by `core`, as on desktop) — tab capture renders the page, not the OS cursor _(Chrome)_
- [ ] 3-2-1 countdown overlaid on the tab and removed before the first recorded frame; Esc cancels — overlay removed before `start`, then the recorder waits for fresh frames; Esc cancels only from the open popup (the page gets no key listener, rule 2, and the popup closes when the page is clicked)
- [x] During recording, **nothing is injected into the page** (it would appear in the video): the icon shows the time on the badge, the popup becomes the control (timecode, pause, stop) — only the mouse listener, which draws nothing
- [ ] Stop via the shortcut (⌘⇧2 / Ctrl+Shift+2), the popup or the icon — shortcut and popup done; the icon opens the popup (where Stop is), it does not stop by itself
- [x] Tab sound recorded along (optional) and keeps playing for the user during recording — played back through an `AudioContext` _(Chrome)_
- [ ] 30-minute recordings without blowing up memory (video saved in chunks, not accumulated) — 1s `MediaRecorder` chunks written to OPFS by a worker; no 30-minute run measured yet
- [x] Reference thumbnail every 5s captured in the offscreen document and saved to `frames/` in OPFS (same format as desktop) — 480px JPEG, desktop naming (tested)
- [ ] Optional microphone, synced to within 40ms of the video; the permission is requested on a visible extension page before the first recording with a microphone — permission page and start offset (with latency) done; the 40ms is not measured yet

**Edge cases**
- `chrome://` tab or Chrome Web Store → Record button disabled with an explanation
- User closes the recorded tab → stops and saves what was already recorded
- User switches tabs → the recording continues on the original tab
- Browser closed midway → on the next launch, offers to recover the interrupted recording
- More than one Chrome window → records only the tab where the user clicked

---

## E-02 — Capture clicks in the tab
**Behavior:** a content script enters only the recorded tab (via `activeTab`) and sends the mouse events to the offscreen document, already converted to video pixels. Never reads the keyboard or the page content.

**Acceptance criteria**
- [x] Logs move (~60Hz), down, up and scroll, in the same format as desktop (`events.jsonl`) — written with core's `formatEvent` (tested, snapshot)
- [x] Converts CSS px × devicePixelRatio, accounting for browser zoom, to exact video coordinates — normalized by the viewport, so DPR and zoom fold in (tested) _(Chrome: check at 125% zoom on a HiDPI screen)_
- [ ] Offset between event and video: at most 1 frame (33ms) — page time mapped through the recording clock; not measured yet
- [x] Keeps capturing when the page navigates within the same site (reinjects the script) — `tabs.onUpdated` → inject again, guarded against doubles _(Chrome)_
- [x] Navigation to another domain: keeps capturing if the user granted the optional sites permission; if not, the video keeps recording without clicks from that point on, and the editor warns "clicks not captured after X:XX" — `eventsLostAtMs` in the project, notice with "Follow every site next time" _(Chrome)_
- [x] The content script has no keyboard listener nor any DOM reading beyond the coordinates (verifiable in the code) — a test scans its source, and `guard:keyboard` runs in CI
- [x] The script is removed when the recording stops (tested)

**Edge cases**
- Click inside an iframe from another domain → may not be captured in the MVP; the camera simply does not zoom there
- User resizes the window during recording → the coordinates stay correct (the video and the events follow)
- Scrolling page → clicks are logged at the screen position, not the document position

---

## E-03 — Editor and projects in the extension
**Behavior:** when stopped, the editor (the same one from `packages/ui`) opens in an extension tab. Projects live in OPFS and appear in the popup and on the "All projects" page.

**Acceptance criteria**
- [x] All features F-05 to F-10 work identically to desktop — the same `Editor` from `packages/ui`, zooms generated on first open, autosave to OPFS _(Chrome: side-by-side check with desktop)_
- [ ] The editor opens in at most 3s for a 2-minute recording — not measured yet
- [x] Projects listed with thumbnail, name, duration and date; rename and delete — delete is for good (no trash in a browser)
- [x] Shows the space used by projects and warns when it passes 2GB (tested)
- [x] Visible notice that projects stay in the browser

**Edge cases**
- Browser with no storage space available → warns before recording
- User clears the extension data → the projects disappear; the list is empty without error

---

## E-04 — Export and download
**Behavior:** the same Formats screen as desktop. The export uses the `core` WebCodecs encoder and the file goes to the downloads folder via `chrome.downloads`.

**Acceptance criteria**
- [x] Same formats and rules as F-11 (MP4 1080p30, 16:9 and 1:1, no watermark) — the same Formats sheet and core pipeline, saved through `chrome.downloads` _(Chrome)_
- [ ] The rendered frames (before encoding) are identical to desktop's for the same project; the final file may vary slightly because of each machine's encoder — same core renderer, but no extension-vs-desktop frame comparison exists yet
- [x] Closing the editor tab during export asks for confirmation — `beforeunload` while exporting _(Chrome)_
- [ ] Exporting 1 minute at 1080p30 in under a minute and a half on an average machine — not measured in the extension (the CI benchmark covers the desktop app)

Edge-case status: the software-encoder fallback works, but its "slower" notice shows only when the export ends, not before; "Download again" keeps the file so no re-export is needed _(Chrome)_.

**Edge cases**
- Machine without hardware acceleration for H.264 → falls back to the software encoder, with a warning that it will take longer
- Download blocked by the browser → shows the finished file with a "Download again" button

---

## E-05 — Welcome and clear limits
**Acceptance criteria**
- [x] On install, opens a welcome tab with Kamo, what the extension does and how to pin the icon to the toolbar
- [x] Makes it clear in one line that the extension records tabs, and that full screen and other apps are in the desktop app, with a download link
- [x] No extension screen requires an account to record, edit or export (the account only appears to use Kamo Cloud) — there is no login code nor `identity` permission yet

---

## E-06 — Chrome Web Store publication
**Acceptance criteria**
- [x] Manifest with only the permissions listed in `integrations.md`, no permanent `<all_urls>` — `<all_urls>` is optional only, no host permission (tested); integrations.md now lists `alarms` and marks `identity` and the cloud hosts as step 17
- [x] Justification for each permission written for the store form — `docs/store/permissions.md`, kept in step with the manifest by a test
- [x] Privacy statement: nothing leaves the browser unless the user sends it to the cloud; uploaded videos stay in their account (from v0.3) — `docs/store/privacy.md`; still to be published at a URL for the store form
- [ ] Extension package ≤ 5MB, with the popup at ≤ 150KB and opening in under 200ms (without loading `core` or the editor); verified in CI — the sizes are checked in CI and on release (1.79MB, popup 118KB gzipped on 2026-11-05); the 200ms open time is not measured
- [ ] Store page with 5 screenshots, a short video made with Kamo itself and a description in all v0.2 languages (English, Portuguese, Spanish, Simplified Chinese, Japanese, German, French and Korean) — descriptions in the 5 app languages (`docs/store/listing.md`); German, French, Korean, the screenshots and the video are missing
- [x] Extension name and short description translated via `_locales/<language>/messages.json`, the Chrome standard — generated from `packages/i18n` at build time, in the 5 app languages (tested)
- [ ] Publication automated by CI on each release (via the Chrome Web Store API) — the `chrome-web-store` job in `release.yml` exists but has not run (needs the CWS secrets and a stable tag)
- [ ] Same package published later to Edge Add-ons — not started

---

## C-01 — Account and login
**Behavior:** an account is only requested when the user wants to use the cloud. On desktop, "Sign in" opens the browser on the Kamo Cloud web app, with login by magic link or Google, and the session returns to the app on its own. In the extension, login is by Google (via `launchWebAuthFlow`) or by a **6-digit code** sent by email and typed into the extension itself, because the magic link would open in a regular tab, outside the flow (see `integrations.md`).

**Acceptance criteria**
- [ ] No record, edit or export screen asks for login
- [ ] Login by magic link and Google (desktop and web); by email code and Google (extension)
- [ ] After login in the browser, the desktop (deep link `kamo://auth`) and the extension receive the session without the user copying anything
- [ ] Session stored in the keychain (desktop) or `chrome.storage.local` (extension) and renewed automatically
- [ ] Signing out deletes the local session, but does not delete any project

**Edge cases**
- Expired magic link → clear message + "Send another link"
- User logs in with Google and later with a magic link for the same email → same account
- Deep link blocked by the browser (desktop) → the callback page shows an "Open Kamo" button
- Extension: login via `chrome.identity.launchWebAuthFlow`; if the window is closed before the end, returns to the signed-out state without error

---

## C-02 — Send to cloud
**Behavior:** on export, the "Send to cloud" checkbox uploads the finished MP4 and a thumbnail to Kamo Cloud storage, with a resumable multipart upload. When finished, the link goes to the clipboard.

**Acceptance criteria**
- [ ] Unchecked by default; nothing is uploaded unless the user checks it
- [ ] Direct upload to storage with signed URLs (the file does not pass through the Kamo server)
- [ ] Visible progress; pause and resume
- [ ] If the connection drops, resumes where it stopped when it returns, including after closing and reopening the app (state in `pendingUpload` in the project)
- [ ] When finished: link copied + Open, Add to playlist and Visibility buttons
- [ ] Re-uploading the same project in the same format asks: "Replace the video (keeps the link) or create a new one?"
- [ ] Thumbnail generated in the app from the middle frame of the video (or a chosen frame)
- [ ] The reference thumbnails (`frames/`) are also uploaded, already adjusted to the trim (F-16)
- [ ] From v0.5, if the project has a transcript, two checkboxes on upload: **"use the transcript in search and the MCP"** (checked by default) and **"show the transcript in the player"** (unchecked by default). Unchecking both = the transcript is not uploaded. The timestamps are adjusted to the trim (F-16). The server side (search, display) is in the `kamo-cloud` repository
- [ ] A 100MB video uploads on a 50Mbps connection in under 30s

**Edge cases**
- Plan limit reached → the local export finishes normally; the upload does not start and the plan popover appears (C-08)
- Session expired midway through the upload → renews and continues; if it cannot, asks for login and resumes
- User deletes the video on the web while the app still shows the link → the app updates the project's `cloud` on the next launch

---

## C-12 — Automatic upload (optional)
**Behavior:** for people who want "all recordings on any device" without clicking anything. Off by default; when on, each new recording is exported at 16:9 1080p and uploaded in the background as soon as the user closes the Editor. **Desktop only** (in the extension, background export after closing the editor is not reliable). Turning this option on counts as the user sending: it is the only exception to the manual upload rule.

**Acceptance criteria**
- [ ] Option in Settings → Kamo Cloud: "Automatically upload new recordings", off by default, with a clear explanation
- [ ] Automatically uploaded videos start as **private** (owner only); sharing remains an explicit action
- [ ] Transcript: follows its own option ("include transcript in automatic uploads", off by default); never shown in the player
- [ ] Respects the plan limits: when the limit is hit, stops uploading and warns once
- [ ] Only uploads on Wi-Fi or an unmetered network, when the system reports it (option "also upload on mobile network")
- [ ] Editing an already uploaded project again offers "Update in cloud" (replaces, keeps the link)

---

## A-01 — 4K and 60fps export
> Export side built and checked on 2026-11-04 (Windows): real exports of an 18s recording at 4K30 (3840×2160, `avc1.640033`, 30.00fps, 12.5s to export) and 1080p60 in 16:9 and 9:16 (`avc1.64002a`, 60.00fps, with their `.srt`).
- [x] 4K only appears if the original recording has enough resolution; otherwise, the option is disabled with an explanation — "enough" = a side 25% past 1080p (longest > 2400px or shortest > 1350px: ultrawide 2560×1080, 1440p, Retina, 4K); the hint says the recording's size
- [x] The H.264 level follows the size and rate (4.0 for 1080p30, 4.2 for 1080p60, 5.1 for 4K30, 5.2 for 4K60) and the encoder is asked first (`VideoEncoder.isConfigSupported`, hardware then software); when it refuses, the sheet says so before exporting and the file falls back to 4K30, then 1080p at the asked rate, then 1080p30, with a notice at the end and the real setting in the file name
- [x] 60fps requires recording at 60fps: the 60fps recording option appears on the Home — the export offers 60fps for any recording: camera, cursor and captions are computed for every 60fps frame, a 30fps recording's frames repeat (nothing interpolated) and the sheet explains it. Home has a "Record at 60 fps" switch next to Record (remembered as `recordingFps` in settings.json); the helpers record at that rate (Windows: WGC + Media Foundation at 60 constant-rate slots per second; Mac: ScreenCaptureKit `minimumFrameInterval` 1/60), with the bitrate ×1.5 at 60fps, and `project.source.fps` is 60; the sheet then starts at 60fps and every exported frame is a recorded one. Checked on 2026-11-05 (Windows): a 2.2s 3440×1440 recording through the app gave `source.fps: 60` and a 60.00fps MP4 (130 frames), exported as 1080p60 16:9 with 131 frames, 60.00fps, chosen by default with no repeat notice _(Mac compiled in CI only; the extension still records tabs at 30fps)_

## A-02 — Vertical 9:16 crop and GIF
- [x] 9:16 with framing that follows the virtual camera and the cursor (the important content never leaves the frame)
- [x] GIF at up to 15fps and up to 1280px wide, with an estimated file size warning before exporting — 10 or 15fps, 1280×720 / 720×720 / 720×1280 (`Demo 16x9 720p15.gif`), looping, no sound; same scene and renderer as the MP4 (webcam, background, captions burned in, with every color the caption style paints kept in each palette); palette quantization + LZW with `gifenc` in a worker, only changed pixels per frame; estimated size under the options, in warning color over 10 MB. Checked with real exports of an 18s recording in the three formats (decoded by Chromium: 275 frames, 18.33s, captions legible); the estimate came within about ±40% per file (it is an order of magnitude: screen content varies)

## A-03 — Webcam bubble
> Built on 2026-11-04, ahead of the step order; not yet tried by the user in a full real flow on a Mac. Beyond the criteria: square, 16:9 and 9:16 shapes and free drag in the preview.
- [x] Records the webcam along, in a separate file (`webcam.mp4`)
- [x] Round bubble, with 4 corner positions and 3 sizes
- [x] Shrinks automatically when the camera zooms and returns to normal size afterward
- [x] The bubble can be hidden in specific stretches via the timeline

## A-04 — Wallpaper with your own image
- [x] Accepts PNG, JPG and WebP (checked by the file's bytes, up to 25 MB; anything else shows a message in the panel). Desktop; the extension does not offer it yet
- [x] Image copied to the project folder (the project keeps working if the original is deleted): `background-<hash>.<ext>`, see data-model.md
- [x] Automatic crop to cover the frame in any format (16:9, 1:1, 9:16), the same in the preview, the format previews and the export

## A-08 — Record a window or a selection of the screen
- [x] On the Home, besides "Full screen": **Window** (list of open windows, with thumbnail) and **Select** (a frame over the screen) — Screen · Window · Select switch with icons, window list with thumbnails and search; Select opens a movable, resizable selection frame on the chosen display (see-through and click-through middle, W × H fields in pixels, size presets, Record on its toolbar; × or Esc closes it keeping the selection); the choice is remembered and the Record button names it _(Mac untested)_
- [x] Window: ScreenCaptureKit on Mac, Windows Graphics Capture on Windows; if the window changes size or position, the recording follows — verified on Windows (moved and resized mid-recording: the video keeps its size, the window is scaled in centered; closing it stops and saves with a notice); Mac code builds in CI, untested
- [x] Select: display crop of exactly the frame's inside, with a minimum size of 320×240 and even sides; while recording, the frame's line stays around the area, left out of the video (content protection; on Mac the helper also leaves out Kamo's windows) — verified on Windows (a 640×360 selection gave a 640×360 video with no line in it) _(Mac untested)_
- [x] Clicks outside the window or region do not generate a zoom — no `down` is sent outside (nor over a window covering the recorded one, on Windows); moves there are `outside` _(Mac untested; on Mac a window in front is not detected yet)_
- [x] Event coordinates stay in recorded-video pixels (`core` does not need to know whether it was screen, window or region) _(Mac untested)_

---

## A-05 — Local transcription (optional package)
**Behavior:** transcription is **not in the installer**. It is an optional package (whisper.cpp binary + model) that the user downloads only if they want it. Once installed, the app transcribes recordings with audio in the background and saves to `transcript.json`. It is the basis of captions (A-06) and of the text part of the MCP (M-01, M-02).

**Acceptance criteria**
- [x] The app never downloads the package on its own nor opens a popup asking to download it after recording — the list of packs is fetched only when Settings → Optional packs comes into view or Transcribe is clicked (checked in the Electron build: no request before a click)
- [ ] Discreet entry points: "Transcribe" button in the Editor, Settings → Optional packs, and the "Connect to an agent" panel — Settings → Optional packs, a Transcribe button on Home's project cards and in the editor's Captions section done; the agent panel comes with step 26
- [x] Before downloading, shows the size and the quality choice: **Light** (~150MB, faster) or **Accurate** (~500MB, better in Portuguese) — exact sizes once the list loaded, "About …" before
- [x] Download with progress, pause/cancel and integrity check (SHA-256) — resumes with HTTP Range, also after a restart
- [x] Once installed, asks once: "Automatically transcribe the next recordings?" (yes → in the background; no → only when Transcribe is clicked)
- [ ] Runs in the background, without freezing the editor or the export — whisper is a below-normal-priority child process with half the cores, the audio is decoded in a hidden window; not yet measured with the real whisper.cpp during an export
- [ ] 10 minutes of audio transcribed in under 5 minutes on an average machine with the Light model (M1 / i5 with 8GB)
- [ ] Transcribes any language Whisper supports, with automatic detection; quality validated in the launch languages (the Light model is weaker in Chinese and Japanese, so the download screen recommends Accurate for those languages)
- [x] Segments with start, end and text, aligned to the video time — the audio offset is applied before whisper; words with their own timing when whisper gives them
- [x] Uninstalling the package frees the space and keeps the transcripts already made (Remove waits while a transcription uses it)
- [ ] Desktop first; in the extension, only after validating Whisper's performance in the browser (also as an optional download)

**Edge cases**
- No internet at download time → "Try again" button, without freezing anything
- Disk out of space → warns the required size before starting
- Recording without audio → no transcript; the MCP still uses clicks and reference frames
- App closed midway through transcription → restarts on the next launch
- Audio with long silent stretches → does not generate empty segments

## A-07 — Optional package manager
**Behavior:** Settings → Optional packs lists what can be downloaded separately, keeping the base app light.

| Package | Approx. size | What for |
|---|---|---|
| Transcription — Light | ~150MB | transcription, captions and text search in the MCP |
| Transcription — Accurate | ~500MB | same, with higher accuracy |
| Video compatibility (FFmpeg) | ~70MB | fallback export on machines where WebCodecs fails |

**Acceptance criteria**
- [x] Each package shows size, what it unlocks, status (not installed · downloading · installed · update available) and Install / Remove buttons — the transcription packs; FFmpeg is not listed until it exists
- [x] Packages live in `app-data/packs/`, outside the app folder; updating the app does not delete the packages
- [x] Packages update separately from the app, only with user confirmation
- [ ] FFmpeg is only offered when the export fails for lack of an encoder ("Download the compatibility package and try again?")
- [ ] Downloads come from versioned GitHub Releases assets, with SHA-256 verified — verified against a local fake release; `.github/workflows/packs.yml` builds the real assets but has not run yet

## A-06 — Automatic captions
- [x] Generated from `transcript.json` (A-05), without transcribing again — the same core code draws them in the preview, the format previews and the export (rule 11); a transcription started from the editor turns them on when it finishes
- [x] Without the transcription package installed, the Captions button explains that the package is needed and offers to download it (with the size) — the side panel says the pack's size and opens the same download offer as Home (checked in the Electron build; the real `packs` release is not published yet)
- [ ] Captions editable on the timeline (text and timing); the edit also corrects the transcript — a captions lane with one block per segment: double-click or Enter edits the text inline, Delete removes it, dragging moves it or its edges; every edit is undoable with the rest of the editor and saved to `transcript.json` with `edited: true`. Text fixes, undo and redo checked in the Electron build; the timing drags are covered by core tests but not yet tried by hand
- [x] Style: 3 presets (position at the bottom or middle), in the app font — a gallery of 12 styles (Clean, Bold, Kamo, Minimal, Soft, Neon, Typewriter, Caps, Cinema, Marker, Classic, Duo), each thumbnail painted by the core renderer over the video at the playhead with the start of the caption there (a sample sentence without speech), a radio group with arrow keys, Home and End; Clean, Bold and Kamo look exactly as before; bottom or middle, 3 sizes; only the bundled fonts (Inter, Instrument Serif, JetBrains Mono) with the system CJK fonts of the transcript's language; switching styles never changes the line breaks, except to and from Bold, which keeps its own as before (a wider style shrinks the font); inside the screen frame in every format, above the camera card in the 9:16 split; spring fade in and out; a webcam bubble dragged under them (e.g. bottom middle) pushes them clear (above it, or below when shorter), following its size on zoom and its fade
- [x] On export, three options: no captions, captions burned into the video, or an `.srt` file next to the MP4 (timings adjusted to the F-16 trim) — checked with real exports (9:16 burned in, 16:9 with its `.srt`)

---

## M-01 — Local MCP
**Behavior:** an open source MCP server (`npx @kamo/mcp`) that reads the desktop recordings folder and lets the user's agent (Claude Code, for example) talk to what was recorded. Read-only, over stdio, with no network access.

**Tools**
| Tool | What it does |
|---|---|
| `list_recordings` | lists the recordings (name, date, duration, whether it has a transcript, cloud links), with a period filter |
| `search_recordings` | searches text in the transcripts and names; returns recording + excerpt + timestamp |
| `get_recording` | full metadata of a recording: duration, resolution, zooms, style, exports |
| `get_transcript` | full transcript or of a range, with timings |
| `get_click_timeline` | timeline of clicks and zooms (timestamp + position on screen) |
| `get_frame` | reference frame closest to the requested timestamp (saved every 5s by the app), so the agent can "see" the screen |
| `list_playlists` | the local playlists made on Home (name, dates, recording ids in order) |
| `get_playlist` | one playlist (by id or name) with its recordings in playlist order; deleted ones counted as missing |

**Acceptance criteria**
- [ ] Installs and runs with one command, without configuring anything: finds the projects folder by reading the app's `settings.json` (local file, no network), falls back to `~/Kamo` if not found, or receives the path as an argument — folder discovery done (`--dir`, then `settings.json`, then `~/Kamo/projects`, I-1); `@kamo/mcp` is not on npm yet
- [x] The command shown in the app panel already includes the current folder path as an argument
- [x] In the app, Settings → "Connect to an agent" shows the ready-to-copy command, already with the current folder (`claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"`), and instructions for other MCP clients — with Copy buttons, the `mcpServers` JSON, what the agent can read (read-only, local, no network), Node 20+ and a link to the README; on Windows both go through `cmd /c npx`. Unpackaged builds also show a "Using a development build?" command that runs `apps/mcp/dist/cli.js` with Node. Checked in the Electron build; the npx command works once `@kamo/mcp` is on npm
- [x] No tool modifies, deletes or creates files
- [x] No network calls (verifiable in the code and the tests)
- [x] `search_recordings` responds in under 1s with 500 recordings
- [x] `get_frame` returns the image in under 500ms, reading `frames/` (no video decoder, no FFmpeg)
- [x] The `@kamo/mcp` npm package is under 5MB, with no native binaries
- [x] Paginated responses, so as not to blow up the agent's context
- [ ] Works with the MCP Inspector and with Claude Code — stdio tested end to end; not yet tried with the Inspector or Claude Code

**Edge cases**
- Empty or nonexistent folder → clear response ("no recordings found in ~/Kamo")
- Recording without a transcript → `get_transcript` warns and explains that the transcription package can be installed in the app (optional)
- Corrupted project → skipped in the list and shown in a notice, without bringing the server down
- Recordings made in the extension → do not appear (they stay inside the browser); the documentation points to the cloud MCP

---
