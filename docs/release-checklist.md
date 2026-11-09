# Release checklist

Native capture, permissions, signing and updates cannot be tested in CI. Before publishing a
release, go through this list on a real Mac (Apple Silicon) and a real Windows PC, with the
installers from the **draft** release that `.github/workflows/release.yml` created. Copy the
list into the release's tracking issue and tick it there.

## 0. Cut the release
- [ ] `main` is green in CI (lint, typecheck, tests, visual regression, installers ≤ 130MB, extension ≤ 5MB, `@kamo/mcp` ≤ 5MB)
- [ ] `docs/plan.md` and `AGENTS.md` → Status say what this release contains
- [ ] Tag and push: `git tag v0.1.0 && git push origin v0.1.0` (a `-beta.N` suffix makes a GitHub prerelease, npm `next`, and skips the Chrome Web Store). The version comes from the tag; package.json versions stay `0.0.0` in git
- [ ] The workflow finished. Warnings in its summary say what was skipped (unsigned Mac, no notarization, no npm, no Chrome Web Store)
- [ ] Platforms: Windows is always built. The Mac app is built only when the repository variable `RELEASE_MAC` is `true` (Settings → Secrets and variables → Actions → Variables); leave it unset while the Mac is "coming soon" in the README
- [ ] Release tags have no suffix (`v0.1.0`): the app's updater ignores GitHub prereleases, so a `-beta.N` build never reaches people who installed a stable one
- [ ] The draft has: `Kamo-<v>-win-x64-setup.exe`, its `.blockmap`, `latest.yml`; with `RELEASE_MAC` also `Kamo-<v>-mac-arm64.dmg`, `Kamo-<v>-mac-arm64.zip` (the updater uses it), their `.blockmap`s and `latest-mac.yml`. The extension zip (and the Chrome Web Store upload) only come with the repository variable `RELEASE_EXTENSION` set to `true`; unset, the release leaves the extension out

## 1. Install
- [ ] Mac: the dmg opens, Kamo drags into Applications and opens **without** a Gatekeeper warning (signed and notarized). `spctl --assess --type execute -vv /Applications/Kamo.app` says `Notarized Developer ID`
- [ ] Windows: the installer runs; SmartScreen shows "More info → Run anyway" while unsigned (the README explains it); the app opens from the Start menu
- [ ] Hardening (D-038): `ELECTRON_RUN_AS_NODE=1 <Kamo binary> -e "console.log(1)"` opens Kamo instead of printing `1`; `<Kamo binary> --smoke-test` opens Kamo normally (no smoke run); Ctrl+Shift+I / Cmd+Option+I opens no DevTools
- [ ] Mac (first release with the trimmed entitlements: only `allow-jit`, microphone and camera): the signed app starts, records the screen with the microphone, the webcam bubble and computer sound, and transcribes with the pack. If not, Console.app shows the library-validation or code-signing error
- [ ] Installer sizes ≤ 130MB (CI checks it; glance at the draft)

## 2. Permissions (F-13)
- [ ] Mac, first launch: onboarding asks Screen Recording, then Microphone; granting is detected without restarting (or the app asks to reopen when macOS requires it)
- [ ] Mac: denying Screen Recording blocks recording with a clear message and a shortcut to System Settings
- [ ] Windows: Microphone permission screen; denied microphone in Windows privacy settings is detected
- [ ] Settings → Permissions shows the real status of each one
- [ ] Camera is asked only the first time the webcam is turned on, never in onboarding

## 3. Record (F-01 to F-04, A-03, A-08)
- [ ] List displays and record the main display for ~1 minute; then a second display if there is one
- [ ] Record a window and a region
- [ ] Clicks, drags and scrolls show up in the editor as zooms and in the cursor track; the keyboard is never captured (type during the recording: nothing in `events.jsonl`)
- [ ] Microphone on: the voice is in sync with the video at the start and the end of a 5-minute recording
- [ ] **System sound** on: a video playing during the recording is heard in the export (Mac and Windows), in sync
- [ ] Webcam on: the bubble shows, shrinks on zoom, can be hidden on the timeline
- [ ] Stop with the global shortcut and from the tray/menu bar; the project opens in the editor
- [ ] Mac with a Retina display and Windows at 150% scaling: the cursor lines up with the clicks

## 4. Edit and export (F-05 to F-11, F-16, A-01, A-02)
- [ ] Preview plays smoothly; zooms on the timeline can be moved, resized and deleted; a manual zoom survives "regenerate"
- [ ] Style: wallpaper, color, own image, padding, corners, shadow
- [ ] Trim start and end
- [ ] Export 16:9, 1:1 and 9:16 (also 9:16 with the split layout) at 1080p30; 4K and 60fps; GIF. Each file plays in the OS player and in a browser
- [ ] A 1-minute 1080p30 export takes under a minute (hardware encoder; Settings → Copy diagnostics says which encoder)
- [ ] Cancel an export midway: no `.partial` file is left

## 5. Captions and transcription with a real pack (A-05, A-06, A-07)
- [ ] Settings → Optional packs lists the Light and Accurate packs from the `packs` release; download Light with pause/resume
- [ ] Mac: the downloaded `whisper-cli` runs (no Gatekeeper block on the ad-hoc signed binary)
- [ ] Transcribe a 10-minute recording in Portuguese and one in English with Light: well under 5 minutes on an M1 / recent i5
- [ ] Captions show in the preview, can be edited, are burned into the export, and `.srt` export opens in a player
- [ ] Remove the pack: the folder is gone from `app-data/packs/`

