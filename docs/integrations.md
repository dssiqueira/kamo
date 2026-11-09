# integrations.md

## Authentication
- **The app works without an account.** Login only appears when the user chooses to use Kamo Cloud.
- **Supabase Auth**, with email magic link and Google.
- **Desktop:** the "Sign in" button opens the browser on the Kamo Cloud web app; after login, the session returns to the app via deep link (`kamo://auth`). The app never sees the password.
- **Extension:** Google via `chrome.identity.launchWebAuthFlow` (`identity` permission, redirect `https://<extension-id>.chromiumapp.org/`); email via a **6-digit code** (Supabase OTP) typed in the extension itself. The magic link doesn't work here: it would open in a regular tab, outside the flow, and the session wouldn't return to the extension.
- **Where the session is stored:** system keychain on desktop and `chrome.storage.local` in the extension.

## Kamo Cloud API (contract used by the app)
The server lives in the private repository `kamo-cloud`; the app and the extension only talk to it through this contract, implemented in `packages/cloud-client` (public, typed):
- `auth`: sign in, sign out, refresh session (Supabase Auth; deep link on desktop, `launchWebAuthFlow` and email code in the extension)
- `uploads.create(projectMeta, files: { video, thumbnail, frames[] }) → { videoId, shortId, uploadId, partUrls[], thumbnailUrl, frameUrls[] }` and `uploads.complete(...)`; checks plan limits before returning the URLs
- `videos.get / replace / setVisibility` (what the app needs to show the link and "replace video")
- `transcripts.put(videoId, transcript, { searchable, showInPlayer }) / transcripts.delete(videoId)` (v0.5)
- `playlists.list / addVideo(playlistId, videoId)` (the "Add to a playlist" button after upload)
- `account.get` (plan, space used, language), for Settings
- Errors with stable codes (`plan_limit`, `unauthorized`, `not_found`, `rate_limited`), translated in the interface by `packages/i18n`
Any change to the contract is versioned (`/v1`, `/v2`) and agreed between the two repositories.

## Operating system APIs
| Resource | macOS | Windows |
|---|---|---|
| Screen capture | ScreenCaptureKit (≥ 13.3) | Windows Graphics Capture / desktopCapturer |
| Mouse events | CGEventTap with a **mouse-only** mask, listen-only (check in step 3 whether macOS still requires Input Monitoring; if not, it is removed from onboarding) | `SetWindowsHookEx(WH_MOUSE_LL)`, mouse only |
| Microphone | AVFoundation | MediaDevices |
| System audio | ScreenCaptureKit (system audio, macOS 13+; the app itself can be excluded) | WASAPI loopback (via `desktopCapturer` with audio; records the whole system, which is why Kamo stays silent during recording) |
| Webcam | AVFoundation | MediaDevices |
| Keychain | Keychain Services | Credential Manager |
| Login deep link | `kamo://` registered in the app | `kamo://` registered in the app |

## External libraries
- **i18next + ICU MessageFormat** — text and plurals in all languages, in a single package (`packages/i18n`, published as `@kamo/i18n`) shared by desktop, extension and the Kamo Cloud web app; the site (`kamo-site`) has its own marketing text
- **WebCodecs + MP4 muxer** (e.g. mediabunny) — MP4 encoding and assembly, inside `core`, the same on desktop and extension (see D-011)
- **FFmpeg** — desktop only, as plan B if the WebCodecs encoder fails; **not in the installer**, it is the optional "Video compatibility" pack (D-040): an LGPL build (no `--enable-gpl`, no libx264) run as a separate program, encoding with the OS's H.264 encoder (`h264_mf` on Windows, `h264_videotoolbox` on Mac) or FFmpeg's own MPEG-4 Part 2, and its AAC. Offered only when an export fails for lack of an encoder ("Download the compatibility package and try again?"), downloaded only on that click (or from Settings → Optional packs)
- **whisper.cpp** — local transcription (v0.4); binary + model come in the optional transcription pack, never in the installer
- **@modelcontextprotocol/sdk** — local and cloud MCP servers
- **@supabase/supabase-js** — only inside `packages/cloud-client`, for login and cloud calls
- **Multipart upload:** in the app, `fetch` directly to the signed URLs that Kamo Cloud returns
- **electron-builder** — packaging
- **electron-updater** — auto-update via GitHub Releases
- **Our own native module `@kamo/mouse-hook`** — mouse events only. **Do not use `uiohook-napi`**: it installs a keyboard hook along with it, which violates D-003

