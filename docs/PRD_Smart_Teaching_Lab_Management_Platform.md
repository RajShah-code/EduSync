# Product Requirements Document (PRD)
## Smart Teaching & Lab Management Platform
**Version:** 1.5
**Date:** August 2026
**Status:** Draft — Section 9 (Admin module) still pending requirements;
Section 10 added July 28, 2026 for a future Windows-login-based attendance
capability (design-only, not yet built; partial client-side groundwork now
exists, see Section 10.8); Feature 10 (Section 3.2) updated
August 1, 2026 to reflect the shipped "Email My Folder" implementation,
which diverges from the original wording below; Section 11 added
August 25, 2026 documenting **EduSync Connect**, a separate companion
product under the same parent company (Archway) — not a section of this
PRD's own scope, but tracked here for visibility since it shares this
backend; Section 11 updated August 26, 2026 — open-discussion posting
mode (11.3) was built and then removed by product decision, a Subject
Catalog + Semester Allotments admin feature (new §11.5) now syncs
curriculum data into Connect classrooms, and Web Push notifications
(11.3) shipped for Connect.

---

## 1. Overview

### 1.1 Product Summary
A web-based Smart Teaching & Lab Management Platform designed specifically for computer laboratories in universities and colleges. The platform provides a unified digital environment for faculty and students, covering live teaching, attendance, task management, secure exams, and performance analytics.

### 1.2 Problem Statement
University computer labs face several recurring challenges:
- Teachers cannot effectively share their screen with all students simultaneously
- Manual attendance is time-consuming and prone to proxy entries
- Practical exams lack integrity controls and secure environments
- There is no centralized system to track student progress during lab sessions
- Students have no remote access to their lab files and submissions

### 1.3 Goal
To modernize computer lab education by combining live teaching, automated attendance, secure assessments, remote file access, and performance analytics into a single, efficient, and reliable platform.

---

## 2. Users

### 2.1 Primary Users

| Role | Description |
|---|---|
| **Faculty / Teacher** | Creates sessions, assigns tasks, conducts exams, monitors students, views analytics |
| **Student** | Attends sessions, submits tasks, appears in exams, accesses files remotely |

### 2.2 Role Separation
- Teachers and Students have strictly separate dashboards, permissions, and capabilities
- No feature overlap between roles unless explicitly defined

---

## 3. Features

### 3.1 Core Features *(Build First)*

---

#### Feature 1 — Live Screen Broadcast
**Description:** Teachers can share their screen in real time with all connected students in a lab session.

**Requirements:**
- Teacher initiates broadcast from their dashboard
- All connected students immediately see the teacher's screen
- Supports live coding, browser, presentations, IDEs, and any screen content
- Low-latency, stable stream during the full session
- Students cannot interact with or control the broadcast

**User Stories:**
- As a teacher, I want to share my screen so that all students can follow my live coding demonstration.
- As a student, I want to see the teacher's screen clearly so that I do not miss any part of the session.

---

#### Feature 2 — Student Activity Monitoring
**Description:** Teachers can view and monitor student screens during active lab sessions.

**Requirements:**
- Teacher dashboard shows a grid view of all active student screens
- Teacher can click on any student screen for a full-size view
- Activity status (active / idle) is visible per student
- No control over student systems — view only

**User Stories:**
- As a teacher, I want to monitor student screens to ensure focus and discipline during lab hours.

---

#### Feature 3 — Automatic Attendance System
**Description:** Attendance is automatically recorded based on student login and activity during a session.

**Requirements:**
- Attendance marked when student logs in during an active session
- Idle or inactive students flagged as partially present or absent
- No manual attendance entry required
- Teacher can view attendance report per session
- Proxy attendance prevented through activity tracking

**Note (added July 28, 2026):** the current implementation marks attendance
from **web-app login and in-session activity**. Section 10 describes a
planned, deeper alternative/complement — capturing attendance directly from
the lab's **Windows Server domain login**, which was the originally
promised behavior to the BCA Director. See Section 10 for full design;
this is not yet built and does not change Feature 3 as currently
implemented.

**User Stories:**
- As a teacher, I want attendance to be tracked automatically so that I do not waste lab time on manual roll calls.
- As a student, I want my attendance to reflect my actual presence and activity.

---

#### Feature 4 — Task & Coding Exercise Assignment
**Description:** Teachers can assign coding tasks or exercises to students with defined time limits and track progress in real time.

