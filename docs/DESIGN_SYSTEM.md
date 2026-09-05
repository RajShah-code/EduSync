# EduSync Teacher Portal — Design System (extracted from reference pages)

Reference sources only (not to be edited): `Frontend/src/app/pages/teacher/LiveBroadcast.jsx`, `Frontend/src/app/pages/teacher/StudentMonitor.jsx` + `StudentMonitor.css`, and the shared components they both use (`WaitingRoomBadge.jsx`, `StudentTile.css`). Global tokens live in `Frontend/src/styles/theme.css`.

Every value below is copied verbatim from those files. `file:line` points at the line it was read off.

---

## 1. Shape language — corner radii

Global scale, `Frontend/src/styles/theme.css:83-87`:

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | `6px` | tiny icon buttons, small chips (password-visibility button `LiveBroadcast.jsx:2972`, approve/deny buttons `WaitingRoomBadge.jsx:73,80`) |
| `--radius-md` | `8px` | default control radius, most bordered info boxes (`LiveBroadcast.jsx:2274`, `2966`, `WaitingRoomBadge.jsx:43,60`) |
| `--radius-lg` | `12px` | tooltips / larger popover surfaces (`LiveBroadcast.jsx:2642`) |
| `--radius-pill` | `999px` | fully-round pills/circles (`rounded-full` throughout) |

Beyond the token scale, the reference pages also use hand-picked "squircle" values that don't map onto the scale exactly — these are deliberate, size-tuned radii, not accidents:

- **Setup modal itself**: `rounded-[27px]` on `DialogContent` — `LiveBroadcast.jsx:3028`. Larger than any token; modals get their own oversized radius.
- **Setup-modal text inputs**: `borderRadius: '12px'` inline style, height `46px` — `LiveBroadcast.jsx:3053,3070,3087,3114`.
- **Class-chip buttons** (small toggle chips inside the modal): `rounded-[10px]`, height `28px` — `LiveBroadcast.jsx:3150`.
- **Live control-bar pills** (Mic/Record/Screen Share, height `35px`): `rounded-[13px]` — `LiveBroadcast.jsx:2783,2812,2837,2858`.
- **Status/timer chip** (height `35px`, not a full pill): `rounded-[14px]` — `LiveBroadcast.jsx:2722`.
- **Student Monitor grid cards** (`276.79 × 80.68`): `border-radius: 19.745px` — `StudentMonitor.css:20`.
- **Student Monitor loading skeleton** (mirrors the card): `border-radius: 19.745px` — `StudentMonitor.css:215`.
- **Student Monitor count chips** (`50×28.7`): `border-radius: 14px` — `StudentMonitor.css:68`.

**Rule of thumb observed**: radius tracks element height — roughly `radius ≈ height/3` for "squircle" controls (35px pill → 13–14px; 46px input → 12px; 80px card → ~20px), while fully circular/pill controls (buttons meant to read as capsules — Start/Instant/End, filter segments, badges) always use `rounded-full` (`radius-pill`, 999px) regardless of height.

## 2. Modal windows

- **Container**: `bg-bg-surface` (or `bg-bg-elevated` for the lower-frequency info dialog) + `border-border` + custom `rounded-[27px]` for the primary Setup Modal (`LiveBroadcast.jsx:3028`); the simpler info dialog uses the shared `DialogContent` default radius (`rounded-lg`, no override) — `LiveBroadcast.jsx:2939`.
- **Elevation**: `--shadow-modal: 0 4px 6px rgba(0,0,0,0.4), 0 24px 48px rgba(0,0,0,0.5)` (`theme.css:91`) — a soft, deep two-layer shadow, reserved for modals/overlays and the idle control-bar pill cluster (which reads as "floating"). Cards otherwise have **no shadow** (`--shadow-card: none`, `theme.css:90`).
- **Header icon**: a single line icon (Tabler `@tabler/icons-react`, `strokeWidth={1.75}`) at `18×18px`, tinted `text-accent-500`, sitting directly inline with the `DialogTitle` text — no icon container/chip around it. E.g. `<Monitor className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />` — `LiveBroadcast.jsx:3032-3035`; the lower-priority info dialog uses the same pattern but muted (`text-text-primary`, no accent tint) — `LiveBroadcast.jsx:2942`.
- **In-form icons** (per input, see §3) follow the same rule: line icons, `16×16px` (`w-4 h-4`), `strokeWidth={1.75}`, default `text-text-muted`, transitioning to `text-accent-info` on focus-within.