## 6. Local MCP with Claude Code (M-01)
- [ ] `npx -y @kamo/mcp@<v> --dir "<projects folder>"` starts and waits on stdio (when npm was published; before that, `node apps/mcp/dist/cli.js`)
- [ ] The app's "Connect to an agent" panel shows the command pinned to this version (only when npm was published; otherwise the "not published yet" note); paste it: `claude mcp add kamo -- npx -y @kamo/mcp@<v> --dir "<projects folder>"`
- [ ] In Claude Code: list recordings, search a transcript, read the click timeline, get a reference frame
- [ ] MCP Inspector (`pnpm --filter mcp inspect`) lists the tools with no errors
- [ ] The MCP makes no network request (it has no network code; check that nothing new was added)

## 7. Update from the previous version (F-14)
- [ ] Install the **previous** release on both OSes, record a project, add the optional pack
- [ ] Publish the draft (only after everything else here is ticked), then open the old version: within a minute it downloads the update and offers "Restart now"
- [ ] It never restarts on its own during a recording or an export
- [ ] After the update: projects, settings, the optional pack and (Mac) the permissions are still there

## 8. Tray, close and quit (F-15, D-026)
- [ ] Windows: closing the main window keeps Kamo in the tray; Open Kamo and Quit work; a second launch focuses the running app
- [ ] Mac: closing the window keeps the app in the Dock; the menu bar icon shows while recording; Cmd+Q quits
- [ ] Quitting from the tray, OS shutdown and installing an update always quit

## 9. Languages (F-15, D-021)
- [ ] Switch to English, Português (Brasil), Español, 简体中文 and 日本語 without restarting: Home, the editor, export, Settings and onboarding have no missing keys and no clipped text
- [ ] Dates, durations and file sizes follow each language

## 10. Diagnostics (F-17)
- [ ] Settings → Help → Copy diagnostics shows the version being released, the OS, the GPU and the encoder; no user name in paths

## 11. Chrome extension (E-01 to E-06)
- [ ] Load `kamo-extension-<v>.zip` unpacked in Chrome (unzip, `chrome://extensions` → Developer mode → Load unpacked): no errors on the service worker
- [ ] Record a tab with the microphone; the tab keeps its sound while recording; clicks become zooms
- [ ] The editor opens, the project survives a browser restart (OPFS), the export downloads
- [ ] Chrome Web Store: the workflow uploaded and submitted the item (or upload the zip by hand in the developer dashboard). Review takes days to weeks

## 12. Publish
- [ ] Release notes written in the draft (the generated list of changes is the starting point)
- [ ] Publish the draft. electron-updater only sees published, non-prerelease releases
- [ ] npm: `npm view @kamo/core version` (and design-tokens, i18n, cloud-client, mcp) shows the new version, with provenance
- [ ] Tell the beta testers

## Secrets and accounts

Set in GitHub → Settings → Secrets and variables → Actions. Every one is optional: without it
the related step is skipped with a warning in the run summary.

| Secret | Used by | What it is |
|---|---|---|
| `CSC_LINK` | release.yml → desktop (Mac) | Developer ID Application certificate + private key exported as `.p12`, base64 (`base64 -i cert.p12 \| pbcopy`). Created by the Apple Developer account's Account Holder |
| `CSC_KEY_PASSWORD` | release.yml → desktop (Mac) | Password of that `.p12` |
| `APPLE_ID` | release.yml → desktop (Mac) | Apple ID email of a member of the developer team, for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | release.yml → desktop (Mac) | App-specific password for that Apple ID (appleid.apple.com → Sign-In and Security) |
| `APPLE_TEAM_ID` | release.yml → desktop (Mac) | 10-character team ID (developer.apple.com → Membership) |
| `WIN_CSC_LINK` | release.yml → desktop (Windows) | Optional code-signing certificate `.pfx`, base64. Not planned for v0.1 (SmartScreen notice instead) |
| `WIN_CSC_KEY_PASSWORD` | release.yml → desktop (Windows) | Password of that `.pfx` |
| `NPM_TOKEN` | release.yml → npm, prerelease.yml | npm automation token with publish rights on the `@kamo` org. Provenance needs no extra secret (GitHub OIDC) |
| `CWS_PUBLISHER_ID` | release.yml → chrome-web-store | Publisher ID shown in the Chrome Web Store developer dashboard (Account) |
| `CWS_EXTENSION_ID` | release.yml → chrome-web-store | The item ID, after the first manual upload created the item |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` | release.yml → chrome-web-store | OAuth client (Desktop app type) in a Google Cloud project with the Chrome Web Store API enabled |
| `CWS_REFRESH_TOKEN` | release.yml → chrome-web-store | Refresh token for the `https://www.googleapis.com/auth/chromewebstore` scope, from that client and the publisher's Google account |

`GITHUB_TOKEN` is automatic: the release job creates the draft and uploads the assets with it,
and electron-updater reads public releases without any token.

Accounts: Apple Developer Program (Mac signing and notarization), the `@kamo` npm org, a
Chrome Web Store developer account (one-time fee) with the item created by a first manual
upload, and a Google Cloud project for the store API.

## Automated around a release

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every PR and push to `main` | lint, typecheck, tests, i18n, keyboard guard, extension and `@kamo/mcp` budgets; native helpers; unsigned installers on both OSes with the 130MB budget, a smoke test and the export benchmark; visual regression of the renderer |
| `prerelease.yml` | push to `main` | `@kamo/design-tokens` and `@kamo/core` as `0.0.<run>-next` (skipped without `NPM_TOKEN`) |
| `release.yml` | `v*` tag | the draft release, npm packages, Chrome Web Store (see the top of this file) |
| `packs.yml` | manual | the optional transcription packs on the rolling `packs` release |

Export benchmark: the CI job summary of `desktop-package` shows seconds of export per minute
of video. Once a few runs look stable, write those numbers into
`scripts/export-benchmark-baseline.json`; from then on a run more than `regressionFactor` times
slower fails.