**Requirements:**
- Teacher creates a task with title, description, time limit, and allowed languages
- Task is pushed to all students in the session
- Students work in an integrated in-browser code editor (Monaco Editor)
- Teacher sees live progress — started, in progress, submitted
- Students submit work digitally before time expires
- Teacher can review all submissions after the session
- **(Added August 1, 2026)** After a successful submission, the student is
  optionally prompted to save a local copy of their submitted code to disk
  (correct file extension auto-selected by language), using the same
  File System Access API pattern established in Feature 6. This is a
  convenience save, entirely separate from and never blocking the actual
  submission to the teacher.

**User Stories:**
- As a teacher, I want to assign a coding task and monitor which students are actively working on it.
- As a student, I want to receive tasks directly in the platform and submit my code without switching tools.

---

#### Feature 5 — Secure Practical Exam Mode
**Description:** A dedicated exam environment with strict controls to ensure fairness and integrity.

**Requirements:**
- Teacher creates an exam with a question bank
- Each student receives randomized or unique questions from the bank
- Fixed time limit is enforced — countdown visible to students
- Access to unauthorized applications can be restricted during exam
- Student screen auto-locks immediately when time expires
- No submission accepted after lock
- Teacher can review all exam submissions

**Status:** Complete and fully closed as of July 28, 2026 (see TASKS.md
Phase 10 for full verification/closure history).

**User Stories:**
- As a teacher, I want each student to receive different questions to prevent copying.
- As a student, I want to know exactly how much time I have remaining during the exam.
- As a teacher, I want student screens to lock automatically when time ends without any manual action.

---

### 3.2 Enhancement Features *(Add After Core)*

---

#### Feature 6 — Session Recording

**Status:** Complete (teacher-side only) as of July 31, 2026 — see
TASKS.md Phase 11 for full build history.

**Description:** Teacher can capture and save their own screen recording
locally during a lab session, for their own later use (e.g. sharing with
students outside the platform, personal review).

**Scope decision (locked in before build — narrower than the original
wording below):** no backend, no database, no upload, no student-side
access via the platform. Purely a teacher-side capture-and-save-locally
feature. If a "student can watch past recordings from their dashboard"
version is wanted later, this needs a fresh scope conversation and
backend/storage work not currently planned.

**As originally scoped (superseded by the above):**
- ~~Teacher can start and stop recording during a session~~
- ~~Recordings stored and accessible from the student dashboard~~
- ~~Useful for absent students, revision, and academic review~~

**As actually built:**
- Teacher starts/stops recording independently of (or alongside) the live
  broadcast, via real `MediaRecorder` capture
- Teacher is prompted to choose a save location at recording start
  (File System Access API — `showSaveFilePicker`), with the file written
  directly to disk as it records, rather than buffered and downloaded
  after the fact
- Auto-pause/resume tied to the in-app screen-share stop/start cycle, so
  no black/frozen frames are captured during a paused broadcast
- Fallback for browsers without File System Access API support (Firefox,
  Safari): in-memory capture + download link at Stop, clearly noted in-app
- Recording is safely finalized even if the teacher navigates away
  mid-recording without clicking Stop

---

#### Feature 7 — Analytics Dashboard
**Description:** Faculty can view detailed insights on student and class performance.

**Requirements:**
- Attendance trends over time (per student and per class)
- Task completion rates
- Exam scores and performance comparisons
- Identify students falling behind
- Exportable reports

---

#### Feature 8 — Offline Fail-Safe Mode
**Description:** Student work is preserved during network interruptions.

**Requirements:**
- Work in progress is saved locally on the student's browser/system
- Auto-syncs to the server once internet connection is restored
- No data loss during temporary network failures

---

#### Feature 9 — Multi-Language & IDE Support
**Description:** Platform supports multiple programming languages and development environments.

**Requirements:**
- In-browser Monaco Editor supports syntax highlighting for multiple languages
- Teacher can define allowed languages per task or exam
- Supports at minimum: Python, JavaScript, C, C++, Java

---

#### Feature 10 — Remote File Access (Students)

**Status:** Split into two independent directions, tracked separately —
**Part B is complete and merged to `main` as of August 1, 2026.** Part A
is not started. See TASKS.md Phase 12 for full build history.

**As originally scoped (this section, prior to August 1, 2026):**
> Students can access their lab files, submissions, and assigned materials
> from outside the lab. Student can log in from home or any device. Access
> to past submissions, assigned tasks, and session materials. Cannot access
> other students' files. Read and download access only for past sessions;
> submission allowed for active tasks.

