---
version: alpha
name: ClipDirector Cinematic
description: Dark, cinema-inspired identity for ClipDirector's Android client. Warm clapperboard orange accent on near-black surfaces; geometric display typography with an editorial body face.
colors:
  # Surface hierarchy — Material 3 dark, slight blue undertone so it doesn't read pure-black.
  surface: "#0E0F12"
  surface-dim: "#0A0B0E"
  surface-bright: "#262A31"
  surface-container-lowest: "#08090C"
  surface-container-low: "#13151A"
  surface-container: "#181B21"
  surface-container-high: "#23262D"
  surface-container-highest: "#2E323A"

  on-surface: "#E6E7EB"
  on-surface-variant: "#A8ADB6"
  on-surface-muted: "#6E7480"
  outline: "#3A3F47"
  outline-variant: "#2A2D33"

  # Primary — "Clapperboard Orange." Warm, slightly desaturated; reads as film orange, not safety orange.
  primary: "#F26B1F"
  on-primary: "#1A0C00"
  primary-container: "#5C2A0A"
  on-primary-container: "#FFDDC4"
  primary-fixed: "#FFA170"
  primary-fixed-dim: "#F26B1F"

  # Secondary — "Studio Cyan." Cool counterpoint, used sparingly for info chrome (links, neutral chips).
  secondary: "#4DD0E1"
  on-secondary: "#00363D"
  secondary-container: "#0F4751"
  on-secondary-container: "#A8E8F0"

  # Tertiary — "Stage Violet." Reserved for accent/decorative moments; not a primary action color.
  tertiary: "#B49CFF"
  on-tertiary: "#1E1245"
  tertiary-container: "#2E1B6B"
  on-tertiary-container: "#DDD2FF"

  # Semantic
  error: "#FF6B6B"
  on-error: "#3D0000"
  error-container: "#5C0A0A"
  on-error-container: "#FFCFCF"
  success: "#2ECC71"
  on-success: "#003315"
  success-container: "#0F4426"
  on-success-container: "#A8E8C4"

  # Status pills — one color per JobStatus enum (queued..failed).
  status-queued: "#6E7480"
  status-sampling: "#4DD0E1"
  status-reasoning: "#B49CFF"
  status-rendering: "#F26B1F"
  status-uploading: "#FFA170"
  status-complete: "#2ECC71"
  status-failed: "#FF6B6B"

typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: 700
    lineHeight: 56px
    letterSpacing: -0.02em
  display-md:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: 600
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: 600
    lineHeight: 36px
    letterSpacing: 0em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: 0em
  title-md:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.08em
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: 700
    lineHeight: 14px
    letterSpacing: 0.12em

rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px

spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  screen-edge: 16px
  card-padding: 16px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 14px
    height: 52px
  button-primary-pressed:
    backgroundColor: "{colors.primary-fixed-dim}"
  button-text:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: 10px
  card-elevated:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  card-outlined:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  text-field:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: 14px
    height: 56px
  top-app-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title-md}"
    # Material 3's default small-variant top bar is 64dp (vs Material 2's
    # 56dp). The Android implementation uses M3 TopAppBar directly so
    # 64dp is the practical reality. Custom 56dp would require a hand-
    # rolled component for marginal visual benefit.
    height: 64px
  status-pill:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 8px
---

## Overview

ClipDirector is a creator tool for short-form vertical video — TikTok, Reels, Shorts. The interface lives in the same emotional register as the medium: dark, energetic, focused on the work. The mood is **a film editor's room after midnight**: most of the screen is shadow, with a single warm light source picking out the next action.

Every visual decision serves one of three goals:

1. **Center the video, not the chrome.** Surfaces are deliberately dark so a 9:16 thumbnail or playback frame is the brightest element on screen.
2. **One action per moment.** A given screen has exactly one primary CTA in the accent color. Everything else is text, outlined, or neutral.
3. **No design noise.** Generic Material defaults are visible to the user. Anything that reads as "stock Compose sample" is a regression.

Voice in error states and CTAs: direct, professional, slightly editorial. No emoji. No marketing hype. "Pick clips" not "Get started!".

## Colors

The palette is built on the Material 3 "surface container" hierarchy in dark mode, with a single warm accent.

