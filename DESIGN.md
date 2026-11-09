---
version: alpha
name: Kamo
description: Screen recorder with a chameleon mascot. Pastel tones on cream, charming without losing seriousness, with the video always as the protagonist.
colors:
  background: "#FAF7F2"
  surface: "#FFFFFF"
  surface-raised: "#F3EFE8"
  border: "#E6E0D6"
  on-surface: "#2B2A26"
  on-surface-muted: "#6F6A61"
  primary: "#A8D5A2"
  on-primary: "#1F3A1C"
  primary-strong: "#3F7539"
  primary-container: "#E3F1E0"
  secondary: "#F6B8CC"
  on-secondary: "#4A1A2A"
  tertiary: "#3E8C84"
  tertiary-strong: "#2F6F68"
  tertiary-container: "#CDE8E4"
  recording: "#E0604F"
  success: "#3F7539"
  warning: "#875810"
  error: "#B9412F"
typography:
  display:
    fontFamily: Instrument Serif
    fontSize: 64px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline:
    fontFamily: Instrument Serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.15
  title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.02em
  timecode:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  button-primary-hover:
    backgroundColor: "#97CB90"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  link:
    textColor: "{colors.tertiary-strong}"
    typography: "{typography.body}"
  focus-ring:
    backgroundColor: "{colors.tertiary}"
    height: 2px
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  chip-selected:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  zoom-block:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: 28px
  cloud-badge:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  timecode:
    textColor: "{colors.on-surface}"
    typography: "{typography.timecode}"
  recording-bar:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: 8px 16px
  recording-dot:
    backgroundColor: "{colors.recording}"
    rounded: "{rounded.full}"
    height: 10px
    width: 10px
  toast-success:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
  toast-warning:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.warning}"
    rounded: "{rounded.md}"
  toast-error:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
---

# DESIGN.md — Kamo

## Overview
Kamo is a chameleon that tracks its target with one eye and hits the exact spot with its tongue, and the app does the same with every click. The visual language mixes a **film set** (timecode, take, clapperboard) with the **chameleon's garden**: pastel tones, warm cream, nothing shouting. Charming, but serious enough for people who record product demos at work. **Light by default**, with a soft dark theme as an option. Personality: confident, direct, with humor in the copy and zero fuss in the chrome.

## Colors
- **Background / Surface:** warm cream (`#FAF7F2`) instead of pure white, which is what gives the warmth. Three levels (background → surface → surface-raised) create depth with little shadow.
- **Primary (`#A8D5A2`) — sage:** Kamo's green. The Record button, Export, and the background of the subscribe button. The Cloud badge uses `primary-container` with `primary-strong` text. Text on top of it is always `on-primary` (very dark green), never white.
- **Primary-strong (`#3F7539`):** the green for text and icons on a light background. Plain sage doesn't have enough contrast to be read on top of cream.
- **Secondary (`#F6B8CC`) — tongue pink:** exclusive to the zoom blocks on the timeline and the mascot's tongue. Pink = "here is where Kamo struck".
- **Tertiary (`#3E8C84`) — water:** focus ring and icons. For **link text** in the light theme, use `tertiary-strong` (`#2F6F68`, 5.5:1 on cream): plain `tertiary` only reaches 3.7:1 and fails for text. `tertiary-container` is the background for chips and selected options.
- **Recording (`#E0604F`) — coral:** only the REC dot. Errors use `error`, a darker shade of the same coral for legibility.
- **Contrast:** text 13:1, secondary text 5:1, text on sage 7.5:1, text on pink 8.6:1. All pass WCAG AA. The focus ring and REC meet the 3:1 minimum for non-text elements.

## Dark theme
Same roles, adjusted values. The pastels work directly on the dark background, so the `strong` version isn't needed here.

| Token | Dark |
|---|---|
| background | `#1A1D1B` |
| surface | `#222624` |
| surface-raised | `#2A2F2C` |
| border | `#353B37` |
| on-surface | `#ECEAE4` |
| on-surface-muted | `#A3A69F` |
| primary / primary-strong | `#A8D5A2` |
| on-primary | `#1F3A1C` |
| primary-container | `#2F3D2D` |
| secondary | `#F2B5C8` |
| on-secondary | `#4A1A2A` |
| tertiary | `#A9D8D3` |
| tertiary-container | `#2E3B39` |
| recording / error | `#F08A7E` |
| warning | `#E8C07A` |

Light by default, with a Light / Dark / System selector in Settings.

## Typography
- **Instrument Serif** for large headings (landing, empty states, countdown): elegant, with a cinema feel.
- **Inter** across all functional UI.
- **JetBrains Mono** only for the `hh:mm:ss:ff` timecode, with tabular numbers so it doesn't jitter.
- **Chinese, Japanese and Korean:** Instrument Serif and Inter don't have these characters. Fall back to **system fonts**, which are already installed and weigh nothing: `PingFang SC`, `Hiragino Sans` and `Apple SD Gothic Neo` on Mac; `Microsoft YaHei`, `Yu Gothic UI` and `Malgun Gothic` on Windows; `Noto Sans CJK` on Linux (extension). Also in headings; the decorative serif stays Latin-only. **Never bundle a CJK font:** each one is 5MB to 15MB and would blow the extension's budget. On the landing page and the web, same system font stack.
- **One font stack per language:** Chinese and Japanese share characters, but each draws them in its own way. Always set `lang` on `<html>` (`zh-CN`, `ja`, `ko`…) and switch the stack by language, otherwise Windows may show Japanese in the Chinese font:
  - `:lang(zh-CN)` → `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
  - `:lang(ja)` → `"Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP", sans-serif`
  - `:lang(ko)` → `"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`
  - Inter stays in front of all three stacks, so Latin letters and numbers look the same in every language
