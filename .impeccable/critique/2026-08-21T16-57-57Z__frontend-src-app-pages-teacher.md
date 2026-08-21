---
target: Frontend/src/app/pages/teacher
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-21T16-57-57Z
slug: frontend-src-app-pages-teacher
---
Method: dual-agent (A: aa767c9c3cc544058 · B: ae7ea16c19e72eee7)

## Design Health Score

| # | Heuristic | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 3 | Live-pulse badges, timers, socket-driven updates, skeletons everywhere; no persistent confirmation of mic/record state in LiveBroadcast |
| 2 | Match System / Real World | 4 | Vocabulary matches how a teacher actually thinks about a lab session |
| 3 | User Control and Freedom | 3 | Cancel/back paths exist; destructive actions split between native confirm() and themed AlertDialog inconsistently |
| 4 | Consistency and Standards | 3 | StatusBadge/StudentTile reused in 9 of 14 files; TimetableSetup, TeacherSettings, Analytics each break token/shadow/mono system differently |
| 5 | Error Prevention | 3 | Good form-validity gating mostly; numeric exam-config inputs silently fall back to defaults on invalid entry |
| 6 | Recognition Rather Than Recall | 3 | TaskAssignment's live preview excellent; ExamCreation leans on recall more than needed |
| 7 | Flexibility and Efficiency | 2 | No bulk actions anywhere at scale |
| 8 | Aesthetic and Minimalist Design | 3 | Most pages restrained; LiveBroadcast control bar and TimetableSetup shadows undercut it |
| 9 | Error Recognition and Recovery | 3 | TeacherSettings has explicit retry; Analytics/Attendance/StudentMonitor/TeacherDashboard fail silently |
| 10 | Help and Documentation | 2 | Real replayable AppTour; no in-context help on one-way high-stakes actions |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

LLM assessment: Most of the surface is authored for "The Night Lab" — StatusBadge/StudentTile used correctly everywhere, true-black bases and hairline borders near-universal, real product thinking (TeacherDashboard's border-rail, TaskAssignment's Live Preview, LiveBroadcast's password-reveal chip). Breaks down hard in TimetableSetup.jsx (shadow-lg/2xl/md, animate-pulse — generic dashboard language) and TeacherSettings.jsx (hardcoded emerald-400/500/600 plus shadcn defaults instead of tokens).

Deterministic scan: exit 2, one finding (border-l-4 side-tab, SubmissionReview.jsx:203 — functional list-selection use, not decorative, same defensible pattern as AttendanceHistory.jsx earlier). Manual evidence found zero aria-label and zero role= attributes across all 14 files/~9000 lines, and zero .tnum/font-variant-numeric against 88 font-mono usages on exactly the numeric columns the No-Mono Rule targets — both verified systemic gaps.

Visual overlays: N/A — static source folder, no live URL.

## Overall Impression

A competently-built, genuinely product-specific teacher surface let down by two things: a handful of files that quietly drifted off the design system while the rest stayed disciplined, and a near-total absence of accessible names on interactive controls folder-wide.

## What's Working

- TaskAssignment.jsx's Live Preview panel (~314-405) — mirrors exactly what students see, best design thinking on the surface.
- StatusBadge/StudentTile discipline — implemented to spec, reused faithfully across 7+ files.
- TeacherDashboard.jsx's Today's Schedule widget — border-rail status language, honest two-tier empty states.

## Priority Issues

[P0] Zero accessible names anywhere in the folder
- Location: folder-wide, 0 aria-label/role=; StudentMonitor.jsx grid-size toggles (~165-184) have no aria-label or title at all.
- Why it matters: a screen-reader user gets no information on any icon-only control in the teacher app, worse than the student folder's equivalent gap fixed earlier this session.
- Fix: add aria-label to every icon-only element, starting with StudentMonitor's grid toggles.
- Suggested command: /impeccable harden

[P1] TimetableSetup.jsx breaks the Flat-By-Default Rule
- Location: lines 507, 521, 556, 593 (shadow-lg/md/2xl), line 618 (animate-pulse)
- Why it matters: DESIGN.md explicitly bans drop shadows on cards/tiles at rest.
- Fix: strip shadow-* utilities, rely on bg-surface/bg-elevated steps.
- Suggested command: /impeccable polish

[P1] TeacherSettings.jsx uses an uncoordinated, hardcoded palette
- Location: lines 276, 289 (emerald-400/600/500) plus shadcn defaults instead of real tokens
- Why it matters: emerald reads as "success/live" to a user trained by the rest of the app's semantic palette.
- Fix: replace with accent-info or teacher role accent; swap shadcn-default classes for real tokens.
- Suggested command: /impeccable polish

[P1] Analytics.jsx hardcodes chart colors and violates the No-Mono Rule
- Location: lines 292-364, raw hex + fontFamily: "JetBrains Mono" on chart axis/tooltip text (UI label text, not a code editor)
- Why it matters: largest concentration of un-tokenized color in the folder.
- Fix: define chart color tokens, switch axis/tooltip type to Inter + .tnum.
- Suggested command: /impeccable polish

[P1] Silent fetch failures in Analytics.jsx, StudentMonitor.jsx, TeacherDashboard.jsx
- Why it matters: the exact false-negative-empty-state bug class already fixed in 4 student-folder files this session; TeacherSettings.jsx in this same folder already has the correct retry pattern to copy.
- Fix: add error/setError state to all three, matching TeacherSettings.jsx's pattern.
- Suggested command: /impeccable harden

[P2] Inconsistent confirmation pattern for irreversible actions
- Location: ActiveExam.jsx:133 (window.confirm()) vs LiveBroadcast's themed AlertDialog
- Fix: route all irreversible actions through the same AlertDialog component.
- Suggested command: /impeccable polish

[P2] LiveBroadcast's live control bar has no hierarchy
- Location: lines 2181-2284, 5 co-equal buttons, End differentiated only by red text
- Fix: visually separate End from toggleable controls.
- Suggested command: /impeccable layout

## Persona Red Flags

Alex (Power User): no "mark all present," saved exam templates, or bulk task-extension; 4 leftover console.log("[DEBUG]...") statements in LiveBroadcast's socket handlers.

Sam (Accessibility-Dependent): StudentMonitor's grid-size toggles are a complete dead end — no aria-label, no title, no visible text.

## Minor Observations

- accent-info used pervasively but undocumented as a named token in DESIGN.md.
- TaskProgress.jsx:449's "Extend" button uses text-black on bg-accent-warning, inconsistent with white-text-on-warning elsewhere.
- SessionRecording.jsx is a permanent empty state for a PRODUCT.md "complete" feature — reads as a dead-end nav destination.

## Questions to Consider

- What caused TimetableSetup.jsx and TeacherSettings.jsx to diverge from the otherwise-consistent StatusBadge/StudentTile discipline?
- Was the broadcast control bar's flat hierarchy ever designed as its own problem, given the PRD calls the dashboard "distraction-free"?
- Is SessionRecording.jsx legacy nav now that recording lives inside LiveBroadcast?