## 3. Input fields

Setup-modal text inputs, e.g. `LiveBroadcast.jsx:3053-3063`:

- **Default state**: `border border-solid border-text-muted` (i.e. border color = `--text-muted` = `#585C68`), `borderRadius: 12px`, height `46px`, transparent background, `transition-colors duration-150`.
- **Active/focused state**: `focus-within:border-accent-info` — border becomes `--accent-info`, which aliases `--accent-500` and, under `[data-role="teacher"]`, resolves to **`--teacher-500` = `#af74e5`** (`theme.css:52,171-176,195`). Border width stays `1px` (unchanged from default — only the color swaps).
- **No glow/shadow**: confirmed — no `box-shadow`/`ring` class appears anywhere on these input wrappers, only `transition-colors`. (Contrast with the *unrelated* generic `.input-focus` utility in `theme.css:568-573`, which does add a `box-shadow` ring — that utility is **not** used by the reference inputs and should not be copied.)
- **Label icon lives on the border**: each field's leading icon is absolutely positioned to straddle the top border line (`-translate-y-1/2`), painted with the modal's own background so it "notches" the border — `LiveBroadcast.jsx:3049-3052` and the surrounding comment explaining the technique.
- **Placeholder color**: `placeholder:text-text-muted`; typed value color: `text-text-primary`; text size `text-sm` (12px per `--text-sm`).
- **Password field**: same wrapper, adds a trailing show/hide icon button (`w-[18px] h-[18px]`, `text-text-muted` → `hover:text-text-secondary`) — `LiveBroadcast.jsx:3097-3105`.

## 4. Start/end action buttons (pill-shaped, with hover)

Two concrete instances, both fully pill (`rounded-full`):

**A. Idle "Instant"/"Schedule" pills** (`LiveBroadcast.jsx:2577-2710`):
- Shape: `h-9 rounded-full`, animated width via Motion (`minWidth: "2.25rem"` collapsed ↔ `"8rem"` expanded, `paddingLeft/Right` 0.625rem ↔ 1.5rem).
- **Hover/active transition**: `transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95` — a 150ms colour/background crossfade plus a `scale(0.95)` press-down on click, eased with the app's named "strong ease-out" curve (`cubic-bezier(0.23, 1, 0.32, 1)`, `theme.css:104`). The width/label morph itself runs on a **separate spring** (`PILL_TRANSITION = { type: "spring", bounce: 0, duration: 0.45 }`, `LiveBroadcast.jsx:49`) — critically-damped, no bounce.
- Active-side fill: `bg-accent-700` (`--teacher-700 = #6b1fad`) with `shadow-[var(--shadow-modal)]`; inactive circle: `bg-bg-surface-3 text-text-secondary hover:text-text-primary` (text-only hover, no bg change on the idle circle).
- Container: the whole pill-pair sits inside its own floating capsule — `bg-bg-elevated border border-border rounded-full p-1.5 shadow-[var(--shadow-modal)]` (`LiveBroadcast.jsx:2565`).

**B. Setup modal's "Start Lecture" button** (`LiveBroadcast.jsx:3170-3225`):
- `h-9 px-4 rounded-full text-sm font-medium text-white`, fill `bg-[#611d9f]` (idle) → `bg-accent-live` once broadcasting, hover = `/90` opacity variant of the same colour (`hover:bg-[#611d9f]/90`), `transition-colors duration-150`.
- Hover also **collapses the text label to icon-only** (width/opacity animated to 0 on the shared `PILL_TRANSITION` spring) rather than changing size/elevation — a content-swap hover, not a scale/lift.
- Uses the `btn-press` utility (`theme.css:460-467`) for the click-only `scale(0.97)` on `:active`, `transition: transform 120ms var(--ease-out-strong)`.
- Disabled state: `opacity-40 cursor-not-allowed`, hover forced back to the base (non-hover) fill so a disabled button never visually "reacts."

**C. "End Lecture" button** (`LiveBroadcast.jsx:2869-2895`): same `btn-press` + label-collapse-on-hover pattern as B, solid `bg-accent-critical hover:bg-accent-critical/90`, `rounded-full`, `shadow-[var(--shadow-modal)]`.

