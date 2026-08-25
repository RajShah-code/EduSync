# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Company & Product Family

**Archway** is the parent company. **EduSync** and **EduSync Connect** are two distinct products under Archway, sharing one backend and one Postgres database but otherwise separate codebases, separate frontends, and separate deployment targets:

- **EduSync** (this document's primary subject) is the in-lab, session-driven teaching platform — live broadcast, monitoring, attendance, tasks, exams, recording, analytics. Positioned as **software** — its primary distribution target is the Electron desktop wrapper around the web app (`Frontend/`), for lab PCs.
- **EduSync Connect** is a lightweight, always-available companion **web application** (`Connect-Frontend/`, no desktop wrapper) — classroom messaging, announcements, polls, assignments, and study materials, for anytime/anywhere access outside the live session window. It exists to give EduSync's teachers and students something to use *between* sessions, not to replace or duplicate anything EduSync does live in the lab.

Do not conflate the two in scope or docs — a EduSync Connect feature request is not automatically an EduSync feature request, and vice versa. See "EduSync Connect" section below for its own scope; see `codeBaseContext.md` for the full technical breakdown of both codebases plus the shared backend.

## Users

- **Faculty / Teacher** — runs live lab sessions, broadcasts screen/audio, assigns tasks and exams, monitors student focus/activity, reviews submissions and grades, views analytics.
- **Student** — attends sessions from a browser, follows the teacher's broadcast, works on assigned tasks in an in-browser editor, sits secure exams, raises doubts, accesses files remotely.
- **Admin** — manages classrooms, students, teachers, and logs; institution-level administration (module still being scoped — see Capabilities and Constraints).

Teacher and student roles have strictly separate dashboards, permissions, and capabilities; no feature overlap unless explicitly defined.

Not tied to a single institution's branding — EduSync is a generic product for university/college computer labs, not a bespoke build for one college's identity, even though the current driving use case is a specific BCA department's lab.

## Product Purpose

A real-time collaborative platform for hybrid/in-person computer-lab classrooms. It unifies live teaching, automatic attendance, task/coding-exercise assignment, secure practical exams, doubt resolution, session recording, and performance analytics in one system, replacing disconnected manual processes (shouted instructions, paper roll calls, USB-stick file transfer, unproctored practicals).

Success = a teacher can run an entire lab session — broadcast, monitor, assign, grade, and analyze — without leaving the platform, and attendance/integrity data is trustworthy without manual effort.

## Positioning

The single mechanism a generic screen-share tool or LMS can't replicate: attendance derived from live in-session activity (not a manual roll call or a static login timestamp), combined with anti-cheat focus tracking (fullscreen/tab-switch detection, gated rejoin) and a locked-down exam mode, all inside the same real-time session as the teaching itself — not a bolted-on separate proctoring product.

## Operating Context

- University/college computer lab, desktop systems, one teacher device broadcasting to many student devices over the local network or internet.
- Live sessions run for a fixed class period; time-boxed tasks and exams happen inside that same session window.
- Teachers need a distraction-free, glanceable dashboard while actively lecturing; students need to keep the teacher's broadcast, task, and exam UI usable without leaving their seat.
- Post-session workflows: reviewing submissions/grades, pulling analytics, teachers privately saving their own recordings.

## Capabilities and Constraints

**Core (build first), per the PRD:**
1. Live screen broadcast (WebRTC, one-way mesh) from teacher to all students, low-latency and stable for the full session; students cannot control the broadcast.
2. Student activity monitoring — teacher sees a grid of student screens/status (active/idle), view-only, no remote control.
3. Automatic attendance — derived from login + in-session activity, not manual entry; idle/inactive students flagged partial/absent. A deeper Windows-domain-login-based attendance capability is designed but explicitly **not yet built** (future consideration).
4. Task & coding-exercise assignment — Monaco-based in-browser editor, time limits, language constraints, live progress (not started/in progress/submitted), teacher review after the session. Students can optionally save a local copy of a submitted task to disk after submission (convenience only, never blocks the real submission).
5. Secure practical exam mode — randomized/unique questions per student from a bank, enforced countdown, restricted access to unauthorized apps during the exam, auto-lock at time expiry, no submission after lock. **Status: complete and closed** (per PRD, verified July 28, 2026).
6. Session recording — **teacher-side only**, explicitly scoped narrower than earlier drafts: no backend, no database, no upload, no student-side access via the platform. Local capture via MediaRecorder, direct-to-disk save via File System Access API where supported, with an in-memory/download fallback for browsers without it (Firefox, Safari). A student-facing "watch past recordings" version would need a fresh scope conversation. **Status: complete.**
7. Analytics dashboard — attendance trends, task completion rates, exam performance, at-risk student identification, exportable reports.
8. Interactive doubt solver — students attach code snapshots to doubt requests; teachers reply with guidance and line-range hints highlighted in the student's editor.
9. Admin console — classroom/student/teacher/log management; transient roll-based password generation exposed only at creation, never stored in plaintext. **Requirements not yet fully gathered** — scope of ambition (how far beyond basic CRUD) is an open question.
10. Per-role guided onboarding tours (`react-joyride`) — a first-run walkthrough highlighting key controls, one tour script per role (teacher/student/admin). Not in the original PRD's numbered feature list; built and shipped since. Polish/retention feature, not core.

**Explicitly out of scope:** native mobile app (web/desktop-first only — an Electron desktop wrapper exists around the same web frontend, which does not make the design language native), teacher↔student video/audio conferencing, third-party LMS integrations (Moodle, Canvas), AI-based grading/plagiarism detection (deferred), containerization (deferred to deployment).

**Non-functional constraints:** real-time features must feel low-latency and stable; JWT-based auth with strict role separation; offline fail-safe for student work; modular/expandable structure; must work on all modern browsers.

**Accessibility:** no specific mandate or known user need established yet — do not invent one; treat as an open decision if it becomes material.

## EduSync Connect (Companion Product)

A separate Archway product, not a module of EduSync — see "Company & Product Family" above for the relationship. Scope as actually built (backend complete across 9 build phases; frontend feature-complete except one gap noted below):

**Core unit: the "classroom."** One `connect_class_subjects` row = one (teacher, class, subject) allotment, admin-provisioned. A teacher's classroom list is their own allotments; a student's is every allotment matching their single `class_id`. Same class+subject taught by 2+ teachers, or 2+ subjects by the same teacher to the same class, are disambiguated automatically in the display name (`"Subject(TeacherName)"` / `"ClassName(Subject)"`) rather than shown as indistinguishable duplicates.

**Features:**
1. **Classroom messaging** — real-time chat scoped to one classroom, Socket.io (`connect:classroom:{id}` room) with a REST fallback send path. A teacher sets `posting_mode` per classroom (`teacher_only` = students read/comment-only, `open` = students can post too) and can toggle it themselves at any time.
2. **Announcements** — a teacher pins one to their own classroom(s); an admin can target specific classroom(s) or broadcast one **globally** to every classroom at once. A student/teacher's feed is the union of classroom-targeted + global announcements.
3. **Polls** — teacher creates, any classroom member votes once (DB-enforced, not just app-checked — no vote-changing in v1), live results broadcast to the room on every vote.
4. **Assignments** — teacher creates (with an optional reference-material attachment), students submit text and/or a file, late-submission auto-flagged against a deadline, resubmission overwrites the same record rather than creating a new one (and clears any prior grade — a changed submission needs re-grading), teacher grades with a score + feedback.
5. **Study materials** — teacher uploads files (notes/slides/resources) to a classroom; any member downloads via a freshly-generated link each time (not a link baked in at list-time, since materials are browsed repeatedly, not delivered once).
6. **Unread/notification counts** — a lightweight last-seen-timestamp model (not per-message read receipts) driving per-classroom unread badges: unread messages, unread announcements, and (teacher-only) a standing count of ungraded submissions. **Backend-only as of this writing — `Connect-Frontend/` does not yet call this endpoint pair; no unread badges are visible in the UI yet.**

**Storage**: file uploads (assignment attachments, submission files, materials) reuse the *same* Backblaze B2 bucket as EduSync's own "Email My Folder" feature, under a `connect-assignments/` key prefix — no second bucket, same size cap (20MB) and per-user rate limit (5 uploads/hour) as that feature, enforced by one shared helper module both features' Connect-side code imports (`Backend/controllers/connect/connectB2Upload.js`) so the two can't silently drift apart.

**Access model**: every read/write is checked per-classroom via one shared helper (`resolveClassroomAccess` — teacher owns the row, or student's `class_id` matches it), reused identically across REST and Socket.io paths so the two can never diverge in what they allow.

**Known gap, not yet fixed**: `Connect-Frontend/`'s login redirects an `admin`-role user to the teacher dashboard instead of the admin one, even though a full admin route tree exists and works if navigated to directly. Frontend bug, flagged for a future Connect-Frontend session — not fixed here (this was a backend-only integration pass).

## Brand Commitments

Product name is **EduSync**. No logo or other locked visual asset exists yet. The PRD (Section 5, "Design & UX Constraints") volunteers binding tone constraints that any visual direction must honor: minimal, professional, academic in appearance; optimized for desktop lab systems as the primary target; no unnecessary animation or visual clutter; teacher dashboard clean and distraction-free; navigation simple and intuitive for a real lab environment. (Recorded as stated; not expanded into a visual world here.)

## Evidence on Hand

No case studies, testimonials, press, or benchmark data exist. Do not fabricate any. The project's own PRD (`PRD_Smart_Teaching_Lab_Management_Platform.md`) is the primary source of product truth for EduSync; this document was refreshed against a full codebase read (both `Frontend/` and the new `Connect-Frontend/`) as of Aug 25, 2026, alongside the PRD's own v1.4 update covering EduSync Connect.

## Product Principles

- Attendance and integrity data must be earned from real activity signals, never from a manual or easily-gamed entry point.
- Teacher and student experiences are built and evaluated separately — one role's needs (e.g. glanceable monitoring) never compromises the other's (e.g. distraction-free task focus).
- Ship the narrower, real, working version of a feature before promising a broader one (see Session Recording's locked-in scope cut, and the Windows-domain-login attendance idea being kept as a documented future consideration rather than an implicit commitment).
- Real-time reliability outranks feature breadth during live sessions; nothing should feel laggy or unstable while a class is in progress.
- Convenience actions (like a local save-to-disk after submission) must never block or risk the authoritative action they accompany.

## Accessibility & Inclusion

No product-specific requirement established yet (confirmed with the user — treat as an open decision, not an assumption).
