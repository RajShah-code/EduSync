# EduSync Session Context

A full record of the work done in this session, in roughly chronological order. Written as a handoff document for future sessions/contributors.

---

## 1. Tooling setup

- Installed skill packs via `npx skills add`: `Leonxlnx/taste-skill` (13 skills — design-taste-frontend, brandkit, imagegen-*, etc.) and `emilkowalski/skill` (12 skills — animate, apple-design, ask-sonner, emil-design-eng, etc.). Both symlinked into `.claude/skills/`.
- `npx impeccable install` — already present and up to date (v4.1.1).
- The **impeccable** skill became the primary tool used for the rest of the session (`/impeccable <command> [target]`).

## 2. `/impeccable init` — PRODUCT.md

Created `PRODUCT.md` at the repo root by reading the existing PRD (`PRD_Smart_Teaching_Lab_Management_Platform.md`), `README.md`, and the codebase, then confirming a few gaps with the user:
- EduSync is a **generic product**, not built for one specific institution (even though the driving use case is one BCA department).
- **No accessibility mandate** exists yet — left as an open decision, not invented.
- The PRD (Aug 2026, v1.3) was confirmed as current.

Key durable facts captured: Teacher/Student/Admin roles with strictly separate dashboards; the core mechanism is **attendance derived from real-time activity signals + anti-cheat + exam lockdown**, not a bolted-on proctoring tool; desktop-lab is the primary target (not mobile-first); real-time reliability is a stated priority; Session Recording and Secure Exam Mode are marked complete per the PRD; the Admin module and a future Windows-domain-login attendance capability are explicitly **not yet built**.

## 3. `/impeccable document` — DESIGN.md ("The Night Lab")

Generated `DESIGN.md` + `.impeccable/design.json` sidecar by scanning `Frontend/src/styles/theme.css` and representative components. Confirmed with the user:
- **North Star**: "The Night Lab" (true-black base, dark-only, no light-mode toggle).
- **Component philosophy**: "Quiet until it matters" — status color washes by default, solid fill reserved for decisive present/absent/active states (the "Solid-Means-Decisive Rule").
- **Color naming**: role + hue descriptor (e.g. "Student Orange," "Teacher Royal Violet," "Admin Ink Blue").

Documented the **role-accent architecture**: one shared `--accent-*` slot (`--accent-50/300/500/700/900`) re-scoped per role via `[data-role="student"|"teacher"|"admin"]`, kept strictly separate from the fixed semantic status palette (success/warning/critical/locked). Documented `StatusBadge` and `StudentTile` as signature shared components, the Flat-By-Default Rule (no shadows on cards/tiles at rest — only modals and focus rings get real shadows), and the No-Mono Rule (Inter + `.tnum` tabular-nums for aligned digits, never a second monospace typeface).

## 4. Whole-app audit (`/impeccable audit`, no target)

Scored **15/20 (Good)**. Detector (`detect-antipatterns.mjs`) found only 2 issues app-wide: a `border-l-4` side-tab pattern in `SubmissionReview.jsx` (later judged a defensible functional list-selection indicator, not decorative — repeatedly re-confirmed and suppressed via `ignore-value` across the session) and an "overused font" (Inter) false positive, since Inter was a deliberate, documented choice for this Operate-mode instrument.

Real findings fixed at the time:
- `StudentTile.jsx`: the teacher's core click target for viewing a student's screen was a bare `<div onClick>` with no keyboard path (WCAG 2.1.1/4.1.2). Converted to a real `<button>` when interactive, added `aria-label`, focus-visible ring, an `onError` fallback for a dead screen-preview image, and a missing-name fallback.
- `AdminUsers.jsx`: fixed a broken color token (`bg-accent-danger` didn't exist — silently unstyled; replaced with `accent-critical`), added `aria-label` to 9 icon-only buttons, added double-submission guards (Create/Edit/Reset/Delete forms), fixed a clipboard-copy that reported success even when it failed.

## 5. Deep design work on `AttendanceHistory.jsx` (student)

Full cycle: `/impeccable critique` → dual-agent review (design + detector/evidence) scored **26/40 (Acceptable)**. Found and fixed, across several follow-up turns:
- **[P0]** Silent fetch failure rendered identically to "zero attendance records" — added a real `error` state distinct from the empty state, with a retry button.
- **[P1]** The filter bar (6 controls always visible) violated the system's own "quiet until it matters" restraint — collapsed behind a disclosure, later reopened to default-open per a direct user instruction that reversed part of this fix (the brief wins).
- **[P2]** "Partial" status was unreachable in the status filter — added.
- **[P3]** Date column missing `.tnum` — added.
- A `/impeccable polish` follow-up added focus-visible rings to every button in the file, a chevron disclosure indicator, and wrapped the table in `overflow-x-auto` (was clipping, not scrolling, on narrow viewports).
- Later, on direct instruction: floating (inset) dividers between the 4 stat tiles instead of edge-to-edge; improved the present/absent colors (see §7).

## 6. Loading-state rollout (skeleton-shimmer pattern)

Fetched a design-system artifact (`claude.ai/code/artifact/95ab2afb-...`) whose decided loading-state pattern is a **content-shaped skeleton with a shimmer sweep**, not a spinner. Built this into the shared system:
- `.skeleton-shimmer` CSS utility + `@keyframes skeleton-shimmer` in `theme.css` (1.6s linear-gradient sweep, respects `prefers-reduced-motion`).
- The shared `Skeleton` component (`Frontend/src/app/components/ui/skeleton.jsx`) switched from generic shadcn `animate-pulse` to this pattern.
- Documented as a sanctioned rule in `DESIGN.md`'s Do's/Don'ts (had to reconcile this against an existing "no idle shimmer" ban — the skeleton sweep is the one confirmed exception, since it's bounded to actual load time and communicates state rather than decorating it).

