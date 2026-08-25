---
name: EduSync
description: A dark, instrumented computer-lab platform where role-coded accents and status chips do the talking
colors:
  bg-base: "#000000"
  bg-surface: "#111113"
  bg-elevated: "#17171A"
  bg-surface-3: "#1D1D21"
  border: "#232327"
  border-hover: "#2E2E33"
  text-primary: "#F1F2F5"
  text-secondary: "#93969F"
  text-muted: "#585C68"
  accent-live: "#15803D"
  accent-success: "#15803D"
  accent-warning: "#DDA53D"
  accent-critical: "#DC2626"
  accent-locked: "#7A8699"
  student-50: "#FEE6D4"
  student-300: "#FFAC68"
  student-500: "#E6802D"
  student-700: "#BA5500"
  student-900: "#571F05"
  admin-50: "#DBEAF8"
  admin-300: "#89C4FB"
  admin-500: "#4895DF"
  admin-700: "#096DBA"
  admin-900: "#012854"
  teacher-50: "#E4E5FF"
  teacher-300: "#BFBBFF"
  teacher-500: "#A799FF"
  teacher-700: "#5A37C5"
  teacher-900: "#27154F"
typography:
  display:
    fontFamily: "Inter Tight, Inter, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
  16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent-700}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-700}"
  button-outline:
    backgroundColor: "{colors.bg-base}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.bg-base}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
---

# Design System: EduSync

## Overview

**Creative North Star: "The Night Lab"**

EduSync renders as a dark, instrumented computer-lab environment, not a themeable dashboard that happens to default to dark. The base is true black (`#000000`) by direct decision, with surfaces built from three tightly-stepped near-black layers (`bg-surface`, `bg-elevated`, `bg-surface-3`) instead of shadows — elevation is a lightness shift, never a drop shadow. Color is spent deliberately: role identity (student/teacher/admin) lives in exactly one accent scale that repaints shared primitives via a `[data-role]` scope, and semantic status (live, idle, locked, critical) is a completely separate palette so a role's brand color and a status's meaning never compete for the same pixel.

Status is the star of this system. Because the product's whole value proposition is trustworthy, real-time visibility into who's present, focused, or at risk, the interface is built to make status legible at a glance — through the `StatusBadge` and `StudentTile` vocabulary — while everything else (buttons, cards, forms) stays deliberately quiet so it never competes with that signal.

Confirmed rejections: no light theme, no theme toggle (dark is the only mode this app renders), no drop-shadow-driven elevation, no decorative motion, no monospace type anywhere (tabular-nums substitutes for a second typeface wherever digits need to align).

**Key Characteristics:**
- True-black base with near-black tonal steps for surface hierarchy, not shadows
- One shared accent slot (`--accent-*`) repainted per role via `[data-role]`, so every primitive (button, badge, nav, focus ring) is role-aware without per-component branching
- Status color is a separate, fixed semantic palette — never reused as a role's brand color
- Flat by default; hairline borders brighten on hover instead of lifting
- Motion is restrained and meaningful (state changes, live pulses), and every animation has a `prefers-reduced-motion` fallback

## Colors

Two independent color systems share the canvas: a **role accent** (exactly one active at a time, via `[data-role]`) and a **fixed semantic status palette**. They are never allowed to blend.

### Primary — Role Accents (one active per session, via `[data-role]`)
- **Student Orange** (`--student-500` `#E6802D`, ranging `--student-50` `#FEE6D4` wash to `--student-900` `#571F05` deep): the active accent throughout the student experience — nav, buttons, focus rings, badges.
- **Teacher Royal Violet** (`--teacher-500` `#A799FF`, ranging `--teacher-50` `#E4E5FF` to `--teacher-900` `#27154F`): the active accent throughout the teacher/faculty experience.
- **Admin Ink Blue** (`--admin-500` `#4895DF`, ranging `--admin-50` `#DBEAF8` to `--admin-900` `#012854`): the active accent throughout the admin console.

### Neutral
- **True Black** (`--bg-base` `#000000`): the base canvas. Never rounded up to a near-black "soft black" — the pure value is intentional.
- **Surface** (`--bg-surface` `#111113`): first elevation step — cards, tiles, panels.
- **Elevated** (`--bg-elevated` `#17171A`): second step — popovers, dropdowns, the "glass" utility surface (solid, no blur).
- **Surface 3** (`--bg-surface-3` `#1D1D21`): third step — hover states on surface, deepest resting elevation before a modal.
- **Border** (`--border` `#232327`) / **Border Hover** (`--border-hover` `#2E2E33`): hairline dividers; hover brightens the hairline rather than adding a shadow.
- **Text Primary** (`--text-primary` `#F1F2F5`), **Text Secondary** (`--text-secondary` `#93969F`), **Text Muted** (`--text-muted` `#585C68`): the three-step text hierarchy; nothing pure white, nothing below muted for legible content.