Summary hover recipe for pill buttons: **150ms `ease-out-strong` colour/opacity transition + `active:scale(0.95–0.97)` press**, never a translate/lift, never a glow. Label-collapse-to-icon (using the shared spring) is the signature *hover* micro-interaction on the higher-emphasis pills (B, C, and the schedule/instant pills' self-hover case); the plain static control-bar buttons (Mic/Record/Screen Share) intentionally have **no hover state at all** (comment confirms this at `LiveBroadcast.jsx:2761-2763`, "Static pills, no hover").

## 5. Filter/tab pattern (`label | count`)

Canonical implementation — Student Monitor's filter segments (`StudentMonitor.jsx:161-176`, styles `StudentMonitor.css:82-133`):

```jsx
<button className={`sm-seg${filter === key ? " is-active" : ""}`}>
  <Icon />
  {label}
  <span className="sm-seg__div">|</span>
  <span className="sm-seg__count">{String(count).padStart(2, "0")}</span>
</button>
```

- Pill shape: `border-radius: 999px`, `height: 32px`, `padding: 0 10px`, `14px` gap between segments (`.sm-filters { gap: 14px }`).
- Icon: `14×14px`, inline before the label, `5px` gap (`.sm-seg { gap: 5px }`).
- **Separator**: a literal `|` character in its own span, `opacity: 0.35`, `font-weight: 400` — not a border/pseudo-element rule.
- **Count**: `font-variant-numeric: tabular-nums`, always zero-padded to 2 digits (`String(count).padStart(2, "0")`).
- **Inactive state**: `border: 1px solid #282828`, transparent background, `color: #9a9a9a`; hover brightens both (`color: #c7c9d1`, `border-color: #3a3a40`), `150ms ease` on color/background/border.
- **Active state**: filled `background: #673fa6` / `border-color: #673fa6` / `color: #fff` (note: this literal hex is a slightly different violet than the `--teacher-700` token `#6b1fad` — treat `#673fa6` as this component's own active-segment fill, not a re-derivation of the accent scale). Active+hover deepens further to `#8455d3` (two competing hover rules are actually present in the file — `StudentMonitor.css:124-133` — the second, `#8455d3`, wins in the cascade since it's declared last).

A second, simpler instance of the same *visual* idea (chip, not a tab) is the plain count chip (no filter behaviour) — `StudentMonitor.css:58-80`: `min-width: 50px`, `height: 28.7px`, `border-radius: 14px`, `background: #111113`, no border, icon `14×14px` tinted `#a374e5`.

## 6. Color hierarchy

From `Frontend/src/styles/theme.css:4-53` (values shown are the **teacher** role scope, `[data-role="teacher"]`, `theme.css:170-176`):

**Backgrounds** (`theme.css:12-17`), darkest → lightest:
| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#000000` | page background (true black) |
| `--bg-surface` | `#111113` | cards, modal panels, sunken fields |
| `--bg-elevated` | `#17171A` | popovers, tooltips, floating pill container, dropdowns |
| `--bg-surface-3` | `#1D1D21` | inactive/idle control fill (one step up from surface) |
| `--border` | `#232327` | default hairline border |
| `--border-hover` | `#2E2E33` | brightened hairline on hover/card-hover |

**Text** (`theme.css:20-22`):
| Token | Hex | Role |
|---|---|---|
| `--text-primary` | `#F1F2F5` | headings, primary values, active labels |
| `--text-secondary` | `#93969F` | secondary labels, field labels, inactive-but-visible text |
| `--text-muted` | `#585C68` | placeholders, captions, disabled/default input borders |

**Accent (teacher violet scale)** (`theme.css:46-53`) — one hue, five steps:
| Token | Hex | Role |
|---|---|---|
| `--teacher-300` | `#cda8f0` | complement border for icon+text (opt-in) |
| `--teacher-500` | `#af74e5` | icon + text + selected-tab/focus-ring — this is what `--accent-info`/`focus-within:border-accent-info` resolves to |
| `--teacher-600` | `#933fdb` | secondary buttons (navigate/add), selected nav |
| `--teacher-700` | `#6b1fad` | primary action fill ("start something") — the idle pill's active fill, `bg-accent-700` |
| `--teacher-900` | `#27154F` | unused on teacher side |

**Semantic states** (independent of role, `theme.css:30-34`): `--accent-live #00ff5f` (broadcast-live indicator only), `--accent-success #15803D`, `--accent-warning #DDA53D`, `--accent-critical #DC2626` (End Lecture, mic-muted, errors), `--accent-locked #7A8699`.

Purple is used **only** for: focus states, the primary "start/selected" pill fill, icon tinting on interactive/selected elements, and the tab active state — never as decorative background or large fill elsewhere. Everything else stays on the black/grey scale.

## 7. Typography hierarchy

Base scale, `theme.css:64-71` + element defaults `theme.css:275-329`:

| Level | Size | Weight | Notes |
|---|---|---|---|
| `h1` (page title) | `--text-xl` = 28px | 500 (`--font-weight-medium`) | `letter-spacing: -0.01em`, `line-height: 1.3` |
| `h2` (section header) | `--text-lg` = 20px | 500 | `line-height: 1.4` |
| `h3` | `--text-md` = 16px | 500 | |
| `h4` | `--text-base` = 14px | 500 | |
| body / inputs | `--text-base` = 14px | 400 | |
| `label` | `--text-sm` = 12px | 500 | |
| captions/meta | `--text-xs` = 11px | varies | e.g. modal section eyebrows use `text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted` (`LiveBroadcast.jsx:2949`) |

One family throughout: `Manrope` (`--font-sans`/`--font-display`, `theme.css:61-62`) — no secondary/mono face; numerals use `.tnum` (`font-variant-numeric: tabular-nums`, `theme.css:368-371`) instead of a monospace substitute wherever digits need to line up (timers, counts, chips).

Deviation on Student Monitor's own page title: `.sm-title` is custom-styled rather than a bare `<h1>` — `font-size: 21px; font-weight: 500; letter-spacing: -0.01em; color: #f8f8fa` (`StudentMonitor.css:30-39`), i.e. it sits between the `h1`/`h2` tokens rather than reusing one exactly; treat this as an established, deliberate variant for a page-header-with-icon pattern, not a bug to "fix" toward the literal `h1` token.

## 8. Spacing & layout rhythm

- Base spacing scale, `theme.css:74-81`: `--space-1 4px`, `--space-2 8px`, `--space-3 12px`, `--space-4 16px`, `--space-6 24px`, `--space-8 32px`, `--space-12 48px`, `--space-16 64px`.
- Page header padding (Student Monitor): `padding: 20px 24px`, bottom hairline `border-bottom: 1px solid #161619` — `StudentMonitor.css:26-27`. No separate "header card" — the divider *is* the separation, no panel/box around the header row.
- Content scroll region padding: `24px` all sides — `StudentMonitor.css:139`.
- Card grid: fixed-size cards (`276.79px`) in `repeat(auto-fill, ...)`, `column-gap: 39px`, `row-gap: 27px` — `StudentMonitor.css:143-147`. Generous, uneven-looking-but-deliberate gutters (wider column gap than row gap).
- Card internal padding: `18px 24px 14px` (top/sides/bottom asymmetric) — `StudentTile.css:19`.
- Modal internal rhythm: form fields stacked with `gap-4` (`LiveBroadcast.jsx:3040`), footer buttons `gap-2` (`LiveBroadcast.jsx:3169`).
- Control-bar clusters: `gap-3` between major groups, `gap-2.5` within a button group, `gap-1.5` for tightly-related icon+label pairs.

## 9. Overall vibe (qualitative, for judgment calls)

- **True-black base, layered surfaces**: never decorate with color; elevation comes from `--bg-*` steps and hairline borders, not shadows (`--shadow-card: none`). Shadows are reserved for things that should read as "floating above the canvas" — modals, tooltips/dropdowns, and the idle-pill capsule.
- **Purple is a state signal, not decoration**: it marks focus, the one primary/selected action, and active tabs — it is never a background wash or an accent stripe applied "for interest."
- **Restraint in motion**: hover = colour/opacity fade (150ms, `ease-out-strong`) + a small `active:scale` press; bigger UI changes (pill width, label appear/disappear) run on one shared, non-bouncy spring (`PILL_TRANSITION`) reused everywhere rather than ad hoc durations per element. No translate/lift-on-hover anywhere in the reference pages.
- **Everything is comfortably numerous but quiet**: lots of small pills/chips/badges, but all monochrome-with-purple-icon by default, borders are 1px hairlines (`--border`/`--border-hover`), and text hierarchy (`text-primary` → `text-secondary` → `text-muted`) does the work that color/weight variety would otherwise do.
- **Line icons only**: Tabler icons, `strokeWidth={1.75}`, no filled icon variants and no "icon in a colored chip" container anywhere in these two pages — icons sit directly on the surface, tinted by state (`text-muted` default → `text-accent-500`/`text-accent-info` on active/focus).