Rolled out across **every page in both `pages/student/` and `pages/teacher/`**, converting genuine "waiting for page/section data" states to shaped skeletons while correctly leaving in-flight action spinners alone (submitting, sending email, running code, connecting a WebRTC broadcast, loading Pyodide). Along the way, found and fixed several instances of the **same silent-fetch-failure bug** (data.length===0 rendering identically to a failed fetch) in files that hadn't been touched yet: `TaskWorkspace.jsx`, `StudentSettings.jsx`, `StudentDashboard.jsx`, `TeacherSettings.jsx`, `Analytics.jsx`, `StudentMonitor.jsx`, `TeacherDashboard.jsx`.

## 7. Color-token fixes

- **Contrast fix**: `--accent-critical` (`#9A0000`) had only ~2.3:1 contrast against the true-black `--bg-base` as direct text — failed WCAG even for large text. Replaced with `#DC2626`; `--accent-success`/`--accent-live` brightened from `#3B8132` to `#15803D` for parity. Updated `DESIGN.md` and the sidecar to match.
- **Badge shape fix**: `StatusBadge` used `radius-sm` (a rectangle) despite DESIGN.md's own Shapes section calling for `radius-pill` ("fully-rounded status tags"). Fixed the component (and its sidecar HTML/CSS snippets) to match.
- **The real role-color bug**: only `StudentLayout.jsx` set `data-role="student"`; `TeacherLayout.jsx` and `AdminLayout.jsx` had no `data-role` attribute at all, so both silently fell through to the `:root` fallback (hardcoded to Student Orange) — **every teacher/admin page had been rendering with the student's orange accent**. Fixed by adding `data-role="teacher"`/`"admin"` to both layouts' root wrapper divs.
- **The deeper alias bug**, found only by building an isolated CSS test harness (loaded the real `theme.css` in headless Puppeteer, read actual computed custom-property values per role — reasoning about CSS cascade rules in the abstract had been wrong): `--primary`, `--ring`, `--chart-1`, and `--accent-info` were declared **only once, at `:root`**, and a CSS custom property inherits its *computed* value, not a live reference — so these four aliases froze permanently to the student/orange fallback and never re-resolved inside `[data-role="teacher"]`/`[data-role="admin"]`, even though `--accent-500`/`--accent-700` themselves resolved correctly. This explained why Task/Exam pages (heavy users of the default `<Button>` variant, which uses `bg-primary`, and the global focus ring, which uses `--ring`) still looked orange after the layout fix. Fixed by redeclaring all four aliases inside each `[data-role]` block. **Verified empirically** with a before/after Puppeteer computed-style check, not just re-reading the code.

## 8. Whole-folder critique + fix cycles (student, then teacher)

Ran the same dual-agent `/impeccable critique` pattern on entire folders (not just single files) — Assessment A (design review) and Assessment B (detector + manual evidence) as isolated parallel forks, synthesized into one report.

**Student folder**: not separately critiqued as a whole; individual pages were critiqued/polished/hardened one at a time (see §5 for `AttendanceHistory.jsx`; `StudentDashboard.jsx` also got a deep pass that found and removed **fabricated fallback stats** — `total: totalLectures || 12`, `present: ... || 11`, `rate: ... : "91.7"` — that displayed fake numbers as real data on every page load before the real fetch resolved, and permanently for a student with genuinely zero sessions).

