# flows.md

> Screens, flows, hierarchy and states. Text, not wireframes. Visuals (colors, typography, components) are in `DESIGN.md`.

## Screen map
```
First use → Language → Welcome tour (3 slides) → Permissions onboarding → Home
Home → Countdown → Recording → Editor → Export (Formats) → file saved
Home → Recent project → Editor
Export → (optional) Send to cloud → Sign in (if needed) → link copied
Any screen → Settings

Web (Kamo Cloud): Library → Video / Playlist → Share
Link recipient: Player (or Playlist) → "Made with Kamo" → Landing
```

## Main flow: record → export
1. The user opens the app and lands on **Home** (no login, no long splash)
2. Picks the display and clicks **Record**
3. Full-screen **Countdown** 3-2-1
4. The floating **Recording** bar appears; the user uses the computer normally
5. Clicks **Stop** (or the global shortcut)
6. Opens the **Editor** with background, padding, corners, shadow and zooms already applied
7. (Optional) Adjusts zooms on the timeline
8. Clicks **Export** → **Formats** → checks formats → exports
9. Shows "2 files saved · Show in folder"

**Done when:** you can go from step 1 to step 9 without reading anything and without touching any setting.

## Screens

### 1. Permissions onboarding (first use only)
- **Language first:** Kamo (happy head) says hi in the app languages ("Hi Oi Hola 你好 こんにちは Hallo Bonjour 안녕하세요", each in its own font stack, the one on screen highlighted) and asks which language to speak. The languages are large rows, each with its name in its own language and `lang` (English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français, 한국어), never translated
  - The OS language is preselected when Kamo speaks it (else English) and says "Same as your system". Picking a row switches the whole window at once (the screen's own texts and `<html lang>`), so the tour already speaks it
  - Accessible radio group: arrows (and Home / End) move the choice, Enter or Continue goes on to the tour. Continue saves it as Settings' language: `system` when the system's language was kept, otherwise the locale; main then rebuilds its tray and app menus in that language
  - First run only (until `onboardingDone`): not when the onboarding opens again for a missing permission, nor on "Show the welcome tour". The extension follows Chrome's language and has no such screen
- **Welcome tour first:** three slides where Kamo explains the app from a paper speech bubble (Kamo on one side, the bubble with a short title, one or two lines and a small CSS-drawn vignette on the other): 1. **Hit Record** (screen, window or selection; mic, computer sound and camera optional; Kamo standing, looking at you) · 2. **Click as usual** (every click becomes a zoom, the cursor comes out smooth, the bar pauses and stops; Kamo with its tongue out, catching the click) · 3. **Tweak it, export it** (zooms on the timeline, captions, background, 16:9 / 1:1 / 9:16, MP4 or GIF, all local and free; Kamo winking)
  - Navigation: dots (click to jump), Back, Next (the last one says "Let's set up" and goes on to the permissions), "Skip the tour" (straight to the permissions). Keys inside Kamo's window only: → and Enter next, ← back, Esc skip. Slides enter from the side they came from on the Kamo spring; reduced motion shows them still
  - It stands in for the welcome screen on first run and shows until the onboarding is finished once (`onboardingDone`); opened again from Home's missing-permission notice, the onboarding starts at the welcome screen without the tour
  - Settings → Help → "Show the welcome tour" replays it alone in the main window (never during a recording or an export) and goes back to Home at the end
- **Hierarchy:** one permission per screen → why it is needed → status → "Open Settings" button
- **Mac:** Screen Recording, Microphone and, if still required for the mouse tap, Input Monitoring (camera only when the webcam is turned on, in v0.4)
- **Windows:** Microphone only
- **Required text on Mac (if Input Monitoring is required):** macOS says "keys", but the app only reads the mouse and never sees what you type
- **States:** pending · granted (green check) · denied (instructions to fix it)
- The microphone can be skipped; screen recording cannot

### 2. Home
- **Hierarchy:** displays (live thumbnail) → toggles → Record button → recent projects
- **What to record:** full screen (v0.1); window or a selection of the screen (v0.4, A-08): a Screen · Window · Select switch, each with its icon. Window: open windows with thumbnails and a search box. Select: pick the display, then "Select an area" (later "Adjust selection", next to the selection's size and display) hides Home and opens the **selection frame** on that display, at the last selection or 1280 × 720 in the middle:
  - a thin water-colored (tertiary) line around a see-through middle, with small cream squares on the corners; clicks in the middle go to the apps below
  - drag the edges or corners to resize (at least 320 × 240, even sizes, never past the display), drag the toolbar to move
  - a slim cream toolbar hangs under the frame (above it when the frame reaches the bottom of the display, inside it when it fills the height): grip · W × H fields in pixels of the recording (Enter or leaving the field applies; ↑/↓ step by 2) · sizes menu (16:9 1280 × 720, 16:9 1920 × 1080, 1:1 1080 × 1080, 9:16 1080 × 1920, scaled down to fit) · Record (coral REC dot, the stop shortcut in small type) · ×
  - Record starts the usual countdown on that selection; × or Esc (Esc only while the frame has focus; it first leaves a field being edited or the menu) closes it and brings Home back with the selection kept
  - while recording, the line alone stays around the recorded area (never in the video, clicks go through it) and goes away on stop
- The choice is remembered and the Record button says what it records ("Record · Notes", "Record · Selection 1280 × 720")
- **Toggles:** microphone, computer sound, webcam (v0.4), show cursor
- **States:**
  - empty (no projects): only the recording block, with an encouraging line
  - with projects: list of the latest ones, with thumbnail, name, duration and date
  - missing permission: warning at the top with a link to the onboarding

### 3. Countdown
- Large 3-2-1 in the center of the chosen display
- Esc cancels and returns to Home

### 4. Recording
- Minimal, draggable floating bar: pulsing REC indicator, timecode `hh:mm:ss:ff`, pause, stop
- Global shortcut to stop (default: ⌘⇧2 / Ctrl+Shift+2)
- The bar does not appear in the recorded video
- **States:** recording · paused (timecode stops, REC stays static)

### 5. Editor
- **Hierarchy:** preview (largest area on screen) → timeline at the bottom → side panel → Export in the top right corner
- **Preview:** video with style applied, play/pause, timecode, and the format switch (16:9 · 1:1 · 9:16, A-02): the preview shows that format and the export comes with it checked
- **Timeline:** video track (with handles at the ends to trim the start and end) · audio tracks (microphone and computer, with volume and mute) · zoom track (blocks with the scale, e.g. "2.0×") · captions track (v0.4)
- **Zoom block:** dragging moves it; pulling the edge stretches it; clicking opens the scale control (1.0×–4.0×); Delete removes it
- **Side panel:** Background · Padding · Corners · Shadow · Cursor · Webcam (v0.4) · Captions (v0.4)
- **Webcam layout:** Bubble or Split. Split (9:16 only; picking it switches the preview to 9:16) stacks the screen and the camera as two cards; drag the line between them in the preview to resize (one undo step), "Camera on top" swaps them. While split shows, the bubble controls hide; in 16:9 and 1:1 the camera stays a bubble
- **Actions:** "auto-zoom" toggle and "Regenerate zooms" button (keeps the ones the user edited)
- **Transcribe** (discreet, in the side panel): without the pack, opens a popover "Transcription is an optional ~150MB pack that runs on your computer" with Download / Not now; with the pack, transcribes right away. Never appears as a popup on its own after recording
- **States:** loading (processing events) · ready · no clicks (notice: "no clicks, nothing to zoom")

### 6. Export (Formats)
- 16:9, 1:1 and 9:16 side by side, synced on the same timeline
- One checkbox per format (9:16 from v0.4)
- Resolution, fps and format (4K, 60fps and GIF from v0.4). All free, no option locked
- **"Send to cloud"** checkbox with the Cloud badge (unchecked by default)
- **States:** configuring · exporting (progress per file) · uploading (upload progress) · done ("Show in folder" + "Copy link" if uploaded) · error (message + try again)

### 7. Settings
- Kamo Cloud account: sign in/out, email, plan, space used, "Automatically upload new recordings" (off by default; uploaded as private) and a "Manage subscription" link (opens the web)
- Projects folder
- **Window:** "Keep Kamo in the tray when the window is closed" (on by default on Windows, off on Mac; D-026). The first time the window goes to the tray on Windows, a one-time balloon says Kamo is still running
- OS permission status
- Shortcuts
- **Help:** "Copy diagnostics" (shows the text before copying) and "Open GitHub issue"
- **Packs:** list of optional packs (transcription Light/Accurate, video compatibility) with size, status and Install/Remove
- Transcription (only appears with the pack installed): automatic on/off, language (automatic, Portuguese, English)
- **Connect to an agent (MCP):** explains in one sentence ("Let Claude Code talk to your recordings"), shows the ready-made command with a Copy button, a link to the instructions for other MCP clients and, if the person subscribes to Cloud, the cloud MCP option

## Chrome extension
> Same editor and same export as the desktop (they come from `packages/ui`). Only what changes is described here.

### Main flow
1. The user is on the tab they want to record and clicks the Kamo icon in the Chrome toolbar
2. The **popup** opens: Record button, microphone toggle and the latest projects
3. Clicks **Record** → 3-2-1 countdown overlaid on the tab itself
4. Records. The **recording bar** opens in its own small window at the bottom center of the browser window (see below), the extension icon becomes a small coral dot with the time in the badge, and its tooltip says "Recording. Click to stop". **Nothing is injected into the page** (it would show up in the video)
5. Stops: **Stop** on the recording bar, one click on the icon (also while paused) or the ⌘⇧2 / Ctrl+Shift+2 shortcut; all three run the same stop and save
6. The **Editor** opens in a new extension tab, already with zooms, background and cursor
7. Exports → the file goes to the downloads folder

**Done when:** from clicking the icon to the downloaded file, without reading anything and without touching any setting.

### Popup (360px wide)
- **Hierarchy:** small mascot + name of the tab to be recorded → Record button → microphone toggle → latest 3 projects → "All projects" link
- **States:**
  - normal tab: ready to record
  - tab that cannot be recorded (`chrome://`, Chrome Web Store): button disabled + "Chrome doesn't let you record this page"
  - recording or paused: a click on the icon stops instead of opening the popup; the popup (timecode, pause, stop) stays open if it was open when the recording started

### Recording bar (extension)
- The desktop floating bar (same component, `RecordingBar` from `packages/ui`) in a small Chrome popup window: pulsing REC dot, hh:mm:ss:ff timecode, Pause / Resume, Stop. No grip: the window moves by its title bar
- Opens when the recording actually starts (after the countdown), unfocused, so the recorded tab keeps the focus; closes on stop, save, cancel or failure
- It is a separate window, not part of the recorded tab, so it **never shows in the video** (tab capture records only the tab) and nothing is drawn in the page
- **States:** recording (Pause, Stop) · paused ("Paused", dimmed timecode, Resume, Stop)
- **Closed by the user:** the recording keeps going and the bar does not come back for that recording; the icon and the shortcut still stop it (paused, it stays paused until stopped)
- **Service worker restarted mid-recording:** the open bar is adopted (its window id lives with the rest of the state in `chrome.storage.session`), never a second one

### First use of the extension
- Welcome screen opened in a tab on install: Kamo waving, a sentence about what the extension does and the "Pin to toolbar" button with a visual instruction
- Explains in one line: "Records browser tabs. To record the whole screen or other apps, get the desktop app" + link
- Optional "Use microphone" button: asks for the permission here, on a visible page (the background recorder cannot ask)
- On the first recording, an optional request for the site permission, explaining: "to keep capturing clicks when the page changes sites"

### Projects in the extension
- "All projects" page (an extension tab) with the same list as the desktop Home
- Discreet notice: "Your projects stay in this browser. Clearing the extension data deletes the projects."

## Kamo Cloud
> The cloud is optional. No record, edit or export flow goes through it.

### Send to cloud (desktop and extension)
1. On export, the user checks **"Send to cloud"** (or clicks "Send to cloud" on an already exported project)
2. If not logged in: short popover "Save and share your videos" → **Sign in** opens the browser → login by magic link or Google (in the extension: 6-digit code by email or Google) → returns to the app on its own
3. Exports and uploads, with upload progress
4. Done: **"Link copied!"** + Open, Add to a playlist and Visibility buttons
5. **States:** uploading · paused (no internet, resumes on its own) · done · plan limit reached (popover with what the Cloud plan unlocks and the Subscribe button; never a blocking modal) · error

**Done when:** from the end of the export to the link on the clipboard, in one click (if already logged in).


The cloud web screens (library, player, playlists, sharing, connect agent, subscribe) live in the private `kamo-cloud` repository (`docs/flows.md`). The institutional site and the landing pages live in `kamo-site`.
