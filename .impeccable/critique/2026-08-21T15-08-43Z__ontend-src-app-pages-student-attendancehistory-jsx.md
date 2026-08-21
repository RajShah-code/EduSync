---
target: Frontend/src/app/pages/student/AttendanceHistory.jsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-08-21T15-08-43Z
slug: ontend-src-app-pages-student-attendancehistory-jsx
---
Method: dual-agent (A: a1bede529370515fa · B: a96b60c0afeea08a2)

## Design Health Score

| # | Heuristic | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 3 | Loading spinner + socket refresh present, but no signal for when data last refreshed |
| 2 | Match System / Real World | 3 | Natural labels; "Total Sessions" UI label vs. totalLectures internal name is a minor seam |
| 3 | User Control and Freedom | 2 | Filters + Reset exist, but no escape hatch once a record shows ABSENT |
| 4 | Consistency and Standards | 4 | Correctly reuses StatusBadge, tokens, .tnum, hairline-card pattern |
| 5 | Error Prevention | 2 | Malformed/expired JWT and malformed API payload both fall through with zero guardrails |
| 6 | Recognition Rather Than Recall | 3 | Filter dropdowns show live counts; no active-filter chip summary |
| 7 | Flexibility and Efficiency | 2 | Rows-per-page, sort, filters cover baseline; no export, saved views, shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, on-token; filter bar (6 controls in one row) undercuts "quiet until it matters" |
| 9 | Error Recovery | 1 | Fetch failure swallowed to console.error; UI shows same empty state as zero real records |
| 10 | Help and Documentation | 3 | AppTour is a genuine contextual-help mechanism scoped to this exact page |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

LLM assessment: Authored where it counts most (StatusBadge reuse, semantic/role token discipline, .tnum), generic where it counts least (stock filter-bar chrome, boilerplate empty/loading states).

Deterministic scan: detect-antipatterns.mjs exit 0, zero findings. Manual grep confirmed no hardcoded hex/raw Tailwind colors, semantic table markup, aria-labels on pagination. One verifiable gap: date column (line 322) is the one numeric/date element missing .tnum, unlike every other numeric element in the file.

Visual overlays: N/A — static source file, no live URL, browser injection skipped per protocol.

## Overall Impression

Solid technical citizenship of the design system, let down by treating a high-stakes page (a student checking whether they're marked absent) like a generic data table. The core UX problem isn't visual — it's informational honesty and reassurance: "the server is down" and "you have perfect attendance" currently render identically.

## What's Working

- Correct StatusBadge reuse (line 340) — no hardcoded status colors.
- .tnum discipline on stats/pagination, showing real internalization of the No-Mono Rule.
- Thoughtful pagination-reset effect with an explanatory comment for a real edge case.

## Priority Issues

[P0] Silent fetch failure produces a false-negative empty state
- Location: lines 54-58 (catch), 408-417 (empty state)
- Why it matters: failed request and zero real records render identically ("You haven't attended any lab sessions yet") — worst failure mode for a trust-critical page.
- Fix: add a distinct error state with retry; never conflate "zero records" with "request failed."
- Suggested command: /impeccable harden

[P0] No context or dispute path for an unexpected ABSENT
- Location: table rows ~314-350, StatusBadge usage at 340
- Why it matters: PRODUCT.md documents attendance is auto-derived from activity signals, so false positives are foreseeable — yet there's no way to see why a session was marked absent or flag it.
- Fix: make the row/badge open a detail view (join time, activity duration, exit count).
- Suggested command: /impeccable onboard or /impeccable clarify

[P1] Filter bar violates the system's own restraint and working-memory guidance
- Location: lines 185-290 (4 filters + sort + reset), rows-per-page split off separately at 359-373
- Why it matters: six decision axes visible on first load contradicts "quiet until it matters" and fails the cognitive-load ≤4-choices/chunking checks.
- Fix: collapse filters behind a disclosure, or hide below a record-count threshold; co-locate view controls (sort, page size) separately from filter controls.
- Suggested command: /impeccable distill

[P2] "Partial" status is invisible in the filter UI
- Location: Status filter options ~253-256 vs. StatusBadge's defined partial status
- Why it matters: a student with a partial record can never isolate it via the filter — exactly the ambiguous case they'd most want to find.
- Fix: add "Partial" as a filter option, consider inline explanation.
- Suggested command: /impeccable clarify

[P3] Date column missing .tnum
- Location: line 322
- Why it matters: the one inconsistency versus every other numeric/date element in the file.
- Fix: add tnum to the date cell's className.
- Suggested command: /impeccable polish

## Persona Red Flags

Jordan (First-Timer): would take the false-empty-state literally with no cue anything went wrong; 6-control filter bar on first load makes a "check my attendance" task feel more complex than it should.

Riley (Stress Tester): would discover the partial-status filter gap and force a network failure to find the P0 error-state gap firsthand.

## Minor Observations

- Reset Filters button uses hover:underline, a small deviation from DESIGN.md's documented Button vocabulary.
- totalLectures (variable) vs. "Total Sessions" (UI label) naming seam.
- Empty-state icon/copy is generic, could carry more of the page's instrumented voice.

## Questions to Consider

- Why do a failed request and a genuinely empty record currently look identical?
- Why does the filter UI make the partial status functionally unreachable?
- Is the 6-axis filter bar solving a real problem, or dashboard-pattern cargo-culting?