**Teacher folder** (`Frontend/src/app/pages/teacher`, 14 files): scored **29/40 (Good)**. Priority issues found and fixed across parallel fix passes:
- **[P0]** Zero `aria-label`/`role=` attributes anywhere in the folder (verified: 0 occurrences across ~9,000 lines) — fixed across `StudentMonitor.jsx`, `TimetableSetup.jsx`, `ExamCreation.jsx`, `LiveBroadcast.jsx` (8 icon-only controls in the last one alone).
- **[P1]** `TimetableSetup.jsx` broke the Flat-By-Default Rule (`shadow-lg`/`shadow-2xl`/`shadow-md` at rest, plus a generic `animate-pulse`) — stripped, replaced with the project's own `.pulse-dot`.
- **[P1]** `TeacherSettings.jsx` used a hardcoded `emerald-*` palette and shadcn-default classes instead of real tokens — replaced with `accent-info`/`accent-700` and the app's actual text/surface tokens, matching `StudentSettings.jsx` as reference.
- **[P1]** `Analytics.jsx` hardcoded 8 hex chart colors and used `"JetBrains Mono"` on chart labels (a real No-Mono Rule violation, since this is UI label text, not a code editor) — retokenized to `var(--token)` references and switched to Inter + `.tnum`.
- **[P1]** Silent fetch failures in `Analytics.jsx`, `StudentMonitor.jsx`, `TeacherDashboard.jsx` — fixed with real error states + retry, matching `TeacherSettings.jsx`'s existing correct pattern.
- **[P2]** Inconsistent confirm pattern (`ActiveExam.jsx`'s `window.confirm()` vs. `LiveBroadcast.jsx`'s themed `AlertDialog`) — converted `ActiveExam.jsx` to the same `AlertDialog`.
- **[P2]** `LiveBroadcast.jsx`'s live control bar gave the destructive "End" action the same visual weight as toggling the mic — regrouped the reversible toggles, added a divider, isolated "End."

Then ran a full `/impeccable layout` pass across all 14 teacher files (mirroring an earlier pass already done on the student folder), fixing: floating vs. edge-to-edge dividers, missing `overflow-x-auto` on 2 tables, inconsistent border-radius (`rounded-2xl` vs. the file's own `rounded-xl`, bare `rounded-lg` vs. the project's `--radius-*` tokens), a hand-rolled status pill duplicating `StatusBadge`, and a `TeacherSettings.jsx` layout inconsistency versus its own direct sibling `StudentSettings.jsx` (cards stacked full-width instead of side-by-side).

## 9. Working conventions established this session

- **Parallel forks for large-scope work**: whenever a task spanned many/large files (folder-wide polish, critique, layout, or the loading-state rollout), split by file ownership and dispatch parallel `fork` subagents (inherits full session context, shares prompt cache) rather than working through files serially or using fresh general-purpose agents. Always followed with a final `esbuild` sweep across every touched file and a `git status`/`git diff` spot-check — once, a fork's final report was garbled ("Correcting course...") and its actual changes were verified directly via `git diff` rather than trusted blindly.
- **Skeleton vs. spinner**: skeleton for "content hasn't loaded yet," spinner for "an action is in flight" (submit, send, run, connect). Never conflate the two.
- **Never fabricate fallback data**: `someValue || 12`-style placeholders that can display as real data are a P0-class bug, found multiple times across the app.
- **Silent fetch failures are the same bug class every time**: a failed fetch must never render identically to a genuine empty state — always a distinct `error` state with retry.
- **`ignore-value` discipline**: pre-existing findings (e.g. the app-wide `10px`/`11px` micro-text convention, or a keyframe color untouched by an edit) get a narrowly-scoped, disclosed `ignore-value` suppression — never `ignore-rule`/`ignore-file`, and never to push through something actually wrong.
- **The brief wins**: when the user gave a direct instruction that reversed an earlier design-review-driven fix (e.g. reopening the attendance-page filter bar by default), it was honored transparently rather than re-litigated.
- **Verify empirically when reasoning gets uncertain**: the role-color alias bug (§7) was only found by actually testing computed CSS values in a headless browser, after an initial (incorrect) purely-reasoned analysis had concluded the code was already correct.

## 10. Known open items (not yet actioned)

- `SessionRecording.jsx` is a permanent, unconditional empty state for a feature `PRODUCT.md` marks "complete" — flagged as a possible dead-end nav destination, not fixed.
- No bulk actions anywhere at scale (mark-all-present, saved exam templates, bulk task extension) — noted as a real gap, out of scope for design-polish passes.
- `Analytics.jsx`/`Attendance.jsx` still use `font-mono` instead of `.tnum` on some numeric table cells (a typography-token issue distinct from the layout pass that touched these files).
- `TaskWorkspace.jsx`'s fixed `w-64` sidebar and `CodeEditor.jsx`'s IDE panels have no responsive collapse below ~700-800px — flagged as `/impeccable adapt` territory, not touched.
- Several fixed-width summary grids (`ActiveExam.jsx`, `ExamResults.jsx`) have no responsive breakpoints — consistent with the desktop-lab-first product scope, left as-is.
- No live-browser/manual QA has been performed on any of this session's changes — everything was verified via `esbuild` syntax checks, the design hook, and (for the color bug) an isolated headless-browser CSS test. A real click-through in a running app (with backend + Postgres + a teacher/admin/student login) is still outstanding.