## Optional packs
- Published by `.github/workflows/packs.yml` (manual) as assets of the rolling **`packs`** release of this repository (a prerelease, so electron-updater never takes it for an app version): `packs-manifest.json` plus plain files with versioned names, `kamo-pack-whisper-<version>-<platform>-<file>` (whisper.cpp's `whisper-cli` and its libraries, built from source: Windows x64 CPU with every CPU variant loaded at run time, Mac arm64 with Metal, ad-hoc signed), `kamo-pack-model-<version>-ggml-<base|small>.bin` (multilingual ggml models from Hugging Face, checked against whisper.cpp's SHA-1 list) and, when the run gets an FFmpeg commit, `kamo-pack-ffmpeg-<version>-<platform>-<file>` (a minimal static LGPL FFmpeg built from source with only the parts Kamo runs, Windows x64 with MinGW-w64 and Media Foundation, Mac arm64 with VideoToolbox, ad-hoc signed, plus `COPYING.LGPLv2.1` and a `NOTICE.txt` with the source commit and the configure line; the jobs fail on a GPL, nonfree or non-system-library build). No archives: each file is downloaded, resumed and verified on its own, so the app needs no unzip code
- `packs-manifest.json` (`schema: 1`): per pack `id`, `version`, `kind` (`transcription` with a `model { name, path }`, or `compatibility` with none) and, per platform (`win32-x64`, `darwin-arm64`), the `entry` program and every file's `path` in the pack folder, `url` (same origin as the manifest), `size` and `sha256`. Both transcription packs list the same binaries; only the model differs. The `video-compatibility` pack is listed only when that run built FFmpeg; an older app skips a pack kind it does not know
- The URL lives in one module (`apps/desktop/src/main/packs/config.ts`); `KAMO_PACKS_MANIFEST_URL` overrides it in development runs only, never in a release (https, or a local http server in an unpackaged build: `node scripts/fake-pack-server.ts` serves fake packs whose "whisper" and "ffmpeg" are Node scripts). Before every transcription or compatibility export the installed program and its libraries are hashed again against `packs.json` (the model only when its size or mtime changed), and pack versions must be plain folder names
- The app downloads directly from GitHub with Electron's `net` in main (HTTP Range to resume after a pause, a lost connection or a restart), checks size and SHA-256, and moves the complete folder into `app-data/packs/<id>/<version>/`. An update is downloaded only after the user confirms, and replaces the old version once it is complete
- Whisper runs as a child process at below-normal priority, with half the cores (max 8), the app-data folder as its working directory and paths relative to it (whisper.cpp opens files with narrow-char APIs on Windows, so a user folder with accents would break absolute paths). Its audio is a 16kHz mono WAV decoded by a hidden renderer with WebCodecs (mediabunny), never FFmpeg
- The compatibility pack's FFmpeg (D-040) runs in main as a child process: the renderer paints every frame with core's renderer (rule 11) and mixes the sound, sends the sound first (16-bit stereo, written to `app-data/export-compat/`) and then raw RGBA frames over IPC; FFmpeg reads the frames on stdin, encodes with the first LGPL encoder that takes the size and rate on a one-frame probe (`h264_mf` / `h264_videotoolbox`, else `mpeg4`), AAC for the sound, BT.709 limited range, and writes the export's `.partial` file (same naming, cancel and cleanup as every export) with `-movflags +faststart`
- No pack downloads on its own: always from a user click. The list is fetched only when Settings → Optional packs comes into view, the user clicks Transcribe, or the user clicks "Download and try again" after an export failed for lack of an encoder
- If GitHub ever imposes limits, plan B is to serve the packs from Kamo Cloud storage

## Distribution
- GitHub Releases: `.dmg` (arm64) and `.exe` (x64), with a budget of **≤ 130MB** (Electron alone already takes up a good part; no model or FFmpeg inside)
- Extension: **≤ 5MB** (estimate: 1–3MB). Uses the same `core` and the same `ui` as the desktop; what weighs on the desktop is Electron and the native modules, and the extension has neither
- **Bundles per entry point in the extension:** popup (≤ 150KB, no `core` or editor), recording offscreen (capture, events and thumbnails only), editor (`core` + `ui`, loaded only when the editor tab opens) and service worker (minimal). Language strings loaded on demand, only the language in use
- **Mac:** signed with a Developer ID Application certificate + notarization from v0.1 (uses the Apple Developer account that already exists; the certificate is created by the Account Holder)
- **Windows:** unsigned in v0.1. The README and the site explain the SmartScreen "More info → Run anyway". Certificate only if the app gains traction.
- **Mac App Store:** out (see D-009)