- **User content** (video titles, transcripts) gets the `lang` of the language detected in the transcription or of the interface language, for the same reason
- **Long text:** buttons and labels hold up to 35% more text than English (German and French) without wrapping or cutting off. No fixed width on buttons with text.
- **Direction:** spacing with CSS logical properties (`margin-inline-start` instead of `margin-left`), to support Arabic (RTL) in the future without redoing the layout.

## Layout
- The preview takes as much area as possible; panels and timeline shrink, the video doesn't.
- 8px grid. Default panel inner spacing: 16px.
- Editor: preview in the center, side panel on the right (280–320px), timeline at the bottom (160–200px).
- Minimum window: 1024×680.

## Elevation & Depth
- Depth through surface color and a thin border, not through shadow.
- Soft shadow (`0 8px 24px` at 8–12% opacity) only on floating elements: recording bar, popovers, menus.
- The video in the preview has the shadow the user chose, which is content and not UI.

## Shapes
- Medium rounded corners (10px) on buttons and fields, large (16px) on panels, pill on the recording bar, chips and the Cloud badge.
- Zoom blocks with a small corner (6px) to stay precise on the timeline.

## Components
- **button-primary:** one per screen at most (Record on Home, Export in the Editor).
- **zoom-block:** draggable by the middle, resizable by the edges (the cursor changes), label with the scale ("2.0×").
- **cloud-badge:** small pill with a cloud icon next to everything that uses Kamo Cloud ("Send to cloud", link, playlist). Never appears on record, edit or export functions, because those are free. Clicking opens a popover explaining the cloud, never a modal.
- **timecode:** always mono, always `hh:mm:ss:ff`.
- **recording-bar:** floating, draggable, with the `recording-dot` pulsing (opacity 1 → 0.4 over 1.2s).
- **settings-section:** panel with a `text-title` title, a hero (paper-cut art on a shared 120×56 canvas, Instrument Serif headline at 24px, one muted line, on `tertiary-container` at 35%), then **setting-card**s and an optional footnote with a 14px icon. In `packages/ui/src/settings/parts.tsx` (`Section`, `SettingCard`, `SwitchCard`, `Chip`, `SectionNote`).
- **setting-card:** thin border, medium corners; a 40px `surface-raised` tile with a water stroke icon (56px with art for packs), the name with its **chip**s, a muted line, controls at the end (they wrap under the text when narrow).
- **chip:** pill, `label` size, tones neutral / success (with a check) / error / warning / active (`tertiary-container`).
- **focus-ring:** water color, 2px, on every keyboard-focusable element.

## Mascot: Kamo
- A chameleon in **layered paper-cut** style: soft sage paper shapes with subtle texture and gentle drop shadows, big friendly eye, pink cheeks, curled tail in water tones. Cute, never realistic
- **Artwork:** `packages/design-tokens/assets/mascot/` (published as `@kamo/design-tokens/mascot/*`, so the site uses the same files). `kamo-sheet.webp` is the master sheet; the cut-outs have transparent backgrounds: `kamo-scene` (with leaves, for hero/closing), `kamo-icon` (app icon), `kamo-front`, `kamo-side`, `kamo-back` (full body) and the heads `kamo-head-look`, `-look-side`, `-look-up`, `-blink`, `-happy`, `-wink`, `-tongue`. In the app, use the `Mascot` component from `packages/ui`
- **Signature:** an eye that rotates and follows the cursor. On click, the tongue shoots out to the spot, which is the metaphor for zooming on click
- **Color:** body `primary` (sage), tongue `secondary` (pink), iris `tertiary` (water). On the landing page and in the editor's background picker, the body changes color to match the chosen wallpaper (it's a chameleon, after all)
- **Where it appears:** landing page (hero and closing), app icon (just the head with the eye), next to the name on Home, empty states, countdown (blinks on each number), export-complete screen (smiling)
- **Where it doesn't appear:** inside the exported video, and nowhere near the editing work: in the editor only the small brand mark (`kamo-icon`) sits next to the project name, and quiet paper-cut leaves sit behind the preview, showing only in its empty margins (never over the video, timeline or panel, never in the render). There, the video is the protagonist
- In the app today: next to the name on Home and next to the project name in the editor as the brand mark (`kamo-icon`), editor while opening (`head-look`) or when a project can't be read (`head-look-side`), empty project list (`front`), countdown (`head-look`, swapping to `head-blink` on each number), saved-recording notice (`head-happy`), the Transcribe dialog (`head-look` beside its title, `head-happy` when installed and when the first transcript is ready, `head-look-side` when this build can't transcribe), app icon (`kamo-icon`, upscaled placeholder until a native 1024px export exists)
- Respects `prefers-reduced-motion`: no eye animation or blinking, just the mascot standing still

## Motion
- All animation uses a spring (stiffness 170, damping 26), the same physics as the camera and the cursor. Never linear easing.
- UI transitions: 120ms (hover, toggle) and 200ms (panels, popovers).
- Countdown: each number enters with scale 1.2 → 1.0.

## Do's and Don'ts
- ✅ Good defaults instead of options: the user shouldn't need to open the side panel
- ✅ Short copy with humor ("Done. It's already edited.")
- ✅ Pastel for fills, `primary-strong` for text and icons on a light background
- ❌ Saturated or neon colors: the charm is in the softness
- ❌ Pure white as a screen background (use the cream)
- ❌ White text on top of sage or pink
- ❌ Coral outside REC and errors
- ❌ More than one sage button competing on the same screen
- ❌ Blocking modal to sell the cloud
- ❌ Paid badge on any app function: only the cloud has a plan
- ❌ Gradients and glassmorphism in the chrome: the shine belongs to the video