### Semantic Status (fixed — never a role's accent, never reused as brand color)
- **Live/Success Forest Green** (`--accent-live` / `--accent-success` `#15803D`): live sessions and success/present/active states. AA-passing both as a solid white-text fill and as direct text on true black at large sizes.
- **Warning Amber** (`--accent-warning` `#DDA53D`): idle, partial, waiting-room, in-progress-with-caution states.
- **Critical Flag Red** (`--accent-critical` `#DC2626`): absent, exam-live, destructive actions. AA-passing both as a solid white-text fill and as direct text on true black at large sizes (replaces an earlier, too-dark red that only hit ~2.3:1 against `#000` as text).
- **Locked Slate** (`--accent-locked` `#7A8699`): locked/ended states — deliberately desaturated so "locked" never competes visually with an active warning or critical state.

### Named Rules
**The One Accent Rule.** Only one role accent is ever live in a given scope (`[data-role="student|teacher|admin"]`). Shared primitives (Button, Badge, Card, focus ring, nav) all read `--accent-*` and inherit whichever role they render inside — never hardcode a role's hex into a shared component.

**The Solid-Means-Decisive Rule.** A status chip defaults to a tinted wash (`color-mix(in srgb, token 12%, transparent)` background, token-colored text and hairline border). Solid fill (white text on a solid token background) is reserved for statuses that must read as decisive and high-stakes — present, absent, active — never applied by default just for emphasis.

## Typography

**Display Font:** Inter Tight (with Inter, system-ui, -apple-system, sans-serif fallback)
**Body Font:** Inter (with system-ui, -apple-system, sans-serif fallback)
**Label/Mono Font:** none — no monospace typeface anywhere in the system; tabular-nums (`.tnum`, `font-variant-numeric: tabular-nums`) handles column-aligned digits instead.

**Character:** A single, precise grotesque family doing all the work — Inter Tight only for h1/h2/h3 display moments, Inter for everything else. The pairing reads instrumented and exact rather than editorial or warm.

### Hierarchy
- **Display / h1** (600, 20px, 1.3 line-height, -0.01em tracking): page-level titles.
- **Headline / h2** (600, 16px, 1.4 line-height, -0.01em tracking): section headers within a page.
- **Title / h3** (600, 14px, 1.4 line-height): card and panel titles.
- **Body / h4, base text** (400–600, 14px, 1.5–1.6 line-height): default reading size for the whole app; buttons and inputs share this size.
- **Label** (600, 12px, 1.5 line-height): form labels and small UI text.
- **Micro / badge label** (600, 11px, 0.08em uppercase tracking): status chip text — always uppercase, always tracked wide.

### Named Rules
**The No-Mono Rule.** Digits that need to align in a column (timers, timestamps, scores) use `.tnum` tabular-nums on Inter, never a second monospace typeface.

## Layout

The app is a role-scoped shell: a fixed sidebar/nav plus a scrollable content region, optimized for desktop lab systems as the primary target (per product constraints — not a mobile-first design). Spacing runs on a tight 4px-rooted scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px) with density leaning compact — status grids (StudentTile) and tables are built to show many rows/tiles at once without scrolling, matching a teacher's need to monitor an entire lab in one glance.

## Elevation & Depth

Flat by default, tonal by necessity. Depth is conveyed almost entirely through the surface/elevated/surface-3 lightness steps, not shadows — `--shadow-card` and `--shadow-card-soft` are explicitly `none`. The two places a real shadow appears are structural, not decorative: a modal's backdrop shadow (`--shadow-modal`, dual-layer for backdrop separation) and a focus ring (`--shadow-focus`). "Glow" tokens for accent/locked states (`--glow-accent-info`, `--glow-accent-locked`) are reserved as `none` at rest and only ever animate in for a specific live/critical state (see `.glow-critical`, `.live-pulse`).

### Shadow Vocabulary
- **Modal** (`box-shadow: 0 4px 6px rgba(0,0,0,0.4), 0 24px 48px rgba(0,0,0,0.5)`): the only surface allowed to lift off the canvas with a true shadow.
- **Focus** (`box-shadow: 0 0 0 2px rgba(72,149,223,0.4)`): keyboard/focus-visible ring, distinct from hover states.

### Named Rules
**The Flat-By-Default Rule.** Cards and tiles never cast a shadow at rest; hover brightens the hairline border (`card-hover` → `border-color: var(--border-hover)`), it never adds elevation.

## Shapes

A restrained three-step radius scale: `--radius-sm` (6px) for chips and small controls, `--radius-md` (8px) for buttons/inputs/most containers, `--radius-lg` (12px) for cards and tiles, plus `--radius-pill` (999px) for fully-rounded status tags. Borders are hairline (1–1.5px) throughout; no double borders, no inset rings except the deliberate focus ring.

## Components

Components read as **quiet until it matters**: buttons, inputs, and cards stay restrained and hairline-bordered, while status communication (badges, live indicators) is the one place color and motion are allowed to be assertive — and even there, solid fill is reserved for genuinely decisive states.

