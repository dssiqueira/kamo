# flows.md

> Screens, flows, hierarchy and states. Text, not wireframes. Visuals (colors, typography, components) are in `DESIGN.md`.

## Screen map
```
First use → Permissions onboarding → Home
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
- **Hierarchy:** one permission per screen → why it is needed → status → "Open Settings" button
- **Mac:** Screen Recording, Microphone and, if still required for the mouse tap, Input Monitoring (camera only when the webcam is turned on, in v0.4)
- **Windows:** Microphone only
- **Required text on Mac (if Input Monitoring is required):** macOS says "keys", but the app only reads the mouse and never sees what you type
- **States:** pending · granted (green check) · denied (instructions to fix it)
- The microphone can be skipped; screen recording cannot

### 2. Home
- **Hierarchy:** displays (live thumbnail) → toggles → Record button → recent projects
- **What to record:** full screen (v0.1); window or region (v0.4)
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
4. Records. The extension icon becomes a small coral dot with the time in the badge. **Nothing is injected into the page** (it would show up in the video); the control stays in the popup
5. Clicks **Stop** (in the popup, on the icon or with the ⌘⇧2 / Ctrl+Shift+2 shortcut)
6. The **Editor** opens in a new extension tab, already with zooms, background and cursor
7. Exports → the file goes to the downloads folder

**Done when:** from clicking the icon to the downloaded file, without reading anything and without touching any setting.

### Popup (360px wide)
- **Hierarchy:** small mascot + name of the tab to be recorded → Record button → microphone toggle → latest 3 projects → "All projects" link
- **States:**
  - normal tab: ready to record
  - tab that cannot be recorded (`chrome://`, Chrome Web Store): button disabled + "Chrome doesn't let you record this page"
  - recording: the popup becomes the control (timecode, pause, stop)

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
