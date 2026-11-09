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
- **FFmpeg** — not used. Plan B for machines where the WebCodecs encoder fails (an optional LGPL "Video compatibility" pack, D-040) is on hold: there is no official LGPL build for Windows and Mac to download from its source (D-042). Such an export says `encoder_unavailable` or `encoder_failed`
- **whisper.cpp** — local transcription: its `whisper-cli` ships in the desktop app (built from a pinned commit, a few MB); the models are downloaded from Hugging Face on request, never in the installer (D-042)
- **@modelcontextprotocol/sdk** — local and cloud MCP servers
- **@supabase/supabase-js** — only inside `packages/cloud-client`, for login and cloud calls
- **Multipart upload:** in the app, `fetch` directly to the signed URLs that Kamo Cloud returns
- **electron-builder** — packaging
- **electron-updater** — auto-update via GitHub Releases
- **Our own native module `@kamo/mouse-hook`** — mouse events only. **Do not use `uiohook-napi`**: it installs a keyboard hook along with it, which violates D-003

## Optional packs (transcription models, D-042)
- **The program ships in the app.** `apps/desktop/native/whisper/build.mjs` builds whisper.cpp's `whisper-cli` from one pinned commit (v1.7.6, `a8d002c…`) in CI, the release and the Store workflow, before packaging: Windows x64 (MSVC, ggml's CPU backend once per instruction set as small DLLs, the best one loaded at run time, no OpenMP, the C++ runtime DLLs app-local; ~6.8MB uncompressed) and Mac arm64 (one static binary, Metal with embedded shaders, Accelerate, ad-hoc signed, then signed with the app). electron-builder copies `native/whisper/build/<win|mac>/` to `<resources>/whisper/`; `src/main/transcription/whisper-path.ts` finds it there, or in the build folder in development. Without it, the app reports `program: missing` and offers no download. Local build: `native/whisper/README.md`
- **The models come from Hugging Face.** The official repository `ggerganov/whisper.cpp`, at revision `5359861c739e955e79d9a303bcbc70fb988958b1`: `https://huggingface.co/ggerganov/whisper.cpp/resolve/<revision>/ggml-base.bin` (Light, 147,951,465 bytes, SHA-256 `60ed5bc3…a2efe`) and `…/ggml-small.bin` (Accurate, 487,601,967 bytes, SHA-256 `1be3a9b2…a987b`), all pinned in `apps/desktop/src/main/packs/config.ts` (the only place with a model URL). There is no manifest: the list is static in the app
- **The download** is a plain GET with Electron's `net` in main (nothing else is sent; a `Range` header to resume after a pause, a lost connection or a restart). Hugging Face answers with a redirect to its CDN; it is followed only to https. 30s without data stops it as unreachable; offline (`net.isOnline`), Hugging Face unreachable, an HTTP error, a damaged file (deleted, starts over) and a full disk are told apart. The file is checked for size and SHA-256, then its folder is moved into `app-data/packs/<id>/<revision>/`. Before each transcription the model is hashed again when its size or mtime changed. A later app that pins another file offers it as an update, downloaded only after the user confirms
- **Never on its own:** the only request is the model download, after a Download click (Settings → Optional packs, or the Transcribe dialog). No telemetry
- **Development:** `node scripts/fake-pack-server.ts` (in `apps/desktop`) serves fake models the way Hugging Face does and prints `KAMO_PACKS_DEV_MODELS` (a JSON file of local URLs, sizes and hashes; plain http on this machine only) and `KAMO_WHISPER_CLI` (a Node script standing in for whisper-cli). Both are debug hooks a release ignores (D-038)
- Whisper runs as a child process at below-normal priority, with half the cores (max 8), the app-data folder as its working directory and paths relative to it (whisper.cpp opens files with narrow-char APIs on Windows, so a user folder with accents would break absolute paths). Its audio is a 16kHz mono WAV decoded by a hidden renderer with WebCodecs (mediabunny), never FFmpeg
- Hugging Face is blocked in mainland China: a configurable mirror URL (same pinned hashes) is the later option (D-042)

## Distribution
- GitHub Releases: `.dmg` (arm64) and `.exe` (x64), with a budget of **≤ 130MB** (Electron alone already takes up a good part; no model or FFmpeg inside; `whisper-cli` adds a few MB)
- Extension: **≤ 5MB** (estimate: 1–3MB). Uses the same `core` and the same `ui` as the desktop; what weighs on the desktop is Electron and the native modules, and the extension has neither
- **Bundles per entry point in the extension:** popup (≤ 150KB, no `core` or editor), recording bar (as light as the popup, no `core`), recording offscreen (capture, events and thumbnails only), editor (`core` + `ui`, loaded only when the editor tab opens) and service worker (minimal). Language strings loaded on demand, only the language in use
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
| Recording controls | `chrome.windows.create({ type: 'popup', focused: false })` opens the recording bar (`recording-bar.html`: timecode, Pause / Resume, Stop) as its own small window at the bottom center of the recorded tab's browser window; no permission needed. While recording, `chrome.action.setPopup({ popup: '' })` turns a click on the icon into `action.onClicked`, which stops |
| Editor | extension page (`editor.html`) opened in a new tab |
| Projects | OPFS (`navigator.storage.getDirectory()`) |
| Settings and cloud session | `chrome.storage.local` |
| Export download | `chrome.downloads` |

**Manifest permissions:** `tabCapture`, `offscreen`, `storage`, `downloads`, `scripting`, `activeTab`, `alarms` (the toolbar Kamo's idle glance, about once a minute), and from step 17 `identity` plus the cloud API and R2 domains in `host_permissions` (for upload only); until then the manifest has neither (`apps/extension/scripts/manifest.ts`, justified in `docs/store/permissions.md`). `<all_urls>` only as **`optional_host_permissions`**, requested on the first recording with the explanation "to keep capturing clicks when the page changes site". If the user denies it, click capture works until the tab navigates to another domain (`activeTab` loses access at that point), and the video keeps recording normally. This eases Chrome Web Store review and reinforces privacy.

**Known limits:**
- Doesn't record internal pages (`chrome://`, the Chrome Web Store itself), nor capture clicks on them
- Clicks inside cross-origin iframes may not be captured in the MVP
- If the user switches tabs during recording, the recording continues on the original tab
- Any element injected into the page shows up in the video (`tabCapture` records what the tab renders). That's why the extension doesn't inject a bar or buttons during recording; the controls live in the recording bar's own window (a separate window is not part of the tab, so `tabCapture` never records it), the icon and the shortcut

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