### Buttons
- **Shape:** rounded-md (8px), `h-9` default height, `h-8` small / `h-10` large.
- **Primary:** `bg-primary` (role accent 700 step) with white text; `hover:bg-primary/90`.
- **Outline / Ghost / Secondary:** transparent or `bg-secondary` (surface-level) with a hairline border; hover shifts to the accent surface tint, never adds a shadow.
- **Press:** `.btn-press:active` scales to 0.97 — the only "physical" feedback a button gets.

### Badges / Status Chips (signature component — `StatusBadge`)
- **Shape:** rounded-pill (999px, per the Shapes section's "fully-rounded status tags" rule), uppercase 11px label at 0.08em tracking, icon + label, 3px/10px padding.
- **Default (wash):** `color-mix(in srgb, token 12%, transparent)` background, token-colored text, `color-mix(token 28%, transparent)` hairline border.
- **Solid (decisive states — present/absent/active):** white text on a solid token background, subtle dark hairline border for definition against true black.
- **Live states:** `live-pulse` (ripple box-shadow, 2s loop) for `live`/`exam-live`; `pulse-dot` (opacity 1↔0.4, 1.8s loop) for `idle`/`in-progress`/`waiting_room`. Both respect `prefers-reduced-motion` (animation removed, resting opacity/shadow shown instead).

### Cards / Containers
- **Corner Style:** rounded-lg (12px) for cards/tiles, rounded-xl for the base shadcn Card primitive.
- **Background:** `bg-surface` (`#111113`) at rest.
- **Shadow Strategy:** none at rest (see Elevation & Depth); `card-hover` brightens the border only.
- **Border:** 1px hairline (`--border`), status-dependent tint on signature tiles (e.g. `StudentTile` idle/submitted states tint the border toward the matching status token).

### Inputs / Fields
- **Style:** `h-9`, rounded-md (8px), hairline border, `bg-input-background` (true black).
- **Focus:** border shifts to `--ring` (role accent 500) plus a 3px accent-tinted ring (`.input-focus` / `focus-visible:ring-ring/50`) — never a glow or shadow lift.
- **Error / Disabled:** `aria-invalid` shifts border/ring to destructive token; disabled drops opacity to 50% and disables pointer events.

### Navigation (signature pattern)
- **Active:** flat accent tint background (`color-mix(in srgb, var(--accent-500) 13%, transparent)`), accent-colored text, medium weight — no side rail, no gradient, no icon chip.
- **Inactive:** secondary text color; hover shifts background to `bg-surface-3`, text to primary, and nudges 2px right (`translateX(2px)`) — suppressed under `prefers-reduced-motion`.
- **Icons:** 0.75 opacity at rest, 1.0 on active/hover — no separate icon-chip surface.

### Student Tile (signature component)
- Screen-preview tile: 96px preview region over a true-black backdrop, status badge pinned top-right, status-tinted border and subtle background wash matching the student's current state (idle = warning tint, submitted = success-tinted border, offline = dimmed with an 80%-opacity black scrim).
- Hover reveals an accent-info tint overlay only when the tile is clickable (teacher's full-screen view action).

## Do's and Don'ts

### Do:
- **Do** keep role accent and semantic status color on two completely separate palettes — never let a role's brand color double as a status meaning.
- **Do** default status communication to a tinted wash; reserve solid fill for present/absent/active-class decisive states only (The Solid-Means-Decisive Rule).
- **Do** convey elevation through the bg-surface → bg-elevated → bg-surface-3 lightness steps, not shadows (The Flat-By-Default Rule).
- **Do** use `.tnum` tabular-nums for any column of digits (timers, scores, timestamps) instead of introducing a monospace font.
- **Do** gate every non-essential animation behind a `prefers-reduced-motion` fallback, as every existing motion utility already does.
- **Do** use a content-shaped skeleton with a shimmer sweep (`.skeleton-shimmer`) for initial page/section data loading, not a spinner — a spinner is reserved for an in-flight action (submitting, sending, running code), a skeleton for "this content is on its way."

### Don't:
- **Don't** add a light theme or theme toggle — dark is the only mode this app renders, by direct product decision.
- **Don't** introduce drop shadows on cards/tiles at rest, or use elevation for anything but modals and focus rings.
- **Don't** hardcode a role's hex value into a shared primitive (Button, Badge, Card, nav) — read `--accent-*` so the component stays role-portable.
- **Don't** add decorative or looping motion outside status communication or the skeleton-loading sweep (no idle shimmer as decoration, no marketing-style parallax) — this is an Operate-mode instrument, not a Persuade surface. The skeleton shimmer is the one sanctioned exception: it is bounded to actual load time, not truly idle, and communicates state rather than decorating it.
- **Don't** introduce a second typeface for numerals or code-like content; use Inter + tabular-nums.