- **Surface (#0E0F12):** Near-black with a slight cool undertone. The base color for full-screen backgrounds; never pure `#000` because flat black flattens video previews.
- **Surface container family (#13151A → #2E323A):** Five elevations from cards (`surface-container-low`) up to active selections (`surface-container-highest`). Use them to group related content without resorting to outlines.
- **On-surface (#E6E7EB):** Body text and primary icons. Off-white so it doesn't vibrate against the dark surface.
- **On-surface-variant (#A8ADB6):** Captions, metadata, secondary text. Reads as "supporting information" without being so dim it fails AA contrast.
- **Outline (#3A3F47) and Outline-variant (#2A2D33):** Hairline strokes for text fields, dividers, and outlined buttons. Used sparingly; the surface hierarchy does most of the grouping work.
- **Primary — "Clapperboard Orange" (#F26B1F):** The single accent. A warm orange that reads as cinema gel / sodium lamp / clapperboard, not as warning / construction safety. Used exclusively for primary CTAs, the active step in a process, and progress fills. **If you find yourself reaching for primary on two elements at once, one is wrong.**
- **Secondary — "Studio Cyan" (#4DD0E1):** Cool counter-accent for information chrome (helper text links, neutral chips, secondary buttons). Never the primary action.
- **Tertiary — "Stage Violet" (#B49CFF):** Decorative moments only — empty-state illustration, marketing surfaces, future "premium" flourishes. Not a UI control color.
- **Error (#FF6B6B):** Validation messages, destructive confirmations, failed job status. Pairs with `error-container` for badges.
- **Success (#2ECC71):** Reserved for `JobStatus.COMPLETE` and post-publish confirmation. Not used elsewhere — over-using green for any "ok" state cheapens the moment a render completes.
- **Status pills:** One color per `JobStatus` enum value. Lets a long history list be scanned by color alone.

## Typography

Two typefaces, both via Google Fonts at runtime (`androidx.compose.ui:ui-text-google-fonts`). No bundled font binaries in the repo.

- **Space Grotesk** for display, headlines, titles, and labels. Geometric grotesque sans with subtle character (the alternate `g`, the open apertures); reads as "modern director" without being a quirky novelty face.
- **Inter** for body and supporting text. The most-tested screen face on the planet; renders crisply at every Android density.

The scale is eleven levels — six display/headline/title in Space Grotesk, three body in Inter, three label in Space Grotesk. Labels use uppercase-friendly tracking (0.05–0.12em) for chips, badges, and small CTAs.

## Layout

- **4 px base unit.** Spacing scale: `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `xxl` 48. Anything outside the scale needs justification.
- **Screen edge gutter: 16 dp.** All screen-level content sits at least 16 dp from the device edge. Phones at the narrow end (5.5" devices, ~360 dp wide) still leave room for a comfortable text column.
- **Card padding: 16 dp internal.** Matches the screen edge gutter so a card-inside-a-screen lines up cleanly when you nest content.
- **Vertical rhythm: spacing tokens, not freestyle.** Adjacent components separated by `md` (16) by default, `sm` (8) for tightly related pairs, `lg` (24) between distinct sections.

## Elevation & Depth

This is a dark theme. Elevation is communicated by **surface tint**, not drop shadows. Material 3 dark elevation pattern:

- Page backdrop: `surface` (#0E0F12).
- Cards / list items: `surface-container` (#181B21) — one step lighter than backdrop.
- Floating elements / dropdowns / dialogs: `surface-container-high` (#23262D).
- Active / pressed states: `surface-container-highest` (#2E323A).

Shadows are subtle (alpha ≤ 8%) and used only on the top app bar's bottom edge when content scrolls beneath it.

## Shapes

- **xs (4 dp):** Internal chips, small badges.
- **sm (8 dp):** Text fields, secondary buttons, status pills (when not pill-shaped).
- **md (12 dp):** Cards, primary buttons. **Default for any new container.**
- **lg (16 dp):** Large surfaces — full-bleed clip thumbnails, prompt-card groups.
- **xl (24 dp):** Decorative / hero surfaces only.
- **full:** Status pills, FAB-style action buttons, avatars.

## Components

### `button-primary`

The single accent action per screen. 52 dp tall, `md` rounded, `Clapperboard Orange` background, `Space Grotesk label-lg` text with 0.05em tracking. Pressed state lightens to `primary-fixed-dim`. **Disabled state is `surface-container-high` background with `on-surface-muted` text** — not a faded orange, because faded warm colors look diseased.

### `button-text`

Secondary actions (cancel, "use a different email", inline links). No background, `primary` text. Padding inside the touch target keeps a 48 dp minimum hit area.

### `card-elevated` and `card-outlined`

Cards group related content inside a screen. Elevated cards sit on `surface-container`; outlined cards sit on `surface-container-low` with no border — the lighter background does the visual lifting. **No drop shadows on cards** — dark themes look cluttered with shadow.

### `text-field`

`OutlinedTextField` in Compose, customized: filled background (`surface-container-low`), no visible outline at rest, `primary` outline on focus, `error` outline + helper text on error. 56 dp tall to meet Material 3 touch targets.

### `top-app-bar`

Single 56 dp bar across the top of every authenticated screen. Title is `Space Grotesk title-md`. Left slot: back button when relevant. Right slot: overflow menu with Logout. Background is `surface` (matches the page) — the bar reads as part of the page, not a banded element.

### `status-pill`

Inline status badge for `JobStatus` values. Rounded `full`, padded `sm` horizontal × `xs` vertical, `label-md` text. Background is `surface-container-high`; text and dot color come from the `status-*` color tokens. Order in history lists: failed → in-progress (rendering/uploading) → complete (oldest at bottom).

## Do's and Don'ts

**Do**
- Use `primary` for the one most-important CTA on screen, never more.
- Reach for `status-*` colors before semantic ones — a render-in-progress is `status-rendering`, not generic `info`.
- Pair `headline-*` (Space Grotesk) with `body-*` (Inter). Mixing the families is the point.
- Anchor every screen with a `top-app-bar` for navigation context.

**Don't**
- Don't use pure white (`#FFFFFF`) for text — `on-surface` (#E6E7EB) is the correct off-white.
- Don't use shadows for depth. Dark themes communicate elevation via surface tint.
- Don't add a second primary-orange action on a screen. If you need two equal CTAs, one becomes `button-text` or a secondary outlined style.
- Don't bundle font files in the repo. Use Google Fonts via `ui-text-google-fonts`.
- Don't use the `tertiary` violet on a control. It's a decorative-only color.
- Don't emoji-prefix labels or strings. The tone is editorial, not chat.
