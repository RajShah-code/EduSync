# Teacher Portal — Design Alignment Plan (Step 3)

Component-by-component change plan, one section per page, ordered by priority. Every change references a named pattern from `docs/DESIGN_SYSTEM.md` (§ numbers below match that doc). Nothing here is implemented yet — this is the plan to sign off on before Step 4.

**Shorthand used throughout:**
- **Pill Button (§4)** — `rounded-full`, 150ms `ease-out-strong` color/opacity transition + `active:scale(0.95–0.97)` (`btn-press` utility), no lift/translate, no glow.
- **Notched Input (§3)** — bordered wrapper (`border-text-muted` default → `focus-within:border-accent-info`, no box-shadow/ring), icon straddling the top border, 46px height / 12px radius for text fields.
- **Modal Shell (§2)** — `bg-bg-surface`, `rounded-[27px]`, `shadow-[var(--shadow-modal)]`, `DialogTitle` led by an 18px line icon tinted `text-accent-500`, no icon container/chip.
- **Filter Pill (§5)** — `rounded-full`, `icon + label + <span class="…__div">|</span> + count`, inactive `border-border`/`text-secondary`, active fill `#673fa6` (matches `.sm-seg`/`.ta-filter`).
- **Radius scale (§1)** — `--radius-sm 6px` / `--radius-md 8px` / `--radius-lg 12px` / `--radius-pill 999px`, plus the established size-tuned squircles (46px input → 12px, 35px control → 13–14px, ~80px card → ~19–20px, modal → 27px).
- **Type scale (§7)** — h1 28px/500, h2 20px/500, h3 16px/500, body 14px/400, label 12px/500, caption 11px.
- **No-glow rule** — any `focus-visible:ring-*`/box-shadow on an input or button is a defect; replace with the Notched Input's border-color-only focus.

---

## 1. Task Manager — `TaskAssignment.jsx`, `TaskAssignment.css`, `CreateTaskDialog.jsx`

**Keep as-is (already correct):** `.ta-tabs`/`.ta-tab` strip, `.ta-filters`/`.ta-filter` bar (already the Filter Pill pattern, `#673fa6` active fill), `.tc-card` student cards, the Setup-Modal-style shell on `CreateTaskDialog`'s `DialogContent` (`rounded-[27px]`, icon-led title).