## Chrome extension
| Resource | API |
|---|---|
| Record the tab | `chrome.tabCapture.getMediaStreamId` + `getUserMedia` in an offscreen document (the MV3 service worker doesn't record media) |
| Record the video | `MediaRecorder` → `screen.webm` (VP9/VP8 video + Opus audio from the tab and the microphone, mixed by `AudioContext` with one track each) in chunks to OPFS; doesn't hold the whole video in memory |
| Microphone | the permission is requested **beforehand**, on a visible extension page (welcome or on the first click of the microphone toggle), because the offscreen document can't show the prompt; afterwards, the offscreen document uses `getUserMedia` normally |
| Tab audio | comes along in the `tabCapture` stream; the offscreen document must play that audio back (`AudioContext`), otherwise the tab goes silent for the user during recording |
| Clicks | content script injected only into the recorded tab, listening only to mouse events |
| Editor | extension page (`editor.html`) opened in a new tab |
| Projects | OPFS (`navigator.storage.getDirectory()`) |
| Settings and cloud session | `chrome.storage.local` |
| Export download | `chrome.downloads` |

**Manifest permissions:** `tabCapture`, `offscreen`, `storage`, `downloads`, `scripting`, `activeTab`, `alarms` (the toolbar Kamo's idle glance, about once a minute), and from step 17 `identity` plus the cloud API and R2 domains in `host_permissions` (for upload only); until then the manifest has neither (`apps/extension/scripts/manifest.ts`, justified in `docs/store/permissions.md`). `<all_urls>` only as **`optional_host_permissions`**, requested on the first recording with the explanation "to keep capturing clicks when the page changes site". If the user denies it, click capture works until the tab navigates to another domain (`activeTab` loses access at that point), and the video keeps recording normally. This eases Chrome Web Store review and reinforces privacy.

**Known limits:**
- Doesn't record internal pages (`chrome://`, the Chrome Web Store itself), nor capture clicks on them
- Clicks inside cross-origin iframes may not be captured in the MVP
- If the user switches tabs during recording, the recording continues on the original tab
- Any element injected into the page shows up in the video (`tabCapture` records what the tab renders). That's why the extension doesn't inject a bar or buttons during recording; the controls live in the popup, the icon and the shortcut

**Publishing:**
- Chrome Web Store (one-time US$ 5 fee for the developer account)
- Store privacy form: declare that nothing leaves the browser unless the user sends it to the cloud, and that uploaded videos stay in their account
- Review can take from days to weeks, so submit with plenty of margin
- Later: Edge Add-ons, same package

## MCP
### Local — `apps/mcp` (free, open source)
- npm package `@kamo/mcp`, **stdio** transport, runs on the user's machine
- Finds the projects folder in this order: `--dir` argument, the app's `settings.json` (local file), `~/Kamo/projects`; read-only
- **No network access**: no dependency that makes external calls
- Frames come from the reference thumbnails in `frames/` (saved by the app): the package stays small, with no decoder, no FFmpeg and no native binary
- Command for Claude Code (the app shows it pre-filled, pinned to the app's version): `claude mcp add kamo -- npx -y @kamo/mcp@<version> --dir "<projects folder>"`. Only a release that also published that version to npm shows it (D-038); other builds say the package is not published yet
- Recording names, window titles and transcripts are untrusted data captured from the screen and microphone: the server says so in its instructions and tool descriptions, caps every file it reads and never follows a link outside the projects folder
- Tested with the MCP Inspector on every release

### Cloud
The cloud MCP server lives in the private repository `kamo-cloud`. On the user's side, the command is `claude mcp add --transport http kamo https://mcp.<domain>/mcp`.

## Languages
- **Desktop:** system language (`app.getLocale()`), with manual override
- **Extension:** browser language; store name and description via `_locales/<language>/messages.json`
- **Site and LPs:** in the `kamo-site` repository (per-language routes and `hreflang`)
- **Kamo Cloud web app:** in the `kamo-cloud` repository (profile or browser language)
- **Cloud emails** (magic link, code, billing): in the language saved in the profile
- **MCP:** tool names and descriptions in English (it's what agents understand best); returned content (transcripts, titles) stays in the original language

## Environment variables
```
# build / CI
APPLE_ID=
APPLE_APP_SPECIFIC_PASSWORD=
APPLE_TEAM_ID=
CSC_LINK=
CSC_KEY_PASSWORD=
WIN_CSC_LINK=           # optional; Windows is unsigned in v0.1
WIN_CSC_KEY_PASSWORD=
NPM_TOKEN=
GH_TOKEN=               # GITHUB_TOKEN in Actions

# extension publishing (CI, Chrome Web Store API v2)
CWS_PUBLISHER_ID=
CWS_EXTENSION_ID=
CWS_CLIENT_ID=
CWS_CLIENT_SECRET=
CWS_REFRESH_TOKEN=

# Kamo Cloud — shipped in the app (public)
SUPABASE_URL=
SUPABASE_ANON_KEY=

```
Server variables live in the private repository `kamo-cloud`. No secret goes into the app or extension bundle. Only `SUPABASE_URL` and `SUPABASE_ANON_KEY`, which are public by design; security comes from RLS.
