# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

EduSync is a real-time collaborative platform for hybrid computer-lab classrooms: live screen/audio broadcast (WebRTC), automatic attendance derived from in-session activity, real-time coding tasks with anti-cheat focus tracking, secure timed exams, an in-session doubt solver, session recording, and analytics. Three strictly separate role experiences — **Teacher**, **Student**, **Admin** — sharing one backend and one design system. See `PRODUCT.md` (primary source of product truth) and `PRD_Smart_Teaching_Lab_Management_Platform.md` for scope/positioning, and `DESIGN.md` for the visual system ("The Night Lab" — dark-only, true-black base, role-scoped accent colors).

**This repo also contains EduSync Connect** (`Connect-Frontend/` + `Backend/controllers/connect/` + `Backend/routes/connect/`) — a **separate product** under the same parent company, Archway, not a module of EduSync. It shares this backend and database but is otherwise a distinct codebase, frontend, and product surface (classroom messaging/announcements/polls/assignments/materials). EduSync is positioned as desktop **software** (Electron wrapper around `Frontend/`); EduSync Connect is a plain **web application** with no desktop wrapper. Don't assume a request about one applies to the other. See `codeBaseContext.md` for the full technical map of both.

It's a three-folder repo, no shared root `package.json`/workspace — `Backend/`, `Frontend/`, and `Connect-Frontend/` are independent Node projects, each with their own `npm install`.

## Commands

**Backend** (from `Backend/`):
- `npm install`
- `npm run dev` — nodemon, auto-restarts on file changes (this is what you want while iterating on backend code)
- `npm start` — plain `node server.js`, no auto-restart
- `npm run db:init` — **do not use this**, it points at a deprecated/dead file (see Database gotcha below)
- No test suite exists (`npm test` is a stub that exits 1)

**Frontend** (from `Frontend/`):
- `npm install`
- `npm run dev` — Vite dev server on `:5173`
- `npm run build` — production build (`vite build`); run this after any change to confirm nothing broke, since there's no test suite here either
- `npm run electron:dev` — runs the Electron desktop wrapper against the dev build
- `npm run electron:build` — builds + packages the Electron app (`electron-builder`)

**Connect-Frontend** (from `Connect-Frontend/`) — EduSync Connect's separate frontend, see Project overview above:
- `npm install`
- `npm run dev` — Vite dev server on `:5174` (fixed port, `vite.config.js`)
- `npm run build` — production build; **no `.env`/`.env.example` exists here** — `API_BASE_URL` defaults to `http://localhost:3000` with no deployed-URL fallback (unlike `Frontend/`), so a production build needs `VITE_API_URL` set explicitly at build time or it'll silently target localhost
- No Electron target — this product is web-only by design (see Project overview)

No linter is configured in any of the three packages.

## Architecture

### Backend: Express + Socket.io + Postgres, routes → controllers

`server.js` is the single entrypoint: creates the Express app and one `http.Server`/`socket.io` `Server` sharing the same port, mounts every route module (`routes/*.js`, thin — just wires paths to `protect([roles])` and a controller function), and calls `dbSetup()` before `listen()`.