**Change:**
1. `CreateTaskDialog.jsx` Title / Description / Duration fields (lines 87-154) — replace shadcn `<Input>`/`<Textarea>` with the **Notched Input** pattern. Reuse `ExamCreation.jsx`'s existing `NotchedField` component (it already ports this pattern faithfully — extract it to a shared component, e.g. `components/NotchedField.jsx`, rather than re-deriving it) instead of hand-rolling a second copy. Keep the current `FieldLegend` icon-and-hairline row *above* the language-chip group (no input there to notch), but the three real text/number inputs should get the bordered notch + no-glow focus.
2. `CreateTaskDialog.jsx` language chips (114-133) — leave shape as-is (`rounded-[var(--radius-sm)]`, a legitimate small-toggle-chip variant distinct from the Setup Modal's larger class chips); this is a different control, not a defect — no change needed unless you want visual parity with the Setup Modal's `rounded-[10px]` class chips, in which case bump to `--radius-sm` → `10px` custom value.
3. `TaskAssignment.jsx` page header (745) — `text-2xl font-semibold` → `text-[length:var(--text-xl)] font-medium` to match the h1 token (28px/500).
4. Expired Task Alert box (774-801) — swap the shadcn `<Input type="number">` minutes field for a compact Notched Input variant (or at minimum strip its default ring and apply border-text-muted → focus-within:border-accent-info); swap `Extend`/`Lock & Move On` `<Button>`s from `rounded-md` defaults to **Pill Button**.
5. "No tasks yet" Create Task button (835-842), "Try again" (813-820), "Retry" (975-982), End Task button (955-963) — all shadcn `<Button>` → **Pill Button** (`rounded-full` + `btn-press`), keeping their existing color tokens (`bg-accent-info`, `border-accent-critical`, etc.).

---

## 2. Teacher Settings — `TeacherSettings.jsx`

1. All `<Input>` fields (name/email/password ×3, lines 230, 243, 282, 295, 308) — remove default shadcn ring, apply **Notched Input** border pattern (`border-text-muted` → `focus-within:border-accent-info`, no ring). This is the file's single biggest defect.
2. `Save Changes` / `Update Password` buttons (255-261, 325-331) → **Pill Button**.
3. `Restart tour` / `Sign out` buttons (362-371, 386-395) → **Pill Button** (outline variant kept, just pill radius + `btn-press`).
4. `Card`/`CardHeader`/`CardContent` panels (215, 267) — swap default shadcn card radius for `--radius-lg` (12px) to match the rest of the app's panel radius; the App Tour/Sign Out rows (352, 376) already do this correctly — make the profile/password cards match them.
5. h1/h2 (178, 198, 211, 341) — `font-semibold` → `font-medium` (Type scale).

---

## 3. Submission Review — `SubmissionReview.jsx`

1. Page header (123) — currently `text-sm font-bold uppercase tracking-wider` (reads as a label). Change to the h1 token (28px/500) or, if a compact in-panel header is intended, h2 (20px/500) — pick one; recommend h2 since this page is reached as a sub-view, not a top-level destination.
2. Back / Refresh / Try again / Save Score buttons — shadcn `<Button>` defaults → **Pill Button**.
3. Score `<Input>` (309-319) — remove `focus-visible:ring-accent-info` glow, apply **Notched Input** border pattern.
4. Selected-submission sidebar row's `border-l-4` accent stripe (224) — replace with the reference's established selected-state treatment: border-color brighten to `--accent-500` + background shift (matching `.tc-card`/`.st-card` hover/selected conventions), not a colored side-rail (no precedent for side-rails anywhere in the reference pages).

---

## 4. Timetable Setup — `TimetableSetup.jsx`

1. Hand-rolled modal `<div>` overlays (1085, 1361) — replace with the shared `Dialog`/`DialogContent` component, styled with the **Modal Shell** (`rounded-[27px]`, `shadow-[var(--shadow-modal)]`, `bg-bg-surface`), matching Setup Modal / CreateTaskDialog conventions. Modal titles (1093, 1368) get a leading 18px line icon (e.g. `IconCalendarStats` or similar, tinted `text-accent-500`) ahead of the text, matching `DialogTitle`'s icon-led convention.
2. All form inputs inside those modals (1119, 1150, 1171, 1228, 1240, 1255) — consolidate the mixed shadcn/raw-`<input>` implementations into one **Notched Input** treatment; strip every `focus-visible:ring-2`/glow.
3. Day-select buttons (~1190, 1206) — keep as a distinct toggle-chip control (not a pill button — these are multi-select day toggles, closer to the Setup Modal's class chips), but standardize radius to a single token (`--radius-sm`, 6px, or the class-chip's `10px` custom value) instead of the current generic `rounded-lg`.
4. Reminder/pill toggles (967, 983, 993) — already correct (`--radius-pill` + `active:scale`); no change.
5. All remaining buttons (659, 670, 683, 710, 722, 1036, 1306, 1313, 1422) — strip `focus-visible:ring-2` glow, convert to **Pill Button**.
6. h1 (font-bold/700) → font-medium/500 (Type scale).
7. **Calendar/week-grid layout** (~734-900) — ambiguous component, no reference precedent. Extrapolated treatment (flagged as such, not verified): day-of-week header cells as flat text labels (Type scale, label size, `text-secondary`) over a hairline `--border` grid; entry blocks as small cards using the card radius family (`--radius-md`, 8px, given their small size relative to a full roster card) with `bg-bg-surface`/`border-border` at rest and `border-accent-500` on hover/selected (matching `.card-hover`'s border-brighten-only rule — no fill change, no shadow). Add/edit/delete affordances on a cell: icon-only, `text-muted` → `text-primary` on hover, no icon-chip container (per the "no icon container" rule).

---

## 5. Active Exam — `ActiveExam.jsx`

1. Filter bar (558-587) — count currently rendered as a separate mini-badge chip; change to the plain `| count` text-in-pill format (literal `|` at 0.35 opacity, tabular-nums count) to match **Filter Pill** exactly.
2. Top-bar buttons — back arrow (436-444), End Exam / Results (492-514) → **Pill Button** (icon-only back button becomes a round pill/circle per the idle-pill-circle convention in §4; End Exam keeps its critical-red fill).
3. Student cards (65) and violation-summary/empty-state boxes (403, 522, 609) — `rounded-[var(--radius-lg)]` (12px) → bump to the card-family squircle (~18-20px, matching `.tc-card`/`.st-card`) since these are card-grid-sized elements, not small controls.
4. `AttemptDetailModal` (143) → **Modal Shell** (27px radius, `shadow-[var(--shadow-modal)]`), header gets an icon-led title (e.g. a student/file icon) instead of avatar+name only.
5. `AlertDialogContent` (627) → **Modal Shell** treatment (already used correctly on `LiveBroadcast.jsx`'s own `AlertDialogContent` — copy that exact className pattern).
6. Timer pill (459-472) — already correct, no change.

---

## 6. Exam Results — `ExamResults.jsx`

1. Page header (538) — `text-2xl font-semibold` → h1 token (28px/500).
2. Back button (528-536) → **Pill Button** (icon-only circle).
3. Summary stat tiles (564-571) and result rows (631) — keep as flat containers but move to `--radius-lg` consistently (currently already `--radius-lg`, verify no stray defaults slipped in); row hover (636, `hover:bg-bg-base/50`) → switch to the reference's `.card-hover` border-brighten-only convention (no background tint on hover).
4. `CodeAnswerGradeModal` (238) → **Modal Shell** (27px, not 12px); header (248) gets an icon-led `DialogTitle` instead of plain `<h2>` text.
5. Score `<Input>` (359) → **Notched Input**, no ring glow.
6. Save Score button (370) → **Pill Button**.
7. **Bar chart** (581-611) — ambiguous, extrapolated: card container `bg-bg-surface border-border rounded-[var(--radius-lg)]`, no shadow; bars colored from the accent scale (`--accent-500`/`--accent-success`/`--accent-warning`/`--accent-critical` per series, consistent with Analytics' existing correct practice of pulling chart colors from CSS vars); tooltip styled like `TooltipContent` (`bg-bg-elevated`, `--radius-lg`, `--shadow-modal`).
8. **Accordion-row results list** (629-789) — ambiguous, extrapolated: keep as a list (not converted to a card grid, since results are inherently row-like/tabular data unlike a student roster), but each row adopts `.card-hover`'s border-brighten-only hover and a `--radius-md` (8px) container instead of a heavier box; expand/collapse chevron as a plain line icon, no chip.

---

## 7. Attendance — `Attendance.jsx`

1. "Export CSV" (207) and "Mark Present" (336-348) buttons → **Pill Button**; give the primary export/mark action an `--accent-500` icon tint per the reference's icon-tint convention.
2. Session `<Select>` (238) — restyle trigger to match the reference's bordered-control language (`border-border-hover`, `bg-bg-surface`, no default shadcn ring); this is a Select, not a text input, so it doesn't need the full Notched Input treatment, but should drop any default focus ring for a border-color change instead.
3. Table container (218-232) and session-selector/stats panel (227) → `--radius-lg` (12px) instead of generic `rounded-lg`.
4. Present/Absent stats (248-262) — convert from plain text-with-divider to **Filter Pill**-styled chips (even if non-interactive/display-only, reuse the same visual chip: icon + label + `|` + tabular count) for consistency with Monitor's count-chip pattern.
5. h1 (202) — `font-semibold` → `font-medium` (Type scale).
6. **Table** (the roster/attendance grid itself) — ambiguous, extrapolated: since this is genuinely tabular per-session data (not a roster-of-cards like Monitor), keep it as a table but style header row as caption-scale (`text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted`, matching the Setup Modal's section-eyebrow style) and row hover with `.table-row-hover`'s existing utility (`theme.css:542`) rather than inventing a new hover.

---

## 8. Analytics — `Analytics.jsx`

1. All card/panel radii (24, 33, 41, 309, 323, 337, 357, 374, 419, 473) — generic `rounded-lg` → `--radius-lg` (12px) token, consistently.
2. "Try again" / error-retry buttons (212) → **Pill Button**.
3. Class-picker dropdown (242, 260) — already correctly tokenized (`--radius-md`, `--shadow-modal`, `bg-bg-elevated`); no change.
4. Risk-level badge (527) — `rounded-sm` → `--radius-pill` to read as a proper status chip, consistent with `StatusBadge` elsewhere.
5. Table headers (478) — `text-xs font-medium uppercase tracking-wider` → match the caption convention exactly (`text-[11px] font-semibold uppercase tracking-[0.08em]`).
6. h1 (206, 226) — `font-semibold` → `font-medium`.
7. **KPI/stat-number tiles** — ambiguous, extrapolated: large number in `text-[length:var(--text-2xl)] font-medium tabular-nums text-text-primary` (not `font-bold` — the system never uses 700 weight for numbers, e.g. session timer is `font-semibold`/600 at most), label beneath in caption scale (`text-text-muted`), tile container `bg-bg-surface border-border rounded-[var(--radius-lg)]`, no shadow.
8. **Line/Bar charts** — same extrapolated treatment as Exam Results' bar chart (§6.7): token-driven series colors (already done here, keep it), card container on `--radius-lg`, no shadow, `TooltipContent`-style tooltip.
9. **Data table** — same extrapolated treatment as Attendance's table (§7.6): caption-scale header, `.table-row-hover` for rows.

---

## 9. Session Recording — `SessionRecording.jsx`

1. Row-action buttons (231, 248, 261) → **Pill Button**.
2. Pagination arrows (297-317) — keep `--radius-sm` (already correct token), add `active:scale` press to match `btn-press` convention.
3. h1 (131) — `font-semibold` → `font-medium`.
4. Empty-state icon (158) — remove the circular icon-chip container (`rounded-full bg-bg-elevated border`); reference pages never wrap an icon in its own chip — render the icon bare and larger instead (matching Monitor's empty-state `.sm-state svg`, 56×56px, `text-text-muted`, no container).
5. Header stats bar (131-152) — already uses `label | count`-style dividers correctly; no change.

---

## 10. Teacher Dashboard — `TeacherDashboard.jsx`

Mostly aligned already (correct radius/color/spacing tokens throughout). Only change:
1. Start Lecture (327-333), End Lecture (317-325), Start Now (503-508), Monitor Students, Set Up Timetable, "Not yet time" buttons — shadcn `<Button>` (`rounded-md`) → **Pill Button**.
2. "Start Now" button's raw `bg-[#621e9e]` (503) → `bg-accent-700` (the actual token this hex is approximating).

---

## 11. Exam Creation — `ExamCreation.jsx`

Already faithfully ported (27px modal, 12px/46px `NotchedField`, `PillButton`, `btn-press` — this is in fact the *second* reference-quality implementation of the pattern besides Live Lecture, and Task Manager's `CreateTaskDialog` should borrow from it per §1.1 above). Only fix:
1. Manage Exams search box (1754-1760) — swap raw shadcn `<Input>` for the file's own `NotchedField` component (used correctly everywhere else in this same file).
2. QuestionComposer "Marks" input (578-585) — same fix, use `NotchedField`.
3. Row action button in `ExamManageRow` (322-338) → **Pill Button** (shared gap with Task Manager's row actions).
4. Create/Manage mode toggle (1172-1199) — currently a rounded-rectangle segmented control with the count folded into the label text ("Manage Exams (12)"). Recommend converting to the **Filter Pill** `label | count` format to match this same file's own filter chips 60 lines later — but flagging this as a judgment call since a page-mode toggle is arguably a different control class than a status filter. Proceed with the conversion for consistency unless you'd rather leave the toggle as its own distinct pattern.

---

## Cross-page notes

- **Shared extraction recommended**: `NotchedField` (from `ExamCreation.jsx`) should become a real shared component (e.g. `components/NotchedField.jsx`) rather than living duplicated across `ExamCreation.jsx` and reimplemented ad hoc in `CreateTaskDialog.jsx`/`TimetableSetup.jsx`/`TeacherSettings.jsx`/`SubmissionReview.jsx`/`ExamResults.jsx`/`Attendance.jsx`. This isn't a new dependency — it's deduplicating an existing, already-correct implementation, in line with the "reuse existing components/tokens wherever possible" guardrail.
- **`btn-press` + Pill Button** should likewise be applied via the existing `.btn-press` utility class (`theme.css:460`) rather than one-off `active:scale` rules, wherever a button converts to pill shape.
- Every `font-semibold` (600) page `<h1>` across pages (Task Manager, Settings, Submission Review, Analytics, Attendance, Session Recording, Timetable) shares the same one-line fix: → `font-medium` (500), to match the token. Flagging once here since it recurs on nearly every page.