This original wording assumed an always-available backend a student could
log into remotely at any time. In practice, the university lab server is
**not expected to run 24/7**, which would make that model unreliable for
real use. The feature was split into two parts to address this:

##### Part A — Dashboard File Access *(original direction, NOT STARTED)*
The original vision above — student logs into the platform from anywhere,
browses past submissions/materials/recordings from a dashboard. Remains a
possible future direction, particularly attractive if/once the backend is
properly deployed (Phase 17) and can reasonably be expected to stay
reachable. Not scoped in further detail yet. *(Note, Aug 25, 2026: the
`MyFiles.jsx` scaffold this section previously referenced no longer exists
in the codebase — confirmed via a full frontend read; either renamed,
removed, or superseded. If Part A is picked up, it starts from scratch,
not from that file.)*

##### Part B — "Email My Folder" *(BUILT & SHIPPED, August 1, 2026)*
A lab-only, no-server-dependency alternative that sidesteps the 24/7-uptime
problem entirely: the file is delivered to the student at send-time (while
still at the lab, server definitely up), not fetched on-demand later.

**How it works:**
1. Student selects a local folder and/or individual files from their lab
   PC (`window.showDirectoryPicker()` for folders, `showOpenFilePicker()`
   for individual files — both feed the same pipeline and can be combined
   in one send)
2. Files are zipped client-side in the browser (`jszip`), with a live
   size/progress display
3. Student enters a recipient email address (not required to match their
   platform account email) and sends
4. Backend uploads the zip to a private Backblaze B2 bucket
   (S3-compatible object storage) and emails the student a temporary,
   expiring download link — **not the zip itself as an attachment**
5. Link expires after 48 hours; the underlying file is automatically
   deleted from storage shortly after via a bucket lifecycle rule (2 days
   to hide, 1 day to delete)