- **Auth**: JWT via `middleware/authMiddleware.js`'s `protect(roles = [])` — decodes the bearer token into `req.user` and 403s if `roles` is non-empty and the token's role isn't in it. Roles are `'teacher' | 'student' | 'admin'`.
- **DB access**: `config/db.js` exports a single `postgres` (postgres.js) tagged-template `sql` client built from `DATABASE_URL`; every controller imports it directly (no ORM, no repository layer).
- **Real-time**: Socket.io rooms follow fixed naming conventions used across every controller — `session:<sessionId>` (all connected students+teacher for a session), `teacher_session:<sessionId>` (teacher-only, used for teacher-facing live updates like rejoin requests/attendance exceptions), `teacher:<teacherId>` (a specific teacher across sessions/exams, e.g. `exam:waiting_count_update`), `class:<classId>` (every connected student auto-joins theirs on connect; session start/end broadcasts here), `exam_waiting:<examId>` (students in an exam's waiting room — room membership size itself *is* the live count, no separate bookkeeping), and `connect:classroom:<classSubjectId>` (EduSync Connect's one room family — see Project overview above; provably disjoint from every other prefix, confirmed by grep). Events are namespaced by domain: `exam:*`, `webrtc:*`, `student:*`, `teacher:*`, `session:*`, `analytics:updated`, `connect:*`. **Tasks and doubts have no socket namespace at all — they're REST-only** (`task:*`/`doubt:*` do not exist as real events in `server.js`; don't assume they do). When adding a new real-time feature, reuse one of these room/event patterns rather than inventing a new transport or ad-hoc room name — EduSync Connect's socket handlers are a good template: registered as a **second, separate** `io.on('connection', ...)` listener in `server.js` (`require('./controllers/connect/connectSocketController')(io)`) rather than editing the existing giant one, since Socket.io allows multiple listeners on the same event.

**Database schema gotcha (bit this exact codebase already — read before touching schema):** the live, authoritative schema lives in **`Backend/config/dbSetup.js`**, which `server.js` calls automatically on every boot (idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column). There are **two other files that look like they do this but don't**: `Backend/scripts/initDB.js` (wired to the `npm run db:init` script) and `Backend/config/initDb.js` — both are explicitly marked `// DEPRECATED: Superseded by Backend/config/dbSetup.js ... Kept for reference only` at the top, but nothing prevents editing them by mistake. Any schema change (new table, new column) goes in `dbSetup.js`, added as `ADD COLUMN IF NOT EXISTS` next to the table's `CREATE TABLE IF NOT EXISTS` block, matching the existing style there.

**Deployed backend gotcha**: `Frontend/src/app/config/api.js` defaults `API_BASE_URL`/`SOCKET_URL` to a **deployed Render instance** (`https://edusync-mthd.onrender.com`) when `VITE_API_URL` isn't set, and `Frontend/.env` in this repo is currently pointed at that same deployed URL rather than a local backend. This means running `Backend` locally does **not** automatically get exercised by the frontend unless `VITE_API_URL` is pointed at it — local backend changes need an explicit redeploy (or a local `.env` override) to actually take effect for anyone testing against the default frontend config. Confirm which backend a bug report is actually hitting before debugging backend code changes.

### Frontend: React Router + role-scoped layouts, no global state library

`src/app/routes.jsx` defines one `createBrowserRouter` tree: `/teacher/*`, `/student/*`, `/admin/*` each nested under a role layout component (`layouts/TeacherLayout.jsx`, `StudentLayout.jsx`, `AdminLayout.jsx`). A layout owns session-level state (current session/task, roster, etc.) and passes it down to its child pages via `<Outlet context={{...}}>`; pages read it with `useOutletContext()` rather than through Redux/Zustand/Context providers — there is no global state library in this app. Real-time updates arrive via the shared singleton in `store/socket.js` (`initSocket(token)` once after login, `getSocket()` anywhere else) — pages subscribe/unsubscribe to specific events in `useEffect`, matching the backend's room/event conventions above.

