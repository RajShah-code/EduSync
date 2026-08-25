# EduSync Codebase Context

Full-codebase technical reference, written from a from-scratch read of every file and folder in this repo (Aug 25, 2026; documentation sync pass Aug 26, 2026 covering 5 commits' worth of drift — open-discussion mode removed, the Subject Catalog + Subject Allotments admin feature and its one-way sync into Connect, live tab updates, Web Push notifications, and the admin-panel Dropdown component). This is the deep-detail companion to `CLAUDE.md` (which stays short and gotcha-focused) — when `CLAUDE.md` isn't enough, this is where the exhaustive inventory lives. Written for a future session of mine to load fast and get oriented without re-reading the whole repo.

**Companies/products, read this first:** **Archway** is the parent company. **EduSync** and **EduSync Connect** are two separate products under it, sharing one backend + one Postgres database, otherwise separate codebases:
- **EduSync** — the in-lab, live-session teaching platform (`Frontend/` + all of `Backend/` except the `connect/` subtrees). Positioned as **software**: primary distribution is the Electron desktop wrapper around this same web app, for lab PCs.
- **EduSync Connect** — a lightweight, always-on companion **web application** (`Connect-Frontend/` + `Backend/controllers/connect/` + `Backend/routes/connect/`), no desktop wrapper. Messaging/announcements/polls/assignments/materials for use *between* live sessions, not during one.

Never assume a request about one product applies to the other. If unsure which product a task belongs to, ask.

---

## 1. Repo Layout

```
EduSync/
├── Backend/              — Express + Socket.io + Postgres, shared by both products
│   ├── server.js         — single entrypoint (see §4)
│   ├── config/            — db.js (sql client), dbSetup.js (THE schema), initDb.js (deprecated, ignore)
│   ├── middleware/        — authMiddleware.js (protect())
│   ├── routes/            — one thin router per domain, mounted in server.js
│   │   └── connect/       — EduSync Connect's one router (connectRoutes.js)
│   ├── controllers/        — one controller per domain
│   │   └── connect/       — EduSync Connect's controllers (see §6)
│   ├── jobs/              — reminderCron.js (1-min timetable-reminder tick)
│   └── scripts/           — one-off verify/test/cleanup scripts, not part of the running app
├── Frontend/              — EduSync's web app (also the Electron target)
│   └── src/app/           — pages/, layouts/, components/, components/ui/, store/, config/, tours/
├── Connect-Frontend/      — EduSync Connect's separate web app (own package.json, own vite, port 5174)
│   └── src/               — pages/, layouts/, components/common+ui, context/, lib/, data/
├── PRODUCT.md, PRD_Smart_Teaching_Lab_Management_Platform.md, DESIGN.md
├── CLAUDE.md, context.md, README.md, SETUP.md
└── codeBaseContext.md     — this file
```

No shared root `package.json`/workspace — three independent Node projects (`Backend/`, `Frontend/`, `Connect-Frontend/`), each `npm install`ed separately.

---

## 2. EduSync Frontend (`Frontend/`) — Page Inventory

**Routing**: one `createBrowserRouter` in `src/app/routes.jsx`. `RootLayout` wraps everything in `<WindowsAutoLogin/>` + `<SessionResume/>` + `<Outlet/>`, then `/admin`, `/teacher`, `/student` each nested under their own layout (`layouts/{Admin,Student,Teacher}Layout.jsx`) with an `index` route. Layouts own session-level state, passed down via `<Outlet context={{...}}>`; pages read it with `useOutletContext()`. No global state library — see the PRD correction, this was never actually Zustand. Two small localStorage helpers exist instead: `store/sessionStore.js` (resumable-session state, key `edusync_active_session`) and `utils/recordingsStore.js` (local recordings index).

**Real-time**: `store/socket.js` — `initSocket(token)`/`getSocket()`/`disconnectSocket()` singleton, same-origin `SOCKET_URL = API_BASE_URL`, 5-attempt/1000ms reconnection.

### Teacher pages (`pages/teacher/`, 13 files)
| File | Purpose |
|---|---|
| `TeacherDashboard.jsx` | Landing/overview, today's schedule widget (`/timetable/me`) |
| `LiveBroadcast.jsx` | **Largest file in the app (~2940L).** WebRTC screen/audio broadcast, live code editor mirror, whiteboard, mic control, recording start/stop, session setup modal, roster panel. Owns most session-lifecycle socket events. |
| `StudentMonitor.jsx` | Grid of student screens/status |
| `TaskAssignment.jsx` | Create/push coding tasks, live submission-status roster, **also owns the teacher-side doubt queue** (no dedicated doubt page — see §3) |
| `SubmissionReview.jsx` | Grade one task's submissions |
| `ExamCreation.jsx` | Exam/question-bank builder |
| `ActiveExam.jsx` | Live exam monitoring/lock control |
| `ExamResults.jsx` | Post-exam grading/review |
| `Attendance.jsx` | Per-session attendance report |
| `Analytics.jsx` | Attendance trends, task completion, exam scores, at-risk students |
| `SessionRecording.jsx` | **Not dead** (a past session's handoff note flagging it as an empty-state scaffold is stale — confirmed fully functional: local recordings index, Electron "Show in Folder" IPC, browser File-System-Access re-open, pagination, delete) |
| `TeacherSettings.jsx` | `/users/me` |
| `TimetableSetup.jsx` | Recurring weekly schedule builder |

### Student pages (`pages/student/`, 10 files)
| File | Purpose |
|---|---|
| `StudentDashboard.jsx` | `/student-timetable/schedule` |
| `LiveSession.jsx` | Mirrors teacher's broadcast/editor/whiteboard; largest socket-event consumer |
| `CodeEditor.jsx` | Shared Monaco wrapper, **owns the student-side "Ask Doubt" modal** (inline `AskDoubtModal`, status banner, Monaco `deltaDecorations` line-range highlight) |
| `TaskWorkspace.jsx` | Task attempt UI |
| `ExamScreen.jsx` / `ExamLocked.jsx` | Exam-taking + post-lock state |
| `SendMyFiles.jsx` | "Email My Folder" (PRD Feature 10 Part B), route `/student/email-folder` |
| `AttendanceHistory.jsx` | `/attendance/student/:id` |
| `SessionList.jsx` | List of joinable sessions |
| `StudentSettings.jsx` | `/users/me` |

### Admin pages (`pages/admin/`, 4 files — added Aug 25, 2026)
- `AdminUsers.jsx` — full CRUD + bulk-import
- `AdminClasses.jsx` — `/classes` CRUD
- `AdminSubjects.jsx` — CRUD for the `subjects` catalog (name + optional code), a standalone reusable list not tied to any class/semester
- `AdminSubjectAllotments.jsx` — CRUD for `subject_allotments` (class + subject + semester + optional teacher); creating/updating one with a teacher auto-syncs a live EduSync Connect classroom, see §6.1/§6.2 below

Root-level: `LandingPage.jsx` (marketing), `auth/Login.jsx`.

### Shared UI
`components/ui/` — 45 shadcn-derived primitives. `components/` — 10 app-specific composites: `AppTour`, `CodeOutputPanel`, `Dropdown` (added Aug 25, 2026 — the shared custom-styled picker; every native `<select>` across the admin panel now uses this instead), `PageShell`, `SessionResume`, `StatusBadge`, `StudentTile`, `TaskStatusModal`, `Timer`, `WhiteboardCanvas`, `WindowsAutoLogin`.

### Onboarding tours (undocumented in PRODUCT.md until this update)
`react-joyride` + `components/AppTour.jsx` + `tours/{admin,student,teacher}TourSteps.js` + `tours/pageTours.js`, `data-tour="..."` attributes scattered across pages. Now documented as PRODUCT.md item 10.

### Electron (`Frontend/electron/`)
`main.cjs` (167L) + `preload.cjs` (14L), real working IPC handlers:
- `get-windows-username` — reads the real Windows username. Relevant groundwork for PRD §10 (Windows-domain-login attendance) — not the GPO server-side design, but proves the client-side OS-read piece works.
- `recording:start-save` / `write-chunk` / `close` — direct-to-disk recording writes
- `recording:show-in-folder` — via `shell.showItemInFolder`
- No app-allowlisting/fullscreen-lockdown IPC yet (still pending, matches PRD)
- `package.json` branding: `com.edusync.app` / "EduSync" — not aware of Connect as a separate product (correct, Connect has no Electron target)

### Frontend dependencies worth knowing
React 18.3.1, React Router 7.13.0, Vite 6.3.5, Tailwind 4.1.12 (`@tailwindcss/vite`), `@monaco-editor/react`, `pyodide` (in-browser Python), `socket.io-client`, full Radix set + MUI (`@mui/material`/`@mui/icons-material`) + `lucide-react` + `sonner` + `vaul` + `cmdk`, `motion` (imported as `"motion/react"` — package name is `motion`, not `framer-motion`), `jszip` (Feature 10B), `xlsx` (**CDN tarball URL, not npm registry** — `cdn.sheetjs.com`, flag for firewalled installs), `react-joyride`, `electron`/`electron-builder`, `puppeteer-core` (devDependency, used for headless CSS verification per `context.md`).

---

## 3. EduSync Backend — Non-Connect Route/Controller/Socket/Schema Inventory

### 3.1 Routes (mount order in `server.js`)
| Path | Router | Notes |
|---|---|---|
| `/files` | `filesRoutes.js` | `POST /files/email-zip`, student-only. Own `express.json({limit:'35mb'})`, own rate-limit map (`_rateLimitMap`, 5/hr). No DB table — fully stateless beyond the in-memory map. |
| `/connect` | `routes/connect/connectRoutes.js` | See §6. Own `express.json({limit:'35mb'})` too (added for Connect's own uploads, mirrors `/files`'s pattern). |
| `/auth` | `authRoutes.js` | `POST /login`, `POST /windows-login` |
| `/users` (`protect()`) | `usersRoutes.js` | `GET/PUT /me`, tour-complete, password |
| `/sessions` | `sessionsRoutes.js` | Root of the `session:<id>` room family — start/end/my-active/my-sessions/kick/session-students (teacher), active/join (student) |
| `/attendance` | `attendanceRoutes.js` | Per-session report + decide; student's own attendance |
| `/classes` (`protect()`) | `classesRoutes.js` | `GET /` any role, `POST/PUT` admin-only |
| `/subjects` (`protect()`) | `subjectsRoutes.js` | Added Aug 25, 2026. `GET /` any role; `POST/PUT/DELETE` admin-only. The reusable subject catalog, see §2 and §11.5-equivalent below. |
| `/admin` (`protect(['admin'])`) | `adminRoutes.js` | User CRUD, bulk-import (multer+xlsx), roll-based transient passwords; also `subjectAllotmentsController.js`'s `GET/POST/PUT/DELETE /admin/subject-allotments` (added Aug 25, 2026 — class+subject+semester+teacher allotments, syncs into Connect, see §6.1/§6.2) |
| `/tasks` | `tasksRoutes.js` | Create/progress/submissions/score/extend/move_on (teacher); submit/autosave (student) |
| `/doubts` | `doubtsRoutes.js` | Raise + own doubts (student); session doubts + resolve w/ line hints (teacher) |
| `/exams` | `examsRoutes.js` | Largest controller — full lifecycle: create→addQuestion→open→start→submit→violation→end→score→results, plus waiting-room count |
| `/analytics` (`protect(['teacher'])`) | `analyticsRoutes.js` | `GET /class/:class_id` only; exports `invalidateAnalyticsCache` used by `server.js` on session end (implies an in-memory analytics cache inside the controller) |
| `/timetable` (`protect(['teacher'])`) | `timetableRoutes.js` | CRUD entries, Excel import/export, exceptions, settings — backs `reminderCron.js` |
| `/student-timetable` | `studentTimetableRoutes.js` | `GET /schedule`, student-only |

### 3.2 Socket.io — full room/event inventory (`server.js`, the one giant `io.on('connection', ...)` handler)

**Room families**: `class:<classId>` (every student auto-joins on connect), `session:<sessionId>` (broadcast session), `teacher_session:<sessionId>` (teacher-only subset), `teacher:<teacherId>` (one teacher across sessions/exams), `exam_waiting:<examId>` (room membership size = live count, self-cleaning on disconnect), **`connect:classroom:<classSubjectId>`** (Connect's one room family, registered as a *second, separate* `io.on('connection', ...)` listener — see §6.3).

**Connection-time**: student with `class_id` → joins `class:<classId>` + registers in `examStudentSockets`. Teacher → joins `teacher:<teacherId>`, then async-checks for an active session and auto-rejoins `session:`/`teacher_session:` if found (**applies to *every* socket that teacher opens, tab-agnostic, by design** — confirmed during the C9 integration pass; not a bug, don't "fix" it).

**Client-emitted events**:
| Event | Role | Room effect | Broadcasts |
|---|---|---|---|
| `exam:register_socket` | student | — | updates `examStudentSockets` map |
| `exam:join_waiting_room` | student | joins `exam_waiting:<id>` | `exam:waiting_count_update` → `teacher:<created_by>` |
| `teacher:start_session` | teacher | leaves old, joins new `session:`/`teacher_session:` | `session:started` → `class:<cid>` chain (or `io.emit` fallback only if `class_ids` empty — the one literal all-sockets broadcast in the file) |
| `teacher:end_session` | teacher | leaves rooms | writes `attendance` upserts, `teacher:attendance_exceptions` → `teacher_session:`, `session:ended` → `class:<cid>` chain, `invalidateAnalyticsCache` |
| `student:join_session` | student | joins `session:<id>` (or gated into `pendingRejoins` if a prior disconnect record exists) | `student:joined` → session room, `student:session_state` → self |
| `student:request_session_state` | any | — | `student:session_state` → self; may trigger `teacher:resend_offer_to_student` → specific teacher socket |
| `teacher:approve_rejoin`/`deny_rejoin` | teacher | approve joins pending student | `student:joined`/`rejoin_approved`/`rejoin_denied` |
| `webrtc:offer`/`answer`/`ice-candidate` | either | — | point-to-point via `socket.to(target_socket_id)`, not room-based |
| `webrtc:broadcast_started`/`_ended` | teacher | — | → `session:<id>` |
| `teacher:request_roster` | teacher | — | `teacher:roster_snapshot` → self |
| `teacher:mode_changed`/`code_changed`/`code_output`/`whiteboard_*` | teacher | — | → `session:<id>`, mutates in-memory `sessionStates` Map |
| `student:focus_lost`/`focus_regained` | student | — | → `session:<id>`, updates `sessionAttendance`, triggers `emitStudentStatusUpdate` |
| `disconnect` | any | implicit room leave | student: `disconnectedStudents` record + `student:left` + status update; teacher: clears session maps; cleans `examStudentSockets`/waiting-room count |

**In-memory state** (reset on restart, intentionally): `teacherSockets`, `disconnectedStudents`, `pendingRejoins`, `rejoinCounts`, `sessionStates`, `sessionModes`, `sessionAttendance`, `activeStudentSessions`, `examStudentSockets` — 8 Maps + 1 Set, all module-level in `server.js`. **Connect has zero in-memory state** — everything DB-backed, deliberately, since Connect data must survive server restarts (messages/polls/etc. aren't ephemeral like a live broadcast).

**Correction to a previous CLAUDE.md claim**: `task:*` and `doubt:*` do **not** exist as socket events anywhere in `server.js` — tasks and doubts are REST-only. Don't assume a socket namespace exists just because a REST domain does.

### 3.3 Full DB schema — non-connect tables (`config/dbSetup.js`)

```
classes(id, name)
users(id, name, email UNIQUE, password_hash, role CHECK∈{teacher,student,admin},
      class_id→classes SET NULL, roll_no, has_seen_tour, windows_username,
      default_reminder_delay_minutes)
sessions(id, lecture_name, subject, lab_room, password_hash, teacher_id→users,
         started_at, ended_at)
session_classes(session_id, class_id)                              -- composite PK join table
attendance(id, session_id→sessions CASCADE, student_id→users CASCADE, joined_at,
           left_at, total_present_seconds, fullscreen_exit_count,
           fullscreen_exit_log JSONB, presence_percentage, status,
           teacher_decision, decided_at, UNIQUE(session_id,student_id))
timetable_entries(id, teacher_id→users, day_of_week 0-6, start_time, end_time,
                   subject, class_id→classes, room, session_type,
                   reminder_enabled, reminder_delay_minutes,
                   last_triggered_date, last_reminder_sent_date)
timetable_exceptions(id, teacher_id→users, exception_date, UNIQUE(teacher_id,exception_date))
tasks(id, session_id→sessions CASCADE, title, description, allowed_languages TEXT[],
      time_limit_seconds, sequence_order, status, assigned_at, deadline_at, updated_at)
submissions(id, task_id→tasks CASCADE, student_id→users CASCADE, code, language,
            status, submitted_at, score, UNIQUE(task_id,student_id))
doubt_requests(id, task_id→tasks CASCADE, student_id→users CASCADE, code_snapshot,
               question_text, raised_at, status, hint_line_start/end,
               teacher_response_text, resolved_at)

-- exam cluster --
exams(id, session_id→sessions, title, question_type, num_sets, time_limit_minutes,
      violation_limit, status draft→waiting_room→active→ended, created_by→users)
exam_classes(exam_id, class_id)                                    -- join table
exam_sets(id, exam_id, set_number)
questions(id, exam_set_id, type, question_text, options JSONB, correct_option,
          language, starter_code, max_score, description)
exam_attempts(id, exam_id, student_id, exam_set_id, started_at, submitted_at,
              auto_submitted, status, UNIQUE(exam_id,student_id))
exam_answers(id, exam_attempt_id, question_id, selected_option, code_answer, score,
             UNIQUE(exam_attempt_id,question_id))
exam_violations(id, exam_attempt_id, violation_type, occurred_at)

-- Subject Catalog + Semester Allotments (added Aug 25, 2026) --
subjects(id, name UNIQUE, code, created_at)                        -- reusable catalog, not class/semester-scoped
subject_allotments(id, class_id→classes CASCADE, subject_id→subjects CASCADE,
                    semester INTEGER CHECK(1-8), teacher_id→users SET NULL,
                    created_at, UNIQUE(class_id,subject_id,semester,teacher_id))
    -- teacher_id nullable = "offered, teacher TBD". Creating/updating with a
    -- teacher auto-syncs a connect_class_subjects row (§6.1/§6.2); deleting
    -- the allotment or clearing its teacher_id archives (never deletes) the
    -- synced classroom.
```

`files` (Email My Folder) — **no table at all**, fully stateless beyond the in-memory rate-limit map.

### 3.4 Dead/deprecated files (confirmed still accurate)
`Backend/scripts/initDB.js` and `Backend/config/initDb.js` — both marked `// DEPRECATED: Superseded by Backend/config/dbSetup.js ... Kept for reference only`. Don't edit these thinking they do anything; `dbSetup.js` is the only live schema source, called automatically by `server.js` before `listen()`.

### 3.5 Backend dependencies worth knowing
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (B2 object storage, S3-compatible), `@getbrevo/brevo` (transactional email — reminder cron AND email-zip both use this directly), `bcryptjs`, `express` **5.2.1** (Express 5, not 4 — some ecosystem middleware assumes v4 APIs, check compat before adding new packages), `helmet`, `jsonwebtoken`, `jszip`, `multer`, `node-cron`, `nodemailer` (**installed but the actual code paths use `@getbrevo/brevo` directly — nodemailer looks unused/legacy, not confirmed via full grep**), `postgres` (the tagged-template `sql` client), `socket.io`, `xlsx` (CDN tarball, same as Frontend's).

### 3.6 `jobs/` and `scripts/`
`jobs/reminderCron.js` — the only job. 1-min `node-cron` tick, IST-aware (`utils/istTime.js`), finds overdue `timetable_entries`, sends Brevo email, marks sent. Not touched by Connect. `scripts/` — 16 one-off verify/test/maintenance scripts, not part of the running app, not deep-read in this pass beyond confirming the two deprecated files above.

---

## 4. `server.js` — Full Entrypoint Shape

Single entrypoint. Creates the Express `app` and one `http.Server`/Socket.io `Server` sharing one port. CORS: **Express REST CORS is `app.use(cors())` with no options — already unrestricted for every origin, for every route, predating Connect entirely.** Only the **Socket.io** CORS is actually origin-gated (explicit `http://localhost:5173`, explicit `http://localhost:5174` for Connect-Frontend's dev origin, and any `http://127.0.0.1:<port>` via regex — note `localhost` and `127.0.0.1` are different origins to a browser even though same host, so both had to be listed). Mounts every route module, registers the one big socket connection handler plus Connect's separate second one, then calls `dbSetup()` before `listen()`.

Auth: `middleware/authMiddleware.js`'s `protect(roles = [])` — decodes bearer JWT into `req.user`, 403s if `roles` non-empty and token role not included. DB: `config/db.js` exports one `postgres` (postgres.js) tagged-template `sql` client from `DATABASE_URL`; every controller imports it directly, no ORM.

---

## 5. Connect-Frontend (`Connect-Frontend/`) — Page Inventory

Own `createBrowserRouter`, teacher/student/admin layouts (same shape as `Frontend/`). **Real, feature-complete work — not boilerplate** (confirmed by reading actual fetch calls, not just filenames).

| File | Purpose |
|---|---|
| `pages/Login.jsx` | Shared-backend login. **Real bug, not fixed (frontend, out of scope for the backend-only pass that found it):** on success, `if (role === "teacher" \|\| role === "admin") navigate("/teacher")` — an admin is sent to the teacher dashboard, not `/admin`, even though a full working admin route tree exists and works if navigated to directly. |
| `pages/teacher/TeacherClassrooms.jsx` | Grid of teacher's own classrooms |
| `pages/student/StudentClassrooms.jsx` | Grid of student's enrolled classrooms |
| `pages/ClassroomStream.jsx` | **The core screen (~1789L).** 5-tab view — Stream/Announcements/Polls/Assignments/Materials — shared between teacher and student via a `role` prop |
| `pages/admin/AdminAllotments.jsx` | Admin CRUD for class-subject allotments (manual entry point, free-text subject name, no semester) — a second, still-live entry point alongside EduSync's Subject Allotments admin feature's one-way sync (see §6.1); no longer exposes a posting-mode picker (removed Aug 25, 2026) |
| `pages/admin/AdminAnnouncements.jsx` | Admin global/targeted announcement composer + history |

**Components**: `common/` (7, all real/feature-specific) — `ClassroomCard`, `AnnouncementCard`, `PollCard`, `AssignmentCard`, `MaterialCard`, `StudentSubmissionModal`, `TeacherGradingModal`, `Header`. `ui/` (6, small shadcn subset) — `avatar`, `badge`, `button`, `card`, `input`, `label`.

**Infra**: `config/api.js`, `context/AuthContext.jsx` (real login against `/auth/login`, separate localStorage keys `connect_edusync_token`/`connect_edusync_user`), `lib/socket.js` (own Socket.io singleton), `data/mockClassrooms.js` (**misleadingly named** — 980 lines, a real REST client with one function per real backend endpoint, zero mock data; leftover name from an early scaffold stage).

**Endpoint wiring** — every Connect backend endpoint is called except one pair:
- ✅ my-classrooms (teacher+student), messages (GET+POST, cursor pagination used correctly), posting-mode PATCH, announcements (classroom feed, POST, admin history), polls (GET+POST+vote), assignments (GET+POST+submit+submissions+grade), materials (GET+POST+download+DELETE), admin class-subjects CRUD, plus reused main-app endpoints (`/classes`, `/admin/users`) for admin dropdowns
- ❌ **`GET /connect/unread-summary` and `POST /connect/classrooms/:id/mark-seen` — zero references anywhere in `Connect-Frontend/`.** The unread-badge backend (built, tested, working) has no frontend consumer yet.

**File upload**: real `FileReader.readAsDataURL` → base64, matching the backend's base64-JSON-body convention exactly (not multipart/multer).

**Socket events used**: `connect:classroom:join`, `connect:message:new`, `connect:poll:updated`, plus — added Aug 25, 2026 — `connect:announcement:new`, `connect:assignment:new`, `connect:submission:graded`, `connect:material:new` (closing a prior gap where those three tabs only refreshed on mount/manual refresh) — verified to match the backend's actual event names verbatim.

**Design system**: `src/index.css` is a **separate, hand-copied** value-identical copy of `DESIGN.md`'s tokens — not a shared file/package. If `DESIGN.md` changes, this needs manual re-sync; no automated sync mechanism exists.

**Dependencies**: React 18.3.1, React Router 7.2.0, Vite 6.2.0, Tailwind 4.0.9, `socket.io-client` 4.8.1, `recharts`, `lucide-react`, a small Radix subset (avatar/dropdown-menu/label/slot). No test script, not even a stub.

**Deployment**: dev port fixed at 5174. **No `.env`/`.env.example` at all** — `API_BASE_URL` defaults to `http://localhost:3000`, no deployed-URL fallback (unlike `Frontend/`, which defaults to the Render URL) — a production build needs `VITE_API_URL` set explicitly or it'll silently target localhost. A `dist/` already exists (built at least once).

---

## 6. EduSync Connect Backend (`Backend/controllers/connect/`, `Backend/routes/connect/`)

Built across 9 sequential phases in one long session (C1 allotments → C2 UI polish n/a-backend-only → C3 messaging → C4 announcements+posting-mode → C5 polls → C6 assignments → C7 materials → C8 unread-counts → C9 integration/regression), plus a later Aug 25–26, 2026 pass (not part of the original C1–C9 numbering) adding: the Subject Catalog/Allotments sync (§6.1), open-discussion mode's removal, live socket updates for announcements/assignments/materials/grading, and Web Push notifications. All mounted under `/connect` in `server.js`, all in `routes/connect/connectRoutes.js` (single router file, extended each phase).

### 6.1 Core concept
One `connect_class_subjects` row = one (teacher, class, subject) allotment. This is "the classroom" — everything else hangs off `class_subject_id`. A teacher's classroom list is their own allotments (`GET /connect/teacher/my-classrooms`); a student's is every allotment matching their single `users.class_id` (`GET /connect/student/my-classrooms`). Display-name disambiguation (documented decision, not silently picked): teacher view shows `"ClassName(Subject)"` only when that teacher teaches >1 subject to that class, else just `"ClassName"` — **unless the row has a `semester` (i.e. it's synced, see below), in which case it's always `"ClassName(SemN) - Subject"`, skipping the disambiguation rule entirely**; student view shows `"Subject(TeacherName)"` only when >1 teacher teaches that subject to their class, else just `"Subject"` (unaffected by semester).

**Two entry points create/manage these rows** (added Aug 25, 2026 — previously only the first existed):
1. **Connect's own admin page** — `POST/GET/PUT/DELETE /connect/admin/class-subjects`, free-text `subject_name`, no semester. `subject_allotment_id` stays `NULL` on rows created this way.
2. **One-way sync from EduSync's Subject Catalog + Subject Allotments admin feature** (`Backend/controllers/connect/connectClassroomSync.js`, called from `subjectAllotmentsController.js`) — `subject_allotments` is the source of truth, Connect never writes back to it:
   - `syncClassroomForAllotment(...)`: creating/updating an allotment with a non-null `teacher_id` upserts the linked classroom, keyed by a `subject_allotment_id` column on `connect_class_subjects` (so a teacher reassignment updates the *same* row, preserving message/poll/assignment history) — falling back to `connect_class_subjects`' own `UNIQUE(teacher_id,class_id,subject_name)` constraint if a manually-created row already matches (links/revives it rather than erroring).
   - `archiveClassroomForAllotment(...)`: clearing an allotment's `teacher_id`, or deleting the allotment entirely, sets the linked classroom's `status = 'archived'` — **never deletes it**. Archived = read-only (history stays visible, no new posts of any kind via `isClassroomArchived()`/`canSendMessage()` in `connectAccessControl.js`) and dimmed in the UI (`ClassroomCard.jsx`). The owning teacher gets `DELETE /connect/teacher/classrooms/:id` to permanently remove it, but only once archived (refused on a still-active classroom, admin can still hard-delete a live one via `deleteClassSubject`).

### 6.2 Shared helpers (the load-bearing files)
- **`connectAccessControl.js`** — `resolveClassroomAccess(userId, role, classSubjectId)`: returns `{classroom, isTeacher, isStudent}` if the user may read/enter this classroom (teacher owns the row, or student's `class_id` matches), else `null`. `canSendMessage(access)`: **teacher only, and only if not archived** (updated Aug 25, 2026 — the old `posting_mode === 'open'` branch letting students post is gone; open-discussion mode was removed by product decision, students read + vote in polls, never post). `isClassroomArchived(access)`: the one shared check every other write path (announcements/polls/assignments/materials) layers on top of its own `isTeacher`/access gate — an archived classroom is read-only. **Every single Connect endpoint's access check goes through `resolveClassroomAccess`** — reused identically across REST and Socket.io, confirmed by a dedicated full-surface audit in C9 (20 unauthorized-access attempts across every resource type, all correctly 403'd, including an admin-role edge case since admin is neither "owner-teacher" nor "student").
- **`connectB2Upload.js`** — shared B2 (Backblaze, S3-compatible) upload helpers: `uploadBufferToB2`, `getPresignedUrlForKey` (fresh URL generated on every read, never baked into the DB — DB stores the object *key*, not a URL, despite column names like `attachment_url`/`file_url`), `deleteObjectFromB2`, `checkUploadRateLimit`/`decodeBase64File` (20MB cap, 5 uploads/hour — **mirrored, not imported, from `filesRoutes.js`'s constants**, since that file can't be edited to export them; kept numerically identical by comment convention, confirmed still in sync as of C9 since both `assignmentsController.js` and `materialsController.js` `require()` this same module rather than redefining anything). Reuses the **same** B2 bucket as EduSync's own Email-My-Folder feature, under a `connect-assignments/` key prefix (materials additionally nest under `connect-assignments/materials/`).
- **`connectSocketController.js`** — registers a **second, separate** `io.on('connection', ...)` listener (not edited into the existing one), handling `connect:classroom:join` (validates access, joins `connect:classroom:{id}` room, rejects with `connect:error` — doesn't disconnect the whole socket, since it's shared with the rest of the app) and `connect:message:send` (re-validates access, archived status, and teacher-only server-side, persists, broadcasts `connect:message:new`, then queues a push via `sendPushToUsers`).
- **`connectClassroomSync.js`** (added Aug 25, 2026) — `syncClassroomForAllotment`/`archiveClassroomForAllotment`, the one-way sync from `subject_allotments` into `connect_class_subjects` — see §6.1.
- **`connectNotify.js`** (added Aug 25, 2026) — recipient resolution for push: `resolveClassroomRecipients(classSubjectId)` returns `{teacherId, studentIds}` for one classroom; `resolveAllConnectRecipients()` returns every teacher/student across *every* classroom (used for `is_global` announcements). Both reuse the same `users.class_id` match `myClassroomsController.js` relies on, so recipient resolution can't drift from what "being in this classroom" means elsewhere.
- **`connectPushSender.js`** (added Aug 25, 2026) — `sendPushToUsers(userIds, {title, body, url})`, the one shared Web Push entry point every trigger below calls. Wraps the `web-push` npm package; `webpush.setVapidDetails(...)` only runs if `VAPID_SUBJECT`/`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are all set — **a real crash-on-boot bug was caught and fixed here** (commit `481f9c0`, Aug 26, 2026): calling `setVapidDetails` unconditionally at module load crashed the entire server (not just push) on Render, which only had the keys in a local `.env`, never in its own dashboard env vars. Now: missing/incomplete keys log a warning and every call becomes a silent no-op. A subscription that comes back 404/410 (expired/revoked) is deleted from `connect_push_subscriptions` on the spot.
- **`pushController.js`** (added Aug 25, 2026) — `getVapidPublicKey` (`503` if unconfigured, per the fix above), `subscribe`/`unsubscribe` (upsert/delete by `endpoint`, the globally-unique key a browser's push subscription is keyed on).

### 6.3 Feature-by-feature endpoint map
| Feature | Endpoints | Notes |
|---|---|---|
| Allotments (admin) | `POST/GET/PUT/DELETE /connect/admin/class-subjects` | `posting_mode` is no longer client-settable (updated Aug 25, 2026) — every row is `teacher_only`. |
| My classrooms | `GET /connect/teacher/my-classrooms`, `GET /connect/student/my-classrooms` | Display-name logic, see §6.1 |
| Teacher: delete archived classroom | `DELETE /connect/teacher/classrooms/:id` | Added Aug 25, 2026. Own-row-only, and only once `status = 'archived'` (400 if still active) — see §6.1's sync/archive behavior. |
| Messaging | `GET/POST /connect/classrooms/:id/messages` (cursor pagination on message `id`, `before`/`limit`) + Socket.io `connect:message:send`→`connect:message:new` | REST is a fallback path; socket is primary. REST send also broadcasts via `req.app.get('io')`. Both paths now also push-notify the classroom's students via `sendPushToUsers` (added Aug 25, 2026). |
| Announcements | `POST /connect/announcements` (role-branched: teacher→own classroom(s) only, admin→specific classroom(s) OR `is_global`, never both), `GET /connect/classrooms/:id/announcements` (targeted ∪ global), `GET /connect/admin/announcements` (admin's own history) | Teacher setting `is_global:true` gets a hard 403, not a silent strip. Now also broadcasts `connect:announcement:new` to every targeted room (or every classroom room if global) and pushes: students always, **plus the owning teacher(s) when the announcement is admin-authored** (added Aug 25, 2026). |
| Polls | `POST/GET /connect/classrooms/:id/polls`, `POST /connect/polls/:id/vote`, `GET /connect/polls/:id/results` | `UNIQUE(poll_id,user_id)` DB constraint — no vote-changing in v1, duplicate vote is a real 409 from the constraint, not just an app check. Vote broadcasts `connect:poll:updated` to the room. No push notification for polls (not in the agreed trigger list). |
| Assignments | `POST/GET /connect/classrooms/:id/assignments`, `POST /connect/assignments/:id/submit`, `GET /connect/assignments/:id/submissions`, `PUT /connect/submissions/:id/grade` | Resubmission is `ON CONFLICT (assignment_id,student_id) DO UPDATE` — same row, not a new one, and clears any prior grade. `is_late` computed once at submit time against `due_at`. Submission ownership for list/grade checked via `creator_id` directly (not "current classroom teacher," in case of a future reassignment). Creating an assignment now broadcasts `connect:assignment:new` + pushes the classroom's students; grading now broadcasts `connect:submission:graded` + pushes that one student (added Aug 25, 2026). |
| Materials | `POST/GET /connect/classrooms/:id/materials`, `GET /connect/materials/:id/download`, `DELETE /connect/materials/:id` | List returns metadata only, no baked link (materials are browsed repeatedly, unlike Email-My-Folder's one-time delivery). Delete removes the DB row **and** the real B2 object (verified via `HeadObjectCommand` returning 404 after delete, not just a claim). Uploading now broadcasts `connect:material:new` to the room (added Aug 25, 2026) — **no push notification** for materials (not in the agreed trigger list, socket-only). |
| Unread counts | `POST /connect/classrooms/:id/mark-seen`, `GET /connect/unread-summary` | Single `last_seen_at` timestamp per (user, classroom) — not per-message read receipts. Summary is 3 batched aggregate queries (messages/announcements/ungraded-submissions) across *all* the user's classrooms at once, not N+1 per classroom. Ungraded-submissions count is **not** time-gated by `last_seen_at` — it's a standing "needs action" count, not a since-you-looked count. **No frontend consumer yet** — see §5. |
| Web Push (added Aug 25, 2026) | `GET /connect/push/vapid-public-key` (`503` if unconfigured), `POST/DELETE /connect/push/subscribe` | `protect()`, no role restriction — both students and teachers subscribe. See §6.2's `connectPushSender.js`/`pushController.js`. |

### 6.4 Full `connect_*` schema (`config/dbSetup.js`, additive-only block)
```
connect_class_subjects(id, teacher_id→users, class_id→classes, subject_name,
    posting_mode CHECK∈{teacher_only} DEFAULT teacher_only, created_at,
    subject_allotment_id→subject_allotments SET NULL, semester INTEGER,
    status CHECK∈{active,archived} DEFAULT active,
    UNIQUE(teacher_id,class_id,subject_name))
    -- posting_mode's CHECK was tightened to teacher_only-only on Aug 25,
    -- 2026 (existing 'open' rows migrated first) — see §6.1/§6.2.
    -- subject_allotment_id/semester/status added same day for the sync
    -- from EduSync's Subject Allotments feature — see §6.1.
connect_messages(id, class_subject_id→connect_class_subjects CASCADE,
    sender_id→users, sender_role, content, created_at)
connect_announcements(id, author_id→users, author_role, content,
    is_global BOOLEAN DEFAULT false, created_at)
connect_announcement_targets(id, announcement_id→connect_announcements CASCADE,
    class_subject_id→connect_class_subjects CASCADE)          -- empty rows when is_global
connect_polls(id, class_subject_id→connect_class_subjects CASCADE, creator_id→users,
    question, closes_at NULL=open-indefinitely, created_at)
connect_poll_options(id, poll_id→connect_polls CASCADE, option_text, display_order)
connect_poll_votes(id, poll_id→connect_polls CASCADE, option_id→connect_poll_options CASCADE,
    user_id→users, voted_at, UNIQUE(poll_id,user_id))
connect_assignments(id, class_subject_id→connect_class_subjects CASCADE, creator_id→users,
    title, description, attachment_url TEXT (B2 key), due_at NULL=no-deadline, created_at)
connect_submissions(id, assignment_id→connect_assignments CASCADE, student_id→users,
    text_content, file_url TEXT (B2 key), submitted_at, is_late BOOLEAN, grade NUMERIC,
    feedback, graded_at, graded_by→users, UNIQUE(assignment_id,student_id))
connect_materials(id, class_subject_id→connect_class_subjects CASCADE, uploader_id→users,
    title, file_url TEXT (B2 key) NOT NULL, file_type, file_size_bytes, created_at)
connect_read_state(id, user_id→users, class_subject_id→connect_class_subjects CASCADE,
    last_seen_at, UNIQUE(user_id,class_subject_id))
connect_push_subscriptions(id, user_id→users CASCADE, endpoint TEXT UNIQUE,
    p256dh, auth, created_at)                      -- added Aug 25, 2026, one row per browser/device
```

### 6.5 `server.js` changes made for Connect (all additive, nothing existing edited)
1. `app.use('/connect', express.json({ limit: '35mb' }), require('./routes/connect/connectRoutes'));` — mounted *before* the generic `bodyParser.json()`, own 35MB limit (mirrors `/files`'s exact number — 20MB base64-encoded needs ~26.7MB of body room). **A real bug was caught and fixed here during C6**: the mount originally sat *after* the generic parser, silently capping uploads at Express's tiny default limit — the 20MB check in `connectB2Upload.js` was unreachable dead code until this was found by actually sending a 21MB payload and getting a 413 from the wrong layer.
2. `require('./controllers/connect/connectSocketController')(io);` — one line, registers Connect's second connection listener.
3. Socket.io CORS: two new explicit origin checks (`http://localhost:5174` for Connect-Frontend dev; production URL not yet known, do not guess one — ask when it's deployed).
4. A **pre-existing, unrelated** bug was also fixed while chasing a local-boot blocker in C1: `dbSetup.js`'s `users_role_check` constraint block could intermittently crash boot (DROP reporting "doesn't exist" while ADD still hit a duplicate — a race against the shared Neon DB). Wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`. Not a Connect feature, just a boot-blocker fixed along the way with explicit permission.

### 6.6 Verification method used throughout all 9 phases
Every phase was verified against the **real shared Neon Postgres DB** (not a local/mocked one) — real JWTs signed locally with the real `JWT_SECRET` for existing accounts, real HTTP requests, real Socket.io client connections, real B2 uploads/downloads (content byte-verified), real duplicate-constraint 409s (not app-level pre-checks masquerading as DB checks), test data always cleaned up afterward. C9 additionally ran a full combined regression (all 6 features in one continuous real sequence) and a dedicated cross-feature access-boundary audit.

---

## 7. Known Gaps, Drift, and Bugs Found (Aug 25, 2026 full-codebase audit)

Recorded here even though some were fixed elsewhere, per the principle that *what was actually wrong* matters, not just the after-state:

1. **PRD's tech stack said "Zustand"** — never adopted, not a dependency. Fixed in the PRD (§4.1).
2. **PRD's Feature 10 Part A referenced `MyFiles.jsx`** as an existing scaffold — that file no longer exists in the codebase. Fixed in the PRD.
3. **CLAUDE.md's socket room/event lists were incomplete/wrong** — missing `exam_waiting:<id>` and (now) `connect:classroom:<id>`; claimed `task:*`/`doubt:*` socket namespaces that don't actually exist (those domains are REST-only). Fixed in CLAUDE.md.
4. **`context.md` flags `SessionRecording.jsx` as a dead-end scaffold** — confirmed false as of this audit (fully functional). Left `context.md` itself unedited (it's an explicitly historical log, not a living doc, per its own framing and per `CLAUDE.md`'s existing caveat about it) — but the correction is now recorded in `CLAUDE.md` and here.
5. **Connect-Frontend's admin login redirects to `/teacher`**, not `/admin` — real bug, confirmed by reading the actual conditional, not fixed (frontend change, out of scope for a backend-only integration pass; flagged in PRODUCT.md and here for a future Connect-Frontend session).
6. **`GET /connect/unread-summary` / `POST /connect/classrooms/:id/mark-seen` have no frontend consumer** — backend built and verified working (C8), but `Connect-Frontend/` never calls either endpoint. No unread badges are visible in the UI despite the backend being ready.
7. **The C6 body-size-limit bug** (§6.5, point 1) — a real, self-caught bug where Connect's own 20MB upload check was unreachable due to route-mount ordering, found by testing with an actual oversized payload rather than trusting the code.
8. **A pre-existing `dbSetup.js` boot-race bug** (§6.5, point 4) fixed incidentally while unblocking local verification — unrelated to Connect, fixed with explicit permission since it blocked all local backend testing.
9. **`nodemailer` appears to be an unused/legacy dependency** in `Backend/package.json` — the actual email code paths (reminder cron, email-zip) both use `@getbrevo/brevo` directly. Not confirmed unused via exhaustive grep; flagged, not removed (removing dependencies wasn't in scope for a documentation pass).
10. **A Socket.io behavior initially mistaken for a Connect leak, then correctly diagnosed as pre-existing main-app behavior**: any of a teacher's concurrently-open sockets (e.g. one tab on EduSync, one on Connect) auto-rejoins that teacher's active broadcast session's rooms on connect, if one exists — by design, for page-refresh reconnects, and applies regardless of which "app"/tab a socket represents. Verified via a corrected dual-tab test (connecting sockets *before* the session existed) that showed zero actual cross-product leakage once the test's own ordering artifact was removed.

---

## 8. Doc Map — What Lives Where

| Doc | Covers | Authority |
|---|---|---|
| `codeBaseContext.md` (this file) | Deep technical detail, both products, full inventories | Refresh by re-reading the code; don't hand-edit stale entries, replace them |
| `CLAUDE.md` | High-level architecture + gotchas for both products, kept short | Read first, points here for depth |
| `PRODUCT.md` | EduSync's product scope/positioning + a Connect summary + company relationship | Primary product-truth source for EduSync; treat over the PRD if they disagree |
| `PRD_Smart_Teaching_Lab_Management_Platform.md` (v1.4) | EduSync's full PRD, feature-by-feature, plus a Connect summary in §11 | EduSync's own detailed spec; Connect's real spec doesn't live here (no Connect PRD exists yet — if EduSync Connect gets one, it belongs in its own document, not folded into this one, since they're separate products) |
| `DESIGN.md` | EduSync's (`Frontend/`) design system/tokens | `Connect-Frontend/` hand-copies these values, not synced automatically |
| `context.md` | Historical session log (design audits, past bugs) | Background only, not authoritative for current state — verify against files |
| `README.md` / `SETUP.md` | Local setup walkthrough | — |