**Why a link instead of an attachment:** Gmail scans the contents of zip
attachments (including nested zips) and permanently blocks certain file
extensions — `.js`, `.jar`, `.exe`, `.bat`, `.ps1`, and others — even when
zipped, with no workaround via renaming the container or password-
protecting the archive (Gmail blocks encrypted archives outright too,
since it can't scan inside them). Since JavaScript is a supported platform
language, this would have affected real student submissions constantly.
Emailing a link instead of an attachment means Gmail's content-scanning
never triggers, for any file type, with original filenames always
preserved exactly as saved.

**Requirements (as built):**
- `POST /files/email-zip`, JWT-protected (student role only)
- Server-side email format validation
- 20MB payload cap per send (well under Gmail's own 25MB attachment
  ceiling, chosen for headroom even though attachments are no longer used,
  and to keep B2 usage predictable)
- Rate limit: 5 sends per student per hour, counted only on **confirmed
  successful** sends — a failed send (e.g. a B2 or SMTP hiccup) does not
  consume a student's quota
- Download link never returned to the browser/frontend — travels only via
  the email itself, reducing exposure risk on shared lab PCs
- Limits ("Max size: 20MB per send · Up to 5 sends per hour") shown
  visibly in the UI
- Queued items (folder and/or individual files) can be reviewed and
  individually removed, or cleared entirely, before sending
- Zip-build and send progress shown as live percentages

**Explicitly NOT included in Part B, by design:**
- No student dashboard access to past sends — this is a one-time, in-the-
  moment delivery mechanism, not a file archive (that's Part A's job, if
  pursued)
- No password-protected zips — confirmed non-viable, Gmail blocks
  encrypted archives regardless of content
- Folder-picker dialogs do not show individual file contents while
  selecting — this is a genuine OS/browser security boundary, not fixable
  client-side (addressed instead by offering the separate individual-file
  picker as a second option)

**Storage & scale notes:**
- Backblaze B2 chosen over Cloudflare R2 specifically because R2 required
  a payment card to activate (which failed during setup — prepaid card
  rejected) while B2's standard tier requires no card at all; free tier:
  10GB storage, effectively unlimited uploads, 2,500 free downloads/day
- Storage bucket is fully separate from Raj's personal Google account —
  zero risk to personal Gmail/Drive storage regardless of platform usage
- At full hypothetical university scale (~960 students: BCA + BTech, 4
  years, 2 divisions, 60/division), API operation usage stays under 1% of
  free-tier limits; **storage retention window is the actual constraint
  that matters at scale**, managed via the short (2-day) lifecycle rule
  rather than a longer default
- Sender identity uses a dedicated `edusync.platform@gmail.com` account,
  separate from Raj's personal Gmail, to avoid mixing personal and
  platform identity ahead of any university evaluation

**User Stories:**
- As a student, I want to send my own lab work to my personal email so I
  have a copy outside the lab, without needing the university server to
  stay online later.
- As a student, I want to be warned clearly about size and rate limits so
  I'm not surprised by a rejected send.
- As a teacher/admin, I want this to work reliably regardless of whether
  the university's own server is running outside of active lab hours.

---

## 4. Tech Stack

### 4.1 Frontend
| Layer | Technology |
|---|---|
| Framework | React.js |
| Styling | Tailwind CSS |
| State Management | No global state library — per-layout React state passed to child pages via React Router's `<Outlet context={{...}}>`, plus two small localStorage-backed helpers (`store/sessionStore.js` for resumable-session state, `utils/recordingsStore.js` for the local recordings index). *(Corrected Aug 25, 2026 — this row previously said "Zustand," which was never actually adopted; it is not a dependency in `package.json`.)* |
| Real-time UI Updates | Socket.io Client |
| Code Editor (in-browser) | Monaco Editor |
| Client-side zip creation | JSZip *(added Aug 1, 2026 — Feature 10 Part B)* |

### 4.2 Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Real-time Communication | Socket.io |
| Authentication | JWT (role-based: Teacher / Student) |
| File Handling | Multer |
| Email delivery | Nodemailer (Gmail SMTP) *(added Aug 1, 2026 — Feature 10 Part B)* |
| Object Storage | Backblaze B2 (S3-compatible, via `@aws-sdk/client-s3` + presigned URLs) *(added Aug 1, 2026 — Feature 10 Part B)* |

### 4.3 Database
| Purpose | Technology |
|---|---|
| Primary Database | PostgreSQL |
| Real-time / Session Data | Redis |
| File Storage | Local storage (move to S3/MinIO later) — **superseded for Feature 10 Part B specifically, which uses Backblaze B2**; still applies elsewhere as originally scoped |

### 4.4 Real-time & Broadcast
| Purpose | Technology |
|---|---|
| Screen Broadcast | WebRTC |
| Signaling Server | Socket.io |
| Session Recording | MediaRecorder API + File System Access API (direct-to-disk save) |

### 4.5 Deployment *(Later Stage)*
| Purpose | Technology |
|---|---|
| Reverse Proxy | Nginx |
| Hosting | AWS EC2 / DigitalOcean / University Server |

---

## 5. Design & UX Constraints

- UI must be minimal, professional, and academic in appearance
- Optimized for desktop lab systems (primary target)
- No unnecessary animations or visual clutter
- Fast loading and reliable during live sessions
- Teacher dashboard: clean and distraction-free
- Student dashboard: shows live screen, tasks, exam status, recordings
- Navigation: simple and intuitive for real lab environments

---

## 6. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Performance** | Real-time features must feel low-latency and stable |
| **Security** | JWT-based auth, role separation, exam access control |
| **Reliability** | Offline fail-safe for student work |
| **Scalability** | Modular structure — features expandable later |
| **Compatibility** | Web-based, works on all modern browsers |

---

## 7. Development Approach

- Build core features first, enhancements second
- Focus on clarity over complexity
- Features built step-by-step in this order:
  1. Authentication (Teacher / Student login with JWT)
  2. Live Screen Broadcast (WebRTC + Socket.io)
  3. Student Activity Monitoring
  4. Automatic Attendance
  5. Task Assignment & Code Editor
  6. Secure Exam Mode
  7. Session Recording
  8. Analytics Dashboard
  9. Offline Fail-Safe
  10. Remote File Access

---

## 8. Out of Scope
- Mobile app (web only, desktop first)
- Video conferencing / audio between teacher and students
- Third-party LMS integrations (e.g., Moodle, Canvas)
- AI-based grading or plagiarism detection *(can be added later)*
- Docker / containerization *(deferred to deployment phase)*

---

## 9. Future Consideration — Admin Department Module

### 9.1 Status: Requirements Not Yet Gathered
Raj has not yet had a detailed requirements discussion with his university's
admin staff. This section is a placeholder to track intent, not a spec.

**Known so far:**
- New student admission workflow — admin fills out and manages admission
  forms for incoming students
- Possibly additional administrative features, to be defined after
  requirements are gathered

**Do not begin implementation** on this module until requirements are
confirmed with the university and this section is updated with specifics.

### 9.2 Open Question — Scope of Ambition (Unresolved)
During an informal review, a professor suggested the platform could grow
into a replacement for the university's existing ERP system, rather than
remaining a lab-focused teaching tool. This is a materially different scope
than what this PRD currently covers (Sections 1–8), and no decision has been
made yet on:
- Whether to pursue this expanded scope at all, or keep the Admin module
  bounded to admissions-only as a companion feature to the core lab platform
- Whether the product should be renamed if the scope does expand
- What the actual requirements of a full ERP replacement would even be —
  this has not been scoped, costed, or discussed with the university

This is flagged here so it isn't lost, and so any admin-module work done
in the meantime is built with awareness that the surrounding scope may
change. It is explicitly **not** a commitment to build a full ERP.

---

## 10. Future Consideration — Windows Domain Login-Based Attendance (GPO Approach)

### 10.1 Status: Design Only — Not Yet Built
*(Added July 28, 2026.)* This section documents a planned attendance
capability distinct from Feature 3 as currently implemented. It exists
because of a specific commitment already made to the university, described
below, and is tracked here so that commitment has a real, reviewed plan
behind it rather than being an open promise.

### 10.2 Background
When Raj originally pitched this project to the BCA Department Director,
he stated that attendance would be captured **directly from each student's
Windows login** on the lab's domain-joined systems — not from web-app
login/activity, which is what Feature 3 currently implements. The Director
flagged this as one of the hardest parts of the proposal and suggested
considering an alternative, but no scope change was formally agreed —
the commitment stands as originally stated.

### 10.3 Why This Is Hard, Precisely
A browser-based web application has **no access to the host operating
system's login session** by design — this is a deliberate browser security
boundary, not a limitation specific to this project's tech stack. No
amount of JavaScript, browser API, or web-app-side cleverness can read
which Windows user is logged in, when they logged in, or which machine
they're on. This is the accurate technical basis for the Director's
warning, and it should not be quietly worked around or overstated as
"already handled" — it genuinely cannot be done from the web app alone.

### 10.4 Why It Is Still Achievable
The lab environment itself resolves this constraint. The lab's computers
are joined to a Windows Server domain, with centralized login and existing
Z-drive network storage — meaning the infrastructure needed for
login-triggered automation **already exists** and does not need to be
introduced. Specifically:

- **Group Policy (GPO)** logon scripts are a native, standard Windows
  Server domain feature — they run automatically the moment a domain
  user logs into any domain-joined machine, without requiring the user to
  do anything.
- This is a widely used, non-experimental technique — it is how many
  enterprise and institutional networks already handle login-triggered
  automation (asset checks, drive mapping, attendance/access systems).

This section proposes using exactly this mechanism, scoped narrowly and
safely, described below.

### 10.5 Proposed System Design (Summary — see standalone design document for full detail)

**High-level flow:**
1. Student logs into any lab PC using their existing domain account (no
   change to how they currently log in).
2. A GPO-assigned logon script fires automatically and silently in the
   background.
3. The script reads only the **Windows username** (`%USERNAME%`) and
   **machine name** (`%COMPUTERNAME%`) — never the password, and no other
   system or Z-drive data.
4. The script sends a single attendance-ping HTTP request to the EduSync
   backend containing this information plus a timestamp.
5. The EduSync backend maps the Windows username to the corresponding
   student record (via a one-time username-to-student mapping table set up
   by the admin) and marks attendance automatically for any active session
   that student is enrolled in.

**Explicitly not part of this design:**
- The Windows domain login **password** is never read, transmitted, or
  stored by EduSync at any point.
- No existing Z-drive files, permissions, or shares are read, modified, or
  interacted with.
- No existing GPOs are edited or replaced — this is implemented as an
  additional, separately scoped GPO applied only to the relevant
  student/lab organizational unit (OU).

**Relationship to the existing Electron desktop port (Phase 16):**
This capability is a natural extension of the already-planned Electron
desktop port, which was originally scoped only for OS-level per-class
application allowlisting. Rather than a bare logon script, the long-term
version of this can be a proper native lab client — handling attendance
capture, allowlisting, and session lockdown as one coherent piece of lab
software, rather than several disconnected mechanisms. `useFocusGuard.js`
remains isolated for this purpose, as already noted in Phase 16.

### 10.6 Prerequisites Before Implementation
- GPO edit rights on the lab's Windows Server domain — either Raj has
  these directly, or this requires buy-in and cooperation from whoever
  currently administers the domain (likely university IT staff).
- A pilot rollout on a single lab PC first, before applying the GPO to the
  full student OU — standard practice for any GPO change, to contain any
  misconfiguration to one machine rather than the whole lab.
- Confirmation that lab PCs can reach the EduSync backend over the
  existing LAN (expected to already work, given Z-drive access already
  depends on the same network path).

### 10.7 Explicitly Not a Commitment to a Timeline
This section documents that the originally promised capability is
technically achievable and describes how — it is not a commitment to a
specific build date. It is currently tracked under Phase 16 (Electron
Desktop Port) in TASKS.md and should be scoped for actual implementation
only after Raj has reviewed the full design document and, ideally,
confirmed GPO access/cooperation with the lab's domain administrator.

### 10.8 Partial Client-Side Groundwork Already Exists *(added Aug 25, 2026)*
`Frontend/electron/main.cjs` already implements a real IPC handler,
`get-windows-username`, that reads the logged-in Windows username from
within the Electron shell. This is **not** the GPO-based server-side
design above — it doesn't run at domain-login time, doesn't reach the
backend on its own, and doesn't solve the "capture attendance the moment
a student logs into any lab PC" requirement. But it confirms the narrower
client-side piece (an Electron process reading `%USERNAME%`-equivalent
from the OS) is already proven out in this codebase, not purely
theoretical. Worth knowing before scoping actual implementation, so this
isn't re-derived from zero.

---

## 11. EduSync Connect — Separate Companion Product *(added Aug 25, 2026, updated Aug 26, 2026)*

### 11.1 Relationship to This PRD
**EduSync Connect is not a feature of the product this PRD describes.**
It is a distinct product under the same parent company, **Archway**,
built as a standalone companion web application:

- **EduSync** (this PRD's subject) — the in-lab, live-session platform.
  Positioned as **software**: primary distribution is the Electron
  desktop wrapper (`Frontend/`) around the same web app, for lab PCs.
- **EduSync Connect** — a lightweight, always-on **web application**
  (`Connect-Frontend/`, no desktop wrapper) for classroom messaging,
  announcements, polls, assignments, and study materials — things a
  teacher or student needs *between* live sessions, not during one.

The two share one backend (`Backend/`) and one Postgres database — Connect
adds its own tables (all prefixed `connect_*`) and its own route/socket
surface (`/connect/*`, room family `connect:classroom:{id}`) alongside,
never replacing, anything EduSync already has. Nothing in this section
supersedes or modifies any feature above; it's recorded here purely for
visibility since it lives in the same repository and shares infrastructure.

### 11.2 Status
Backend: complete across 9 build phases (allotments, real-time messaging,
announcements, polls, assignments + grading, study materials, unread/
notification counts, and a final cross-feature integration + regression
pass). Frontend (`Connect-Frontend/`): feature-complete against every
backend endpoint **except** the unread/notification-count pair (built,
but not yet called by the frontend — no unread badges are visible in the
UI yet). One known frontend bug (admin login redirects to the teacher
dashboard rather than the admin one) is flagged but not fixed as of this
PRD update — frontend work is out of scope for the pass that produced
this note.

### 11.3 Feature Summary
1. **Classroom messaging** — real-time chat scoped to one classroom
   (teacher+class+subject allotment), Socket.io with a REST fallback.
   **Every classroom is teacher/admin-post-only.** An earlier
   per-classroom `posting_mode` toggle (`teacher_only` / `open`, letting
   students post when `open`) was built, then **removed by product
   decision on August 25, 2026** — the `posting_mode` column, its DB
   `CHECK` constraint, and the teacher-facing toggle endpoint/UI were all
   locked down to `teacher_only` only; students now read and vote in
   polls, never post.
2. **Announcements** — teacher → own classroom(s); admin → specific
   classroom(s) or a true global broadcast to every classroom at once.
3. **Polls** — one vote per user per poll, enforced at the database
   level; live result updates broadcast to the room on every vote.
4. **Assignments** — optional attachment, text/file submission,
   automatic late-flagging against a deadline, resubmission overwrites the
   existing record (and clears any prior grade), teacher grading.
5. **Study materials** — teacher-uploaded files, on-demand (not
   list-time-baked) download links.
6. **Unread/notification counts** — a last-seen-timestamp model (not
   per-message read receipts) backing per-classroom unread badges;
   backend-only as of this writing (see 11.2).
7. **Live tab updates + Web Push notifications** *(added Aug 25–26,
   2026)* — Announcements, Assignments, and Materials tabs now update
   live over the existing `connect:classroom:{id}` Socket.io room
   (`connect:announcement:new`, `connect:assignment:new`,
   `connect:submission:graded`, `connect:material:new`), closing a gap
   where those three tabs previously only refreshed on mount or manual
   refresh (messages and polls were already live). Separately, a VAPID-based
   Web Push pipeline notifies students of new messages, new announcements,
   new assignments, and assignment grading, even with the browser closed;
   an admin-authored announcement additionally notifies the owning
   teacher(s) of its target classroom(s) (a teacher's own announcement to
   their own classroom does not self-notify). Push is optional
   infrastructure: if `VAPID_SUBJECT`/`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
   aren't set in the environment, `GET /connect/push/vapid-public-key`
   returns `503` and sending silently no-ops — it does not crash the
   server (a real crash-on-boot from this exact gap was caught and fixed
   on Render, commit `481f9c0`, after VAPID keys were added only to a
   local `.env` and not to the deployed environment).

### 11.4 Technical Notes Worth Preserving
- File uploads across Connect (assignment attachments, submission files,
  materials) reuse the **same** Backblaze B2 bucket this PRD's Feature 10
  Part B already uses, under a `connect-assignments/` key prefix — not a
  second bucket — and the same 20MB size cap / 5-per-hour rate limit,
  enforced by one shared helper module so the numbers can't silently
  drift apart across Connect's own sub-features.
- Every Connect access check (read or write) goes through one shared
  server-side helper resolving "does this user have access to this
  classroom" (teacher owns it, or student's class matches it) — reused
  identically by both the REST routes and the Socket.io handlers.
- See `codeBaseContext.md` at the repo root for the full technical
  breakdown (every endpoint, every table, every socket event) of both
  EduSync and EduSync Connect — this PRD section is a summary, not the
  authoritative technical reference.

### 11.5 Subject Catalog + Semester Subject Allotments *(added Aug 26, 2026)*
This is a **EduSync-side admin feature** (`Frontend/` + `Backend/` — not a
Connect feature), recorded here because it feeds Connect classrooms
automatically. Two new admin panel pages:
- **Subject Catalog** (`AdminSubjects.jsx`, `subjects` table) — a reusable,
  standalone list of subjects (name + optional code), not tied to any one
  class or semester.
- **Subject Allotments** (`AdminSubjectAllotments.jsx`, `subject_allotments`
  table) — one row = "Subject S is taught to Class C in Semester N (by
  Teacher T)"; `teacher_id` is nullable so a subject can be allotted before
  a teacher is assigned.

**One-way sync into Connect** (`Backend/controllers/connect/connectClassroomSync.js`):
the moment an allotment has a `teacher_id`, a matching `connect_class_subjects`
row is created/updated automatically — no separate manual step in Connect's
own admin page. `subject_allotments` is the source of truth; Connect never
writes back to it. Specifically:
- Creating or updating an allotment with a teacher upserts the linked
  classroom (keyed by a new `subject_allotment_id` column on
  `connect_class_subjects`, so a teacher reassignment updates the *same*
  classroom rather than creating a duplicate — message/poll/assignment
  history is preserved).
- Unassigning an allotment's teacher, or deleting the allotment entirely,
  **archives** the linked classroom (`status = 'archived'`) — it is never
  deleted. An archived classroom is read-only (existing history stays
  visible, no new posts of any kind) and dimmed in the Connect UI; the
  owning teacher gets a delete button to remove it permanently once
  archived (admin can still delete a still-live classroom via Connect's
  own admin page at any time).
- **Connect's own admin allotments page (`Connect-Frontend/src/pages/admin/AdminAllotments.jsx`)
  still exists and still works exactly as before** — free-text subject
  name, no semester, admin-provisioned directly. This is **not a
  replacement**: it's a second entry point into the same
  `connect_class_subjects` table. A classroom created this way has
  `subject_allotment_id = NULL` and is untouched by the sync.

---

*Document prepared for: Smart Teaching & Lab Management Platform*
*Prepared by: Shah Raj*