Shared UI lives in `components/ui/` (shadcn-derived primitives — Button, Card, Select, Dialog, ScrollArea, etc., already re-themed to this project's tokens) and `components/` (app-specific composites like `StatusBadge`, `StudentTile`, `TaskStatusModal`, `PageShell`). Prefer these over new one-off components.

The Doubt Solver feature has no dedicated page — don't go looking for one. It's two pieces bolted onto existing pages: the student side lives inside `CodeEditor.jsx` (an inline `AskDoubtModal` + status banner + Monaco line-range highlight via `deltaDecorations`), the teacher side lives inside `TaskAssignment.jsx`'s roster view.

### Connect-Frontend: separate React Router app, same conventions, own token copy

`Connect-Frontend/` is EduSync Connect's frontend (see Project overview above) — its own `createBrowserRouter` tree (`teacher`/`student`/`admin` layouts, same shape as `Frontend/`), its own small `components/ui/` subset, its own `lib/socket.js` singleton, its own `data/*.js` REST client (misleadingly named `mockClassrooms.js` — despite the name it's a real fetch-based client with zero mock data, one function per backend endpoint, not a placeholder). It shares the **same login endpoint and JWT** as `Frontend/` (`POST /auth/login`) but stores the token under separate localStorage keys (`connect_edusync_token`/`connect_edusync_user`) so a browser with both apps open doesn't clobber either session. Its `src/index.css` is a **hand-copied, value-identical** copy of `DESIGN.md`'s tokens, not a shared file — if `DESIGN.md`'s tokens change, this file needs manual re-sync, there's no shared source of truth between the two frontends' CSS.

### Design system — `DESIGN.md` is the source of truth, not optional context

Read `DESIGN.md` before writing any UI. The load-bearing architectural piece: **one shared `--accent-*` CSS variable slot** (`--accent-50/300/500/700/900`, plus aliases `--primary`/`--ring`/`--chart-1`/`--accent-info`) that every shared primitive reads, re-scoped per role via a `[data-role="student"|"teacher"|"admin"]` attribute on each layout's root element. Student = orange, Teacher = royal violet, Admin = ink blue. This is completely separate from the fixed semantic status palette (success/warning/critical/locked) — a role's brand color must never double as a status meaning.

**A CSS custom-property gotcha already found and fixed once in this codebase, easy to reintroduce**: a custom property inherits its *computed* value, not a live reference — so if an alias like `--accent-info` is declared only once (e.g. at `:root`), it freezes to whatever `--accent-500` resolved to at that single declaration site and never re-resolves inside a `[data-role]` descendant scope, even though `--accent-500` itself does. Every `[data-role="..."]` block in `theme.css` must redeclare the aliases too, not just the primitives — check `theme.css` directly rather than assuming a new alias will "just inherit" correctly.

