# Chrome Web Store — Kamo extension (E-06)

Everything the store form asks for, kept next to the code so it changes with it. Nothing here is
uploaded by hand-written scripts: the release workflow uploads the zip (`scripts/chrome-web-store.ts`)
and a person fills in the listing once in the developer dashboard.

| File | What for |
|---|---|
| `listing.md` | Name, short and long description in every v0.2 language |
| `permissions.md` | The justification of each permission (the form's "Privacy practices" tab) |
| `privacy.md` | Privacy policy text, linked from the listing |
| this file | Package, screenshots plan and the submission checklist |

## Package
- `pnpm --filter @kamo/extension store:zip` builds, checks the budget (`scripts/size-budget.ts`:
  package ≤ 5MB, popup ≤ 150KB gzipped as it loads) and writes
  `apps/extension/out-store/kamo-extension-<version>.zip` (git-ignored). Measured on 2026-11-04:
  0.90MB zip, 1.75MB unpacked, popup 116KB gzipped.
- The release workflow builds the same zip from the `v*` tag and uploads it when the
  `CWS_*` secrets exist (`docs/release-checklist.md`).
- Name and short description come from `_locales/<lang>/messages.json`, generated from
  `packages/i18n` (`extension.name`, `extension.description`).

## Screenshots (1280×800, PNG, no alpha; 5 per language)
Made with Kamo itself on a demo page, in the store language, light theme:
1. The popup open over a product page: "Record this tab", microphone, tab sound, camera.
2. The editor right after Stop: preview zoomed on a click, zoom blocks on the timeline.
3. The editor in 9:16 with the webcam bubble (or split) and a wallpaper.
4. The export sheet with 16:9 and 1:1 picked, then "1 file saved".
5. "All projects" with thumbnails and a playlist chip, and the "projects stay in this browser" line.

Small promo tile (440×280): Kamo's head on the paper-cut green with "Record a tab. It's already edited."
Video (E-06): a 30–45s recording of recording a tab with Kamo, exported with Kamo, uploaded to YouTube
(unlisted) and linked in the listing.

## Submission checklist
- [ ] Developer account (US$ 5) and the `CWS_*` secrets (`docs/release-checklist.md`)
- [ ] Zip built from the release tag, under budget
- [ ] Listing (`listing.md`) pasted for each language; category: Productivity → Tools
- [ ] Single purpose: "Record a browser tab and edit the video with automatic zooms on clicks."
- [ ] Permission justifications (`permissions.md`) pasted
- [ ] Data usage: no data collected; certify the three limited-use statements
- [ ] Privacy policy URL (the site's page with `privacy.md`)
- [ ] 5 screenshots + promo tile + video link
- [ ] After approval: the same zip to Edge Add-ons
- [ ] Not before: the `extension.popup.desktopOnly` / `getDesktop` keys can go once nothing uses them