Other durable rules from `DESIGN.md` worth internalizing before writing classes: true-black base with lightness-step elevation (`bg-base` → `bg-surface` → `bg-elevated` → `bg-surface-3`), never a drop shadow at rest (shadows are reserved for modals and focus rings only); `.tnum` tabular-nums for any column of digits instead of a second monospace typeface (an actual code editor's own font is the one sanctioned exception); a content-shaped skeleton-shimmer for "data hasn't loaded yet," a spinner only for "an action is in flight" (submit/send/run/connect) — never conflate the two; a failed fetch must render a distinct error+retry state, never silently identical to a genuine empty state.

This project has the **impeccable** skill installed and used throughout its history (`/impeccable <command> [target]` — audit, critique, polish, layout, document) for design-system-compliance work; reach for it for anything design/UI-review shaped rather than re-deriving the process from scratch.

### Established frontend interaction patterns

A few concrete UI patterns now recur across the teacher and student pages (Live Broadcast, Task Assignment, the student Task/Exam pages) — reuse them rather than inventing a new one per page:

- **Browser-tab-style strip** for switching between a fixed set of items (session tasks, exam questions, Create/Manage exam views, exam question-sets): `role="tablist"`, `h-11`, tabs `rounded-t-[var(--radius-md)]`, the active tab shares the content panel's own background (`bg-bg-base`/`bg-bg-surface`) so it reads as physically attached to what's below it, inactive tabs are `text-text-secondary` with an elevated hover. See `CodeEditor.jsx`'s task strip for the canonical version.
- **`CodeOutputPanel.jsx`** (`components/CodeOutputPanel.jsx`) is the shared dockable/resizable output panel (drag-to-resize, dock top/right/bottom/left) used by Live Broadcast (teacher) and Live Session (student, both the student's own output and the mirrored teacher output). It handles exactly one resizable panel next to one content area — it doesn't fit a 3-way split (e.g. the student Exam page's question/editor/console layout hand-rolls the same mouse-drag-resize math instead, since there's no single second panel to dock).
- **Shared modal shell with variant-driven body** (`components/TaskStatusModal.jsx`) — one `Dialog`-equivalent (motion-animated backdrop + `bg-bg-elevated` panel) whose inner content switches by status/type, rather than a different modal component per state. Reused for the Exam Creation question editor (MCQ vs Code) and exam-results code grading.
- **`StatusBadge`** (`components/StatusBadge.jsx`) only recognizes a fixed set of status strings (`submitted`, `in-progress` — hyphenated, not underscored — `locked`, `live`, `waiting_room`, etc.); an unrecognized key falls back to a generic gray badge with no warning, so map backend status values (e.g. `in_progress` → `in-progress`) explicitly rather than passing them through.
- **Framer Motion** is imported as `from "motion/react"` — the package in `package.json` is named `motion`, not `framer-motion`; the latter doesn't exist here.
- **Radix `Select` (`components/ui/select.jsx`) gotcha**: in its default `position="popper"` mode, the dropdown `Viewport` is height-locked to the trigger's own height (a real, reproducible bug, not a false alarm) — a compact trigger (`size="sm"`) with more than a couple of items clips the menu to almost nothing. For a small fixed-choice picker under a compact trigger, use a manually-built dropdown instead (open/close state + outside-click ref + absolute-positioned menu, matching `CodeOutputPanel.jsx`'s own dock-position picker) rather than `Select`.

### Electron wrapper

`Frontend/electron/main.cjs` + `preload.cjs` package the same web build as a desktop app (`electron-builder`, config in `Frontend/package.json`'s `build` key) — it is explicitly *not* a separate design language or codebase, just a native shell around the identical React app (per `PRODUCT.md`: "an Electron desktop wrapper exists around the same web frontend, which does not make the design language native").

## Reference docs

- `codeBaseContext.md` — **read this first for deep technical detail on anything.** A from-scratch, full-codebase-read technical map (every page, every route, every socket event, every DB table, both `Frontend/` and `Connect-Frontend/`) as of Aug 25, 2026. This CLAUDE.md file stays intentionally high-level/gotcha-focused; `codeBaseContext.md` is where the exhaustive inventory lives.
- `PRODUCT.md` — product scope, roles, positioning, what's built vs. explicitly deferred, for **EduSync**. Treat as current over the PRD if they ever disagree. Now also documents the Archway/EduSync Connect company relationship and a summary of EduSync Connect's own scope.
- `PRD_Smart_Teaching_Lab_Management_Platform.md` — full PRD (Aug 2026, v1.4), including the binding tone constraints in §5 ("Design & UX Constraints") and a new §11 summarizing EduSync Connect for visibility (Connect's own scope isn't really "this PRD's" scope — see Project overview above).
- `DESIGN.md` — the full design system (colors, type, motion, component rules, do's/don'ts) for **EduSync** (`Frontend/`). Has a YAML frontmatter block with raw token values in addition to the prose. `Connect-Frontend/` hand-copies these token values into its own `src/index.css` rather than sharing this file — keep both in sync manually if tokens change.
- `SETUP.md` / `README.md` — local setup walkthrough (Postgres + `.env` + `db:init` — note the `db:init` caveat above) and default seeded admin login (`admin@gmail.com` / `admin123`, seeded on first successful `dbSetup()` boot).
- `context.md` — a chronological handoff log of past session work (design-system audits, specific bugs found/fixed, working conventions established). Useful background on *why* something looks the way it does, but not authoritative for current code state — verify against the actual files rather than trusting it as still-accurate (e.g. it once flagged `SessionRecording.jsx` as a dead-end scaffold; that's no longer true, confirmed Aug 25, 2026 — the flag itself was left unedited since this file is a historical log, not a living doc).
