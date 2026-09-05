# EduSync: Comprehensive Functional Feature Documentation

---

## 1. Overview

### 1.1 Architecture & Core Design Philosophy
EduSync is a real-time classroom orchestration, proctoring, and laboratory management platform designed for educational institutions. The platform operates as a dual-target client:
1. **Web Browser Client**: Standard modern browser environment utilizing modern Web APIs (WebRTC, Canvas, Fullscreen API, Page Visibility API, File System Access API).
2. **Electron Desktop Client**: Native wrapper providing hardware and OS integration, including automated Windows login, OS-level process allowlist enforcement (terminating unauthorized background applications), and native file system stream recording.

### 1.2 System Role Hierarchy
The platform strictly isolates capabilities into three distinct user roles:
- **Admin**: System administrator responsible for organizational setup, user directory provisioning, academic structure (classes, subjects, allotments), and security policies (OS process allowlists). Admins do not participate in live classroom broadcasts, proctored exams, or academic evaluations.
- **Teacher**: Academic controller and instructor. Teachers create and manage live multi-class broadcast sessions, stream audio and screen via WebRTC, synchronously mirror Monaco code editors and interactive whiteboards, orchestrate hands-on programming tasks, conduct proctored exams, handle real-time student doubts, and oversee attendance exception audits.
- **Student**: Classroom learner and examinee. Students discover and join live sessions with lab passwords, follow teacher broadcasts in real time, run sandboxed code independently in JavaScript and Python (WASM), raise in-session doubts with code snapshots, complete sequential coding tasks, take locked-down proctored exams under strict anti-cheat surveillance, bundle and email laboratory work, and review personal attendance metrics.

---

## 2. Admin Features & Capabilities

Admins access a dedicated management portal rooted at `/admin` governed by `AdminLayout`.

### 2.1 User Management (`/admin/users`)
- **Single User Provisioning**:
  - Direct creation of user accounts with `name`, `email`, `role` (`student`, `teacher`, `admin`), and optional `class_id` (mandatory for students).
  - Default password generation rules:
    - `student`: Standardized credential pattern derived from class code and roll number (`<CLASS><ROLL>`).
    - `teacher` / `admin`: Standardized credential pattern derived from lowercase first name (`<firstname>@edusync`).
  - **Transient Password Disclosure Modal**: Displays the created user's temporary password once upon creation with a one-click copy-to-clipboard action. Once dismissed, the plain password is not retrievable.
- **Bulk User Import via Excel (`.xlsx`)**:
  - Two-sheet Excel file import workflow:
    - `Students` sheet: Parses student records (`Name`, `Email`, `Class`, `Roll No`).
    - `Staff` sheet: Parses faculty/admin records (`Name`, `Email`, `Role`).
  - Client-side validation: Validates headers, parses data rows, matches class names against existing class catalogs, and provides a structured pre-upload validation report.
  - Generates downloadable CSV/Excel error reports if invalid or duplicate records are detected during parsing or API ingestion.
- **User Directory Administration**:
  - Paginated listing (10 users/page) with client/server search across names and emails.
  - Role filter tabs (`All`, `Students`, `Teachers`, `Admins`) and class-based dropdown filters.
  - **Edit User**: Modifies user full name, email address, role, and assigned class.
  - **Administrative Password Reset Override**: Generates or assigns a new password directly from the admin panel, displaying the new credential in the one-time display modal.
  - **User Deletion Guard**: Soft/hard deletion of user records with dependency checks (blocking deletion if the user is linked to historical lectures, submissions, or attendance logs).
- **Backend Endpoints**:
  - `GET /users` (paginated list, filterable by role and class)
  - `POST /users` (single user creation)
  - `POST /users/bulk-import` (multi-part Excel bulk creation)
  - `PUT /users/:id` (update profile & class assignment)
  - `POST /users/:id/reset-password` (administrative password reset)
  - `DELETE /users/:id` (delete user)

### 2.2 Class Management (`/admin/classes`)
- **Academic Class Directory**:
  - Listing of all registered classes (e.g., `FYBCA`, `SYBCA`, `TYBCA`) along with student enrollment counts.
  - **Class Creation**: Modal workflow specifying class name, academic year, and division/section code.
  - **Inline Renaming & Metadata Edits**: Allows updating class identifiers.
  - **Class Deletion**: Deletion guard verifying that no enrolled students or active timetable allocations exist before removal.
- **Backend Endpoints**:
  - `GET /classes`
  - `POST /classes`
  - `PUT /classes/:id`
  - `DELETE /classes/:id`

### 2.3 Subject Catalog (`/admin/subjects`)
- **Global Subject Registry**:
  - Catalog of institutional course offerings, each defined by subject name and unique subject code (e.g., `CS201`, `WEB101`).
  - **Subject Creation & Editing**: Configures subject code, full course title, and description.
  - **Referential Integrity Protection**: Prevents deletion of subjects actively assigned to timetable schedules or historical lecture records.
- **Backend Endpoints**:
  - `GET /subjects`
  - `POST /subjects`
  - `PUT /subjects/:id`
  - `DELETE /subjects/:id`

### 2.4 Subject Allotments (`/admin/subject-allotments`)
- **Faculty & Academic Curriculum Mapping**:
  - Tri-partite relationship linking an enrolled **Class**, an academic **Semester** (1 through 8), a catalog **Subject**, and an assigned faculty **Teacher**.
  - **Allotment Creation**: Modal interface selecting target Class, Semester dropdown, Subject dropdown, and Teacher dropdown.
  - **Allotment Modification**: Reassigns active instructors or adjusts semester pairings.
  - **Allotment Deletion**: Revokes faculty assignment.
- **Backend Endpoints**:
  - `GET /subject-allotments`
  - `POST /subject-allotments`
  - `PUT /subject-allotments/:id`
  - `DELETE /subject-allotments/:id`

### 2.5 OS Process Allowlist Management (`/admin/app-allowlist`)
- **Proctoring Security Configuration**:
  - Manages permitted operating system processes for student workstations during broadcast lectures and proctored tasks.
  - Per-class allowlist configuration mapping `process_name` (e.g., `code.exe`, `chrome.exe`, `python.exe`) and `display_name` (e.g., "Visual Studio Code").
  - CRUD operations on permitted executables.
  - Rules are transmitted to Electron desktop student clients via IPC (`startAppGuard`) to enforce automated termination of unauthorized processes.
- **Backend Endpoints**:
  - `GET /app-allowlist/class/:classId`
  - `POST /app-allowlist`
  - `DELETE /app-allowlist/:id`

---

## 3. Teacher Features & Capabilities

Teachers access their workspace under `/teacher` governed by `TeacherLayout`. The layout maintains active broadcast state, global lecture notification stores, and pending student rejoin waiting rooms.

### 3.1 Broadcast Center & Live Instruction (`/teacher/broadcast`)
- **Session Lifecycle Initiation**:
  - Creation of live broadcast sessions with lecture title, subject, target room/laboratory, access password, and multi-class multi-select targeting (e.g., broadcasting simultaneously to `FYBCA-A` and `FYBCA-B`).
  - Session resumption: Detects active or interrupted sessions and restores state without dropping student peers.
- **Broadcast Modes**:
  - **Screen Sharing Mode**: Captures desktop/window media stream via browser `navigator.mediaDevices.getDisplayMedia` and broadcasts to all connected students.
  - **Monaco Code Editor Mode**: Live shared code workspace with syntax highlighting for JavaScript, Python, HTML, and Plain Text.
  - **Interactive Whiteboard Mode**: Shared drawing canvas with stroke synchronization, background color selection, and instant canvas clearing.
  - Real-time mode switching emitted via `editor:mode_changed` socket event to automatically adjust student screen viewports.
- **WebRTC 1-to-Many Mesh Architecture**:
  - Teacher acts as the WebRTC broadcast hub using STUN server negotiation (`stun:stun.l.google.com:19302`).
  - On demand or when students join: creates individual `RTCPeerConnection` per student socket, tracks local audio/video tracks, generates SDP offers (`webrtc:offer`), processes student answers (`webrtc:answer`), and exchanges ICE candidates (`webrtc:ice-candidate`).
  - Dynamic renegotiation: Handles mid-session screen-share starts, student disconnect grace timers (4s disconnect window before pruning), and automatic re-offer on reconnection.
- **Live Code Synchronization & Independent Local Execution**:
  - Debounced editor synchronization (200ms) emitted over `editor:sync` sending code text, active language, and cursor/selection state.
  - **Pause/Resume Sync**: Teacher can pause broadcasting keystrokes to prepare code snippets privately, then resume live streaming.
  - **Local In-Browser Execution**:
    - JavaScript: Evaluated inside an isolated `iframe` capturing console logs (`log`, `warn`, `error`, `info`) and unhandled rejections via `postMessage`.
    - Python: Evaluated client-side in the browser via self-hosted Pyodide WebAssembly (`/pyodide/pyodide.js`), capturing standard output (`sys.stdout`) and standard error (`sys.stderr`).
  - **Broadcast Output**: Teacher can push code execution output to all connected students via `editor:output` socket event.
- **Interactive Whiteboard Sync**:
  - Real-time drawing synchronization: Emits incremental stroke events (`teacher:whiteboard_stroke`), clear canvas commands (`teacher:whiteboard_clear`), and full snapshot synchronization (`teacher:whiteboard_snapshot` / `teacher:whiteboard_sync`).
- **Session Audio & Recording**:
  - Microphone capture toggle (`navigator.mediaDevices.getUserMedia`) mixed into WebRTC audio streams.
  - **Dual-Engine Screen & Audio Recording**:
    - Web / Chromium: Captures composite streams via `MediaRecorder` API; streams directly to disk using File System Access API (`showSaveFilePicker` with writable stream), caching file handles in IndexedDB (`recordingHandles.js`), or buffers blobs for manual download.
    - Electron Desktop: Uses native Electron IPC file streaming to write recordings directly to the local file system.

### 3.2 Student Real-Time Monitoring (`/teacher/monitor`)
- **Real-Time Student Roster Grid**:
  - Live visual tiles for every student enrolled in the target classes.
  - Connection States:
    - `Viewing`: Actively connected, WebRTC stream running, browser in fullscreen focus.
    - `Not Viewing`: Connected but exited fullscreen or switched browser tabs.
    - `Left`: Disconnected from socket or closed workstation client.
- **Proctoring Telemetry**:
  - Real-time display of fullscreen exit counts and time elapsed since last exit.
  - Color-coded badges indicating attention integrity.
- **Waiting Room / Rejoin Approval Workflow**:
  - When disconnected or kicked students attempt to return, they are held in a waiting state (`student:rejoin_pending`).
  - Teacher receives interactive toast notifications and visual badges on student monitor tiles.
  - Teacher actions: Approve (`student:rejoin_approved`) or Deny (`student:rejoin_denied`).

### 3.3 Classroom Tasks & Doubt Resolution (`/teacher/tasks`)
- **Task Authoring & Dispatch**:
  - Create programming tasks with task title, Markdown instruction prompt, starter code template, permitted languages (JavaScript, Python), time limits, and sequence order.
  - Push tasks to the active lecture via `task:assigned` socket event.
- **Live Student Progress Matrix**:
  - Real-time status cards categorized by:
    - `Not Started`: Student has received task but has not initiated typing.
    - `In Progress`: Student actively editing (indicated by real-time typing heartbeat).
    - `Doubt Raised`: Student requested help (triggers visual shaking/pulse animation and sound alert).
    - `Submitted`: Task submitted with score indicator or awaiting grading.
- **Interactive Doubt Resolution**:
  - Modal viewing the student's exact code snapshot captured at the moment the question was raised.
  - Teacher response tools: Provide textual feedback and select specific starter/end line numbers to highlight hints directly inside the student's Monaco editor.
  - Dispatches resolution via `POST /doubts/:id/resolve` triggering `doubt:resolved` socket event.
- **Task Lifecycle Control**:
  - Extend active deadline: Updates countdown on all student screens via `task:deadline_updated`.
  - Conclude task: "Lock & Move On" via `POST /tasks/:id/move_on` which auto-submits ongoing work, marks unfinished tasks as closed, and redirects students back to the broadcast viewer.
- **Grading & Code Submission Review (`/teacher/submissions/:taskId`)**:
  - Dedicated grading interface filtering submissions by task.
  - Side-by-side view with Monaco read-only code display and student metadata.
  - Assigns numerical score and textual critique via `POST /tasks/submissions/:id/score`.

### 3.4 Proctored Exam Management (`/teacher/exams`, `/teacher/exams/active/:id`, `/teacher/exams/results/:id`)
- **Three-Step Exam Creation Wizard**:
  - Step 1: Exam Settings — Title, date/time schedule, question formats (`MCQ`, `Coding`, or `Both`), number of randomized question sets (Sets A/B/C/D), duration in minutes, and maximum permitted proctoring violation threshold.
  - Step 2: Question Builder — Per-set question configuration:
    - Multiple Choice Questions (MCQ): Question prompt, multiple choices, correct answer radio key, point weight.
    - Coding Problems: Problem statement, language selection, starter code, sample test cases, point weight.
  - Step 3: Review & Dispatch — Save as Draft, Schedule for automated launch, or immediately "Open Waiting Room".
- **Waiting Room & Live Launch**:
  - Opens exam waiting room via `POST /exams/:id/open` (`exam:opened` socket event).
  - Students join the waiting lobby; teacher monitors connected headcount and triggers "Start Exam" via `POST /exams/:id/start` (`exam:start` socket event with randomized set allocation).
- **Active Exam Proctoring Dashboard**:
  - Synchronized exam countdown timer.
  - Live student roster matrix showing question set assignment, current progress, answer completion ratio, and real-time violation counter.
  - Automated lockout enforcement: If a student exceeds the violation threshold (fullscreen exits, tab switching), server and teacher dashboard display `LOCKED` state.
  - Manual intervention: Teacher can force-terminate an exam for all students via `POST /exams/:id/end` (`exam:force_lock`).
- **Results Analytics & Manual Code Evaluation**:
  - Score distribution histogram and aggregate performance statistics (average, highest, lowest score).
  - Auto-graded MCQ breakdown comparing student submissions against answer keys.
  - Manual code grading console: Monaco editor viewer with live in-browser execution runner (Pyodide for Python, sandboxed iframe for JavaScript) allowing the teacher to test student code against edge cases before assigning final marks.
  - CSV export of comprehensive student grade sheets.

### 3.5 Attendance Exception Auditing (`/teacher/attendance`)
- **End-of-Session Exception Audit Modal**:
  - Triggered immediately upon ending a broadcast lecture.
  - Reviews flagged students who violated attention policies (excessive fullscreen exits, low presence percentage).
  - Teacher actions: Approve presence, mark absent, or batch approve/reject with a single click.
- **Historical Attendance Registry**:
  - Chronological table of all completed lectures showing date, subject, class, room, enrolled students, marked present, and flagged violations.
  - Detailed session drill-down with student-by-student presence percentage and exit event logs.
  - Manual attendance override ("Mark Present" / "Mark Absent") for dispute resolution.
  - Export attendance ledger to CSV.

### 3.6 Timetable Management (`/teacher/timetable`)
- **Weekly Schedule Visual Grid**:
  - Monday through Saturday visual matrix displaying allocated lecture blocks.
  - Slot details: Time range, class, subject, room/lab identifier, and session type (`standard` lecture vs `lab` session).
- **Schedule Management**:
  - Add single slot with conflict detection (overlapping teacher or classroom times).
  - Edit or delete existing schedule blocks.
  - Bulk schedule import via Excel (`.xlsx`) with downloadable schedule template.
- **Notification & Attendance Settings**:
  - Configurable late reminder threshold (e.g., alert 5, 10, or 15 minutes before scheduled start).
  - Holiday and institutional suppression: Multi-date calendar picker excluding specific dates from automated attendance generation.
- **Dashboard Quick-Start**:
  - Today's schedule card on the Teacher Dashboard indicates status (`ACTIVE`, `UPCOMING`, `PAST`) and provides a one-click "Start Now" button pre-populating session setup.

### 3.7 Analytics & At-Risk Student Tracking (`/teacher/analytics`)
- **Performance KPI Cards**:
  - Class Average Attendance Rate (%).
  - Task Completion Rate (%).
  - Average Exam Score (%).
  - Total At-Risk Students Count.
- **Data Visualizations**:
  - Multi-week Attendance Trend line chart.
  - Exam Performance Distribution bar chart.
- **At-Risk Student Diagnostic Table**:
  - Identifies struggling students based on configurable algorithmic thresholds:
    - Attendance Risk: Attendance below 75%.
    - Task Risk: Task completion below 50%.
    - Exam Risk: Exam performance below 40%.
  - Displays risk indicators and direct access to student academic history.

### 3.8 Recording Library (`/teacher/recordings`)
- Management of local session recordings captured across browser or desktop sessions.
- Displays metadata: Lecture name, recording date, file size, duration, and storage location.
- **Electron Native Action**: "Show in Folder" opens the native file explorer at the recording path via IPC.
- **Web Action**: "Open Recording" launches the video file using persisted File System Access API handles.

### 3.9 Teacher Account Settings (`/teacher/settings`)
- Profile management: Update display name via `PUT /users/me`.
- Password modification: Validates current password and updates via `PUT /users/me/password`.
- User interface preferences: 12-hour vs 24-hour timestamp formatting.
- Interactive onboarding tour reset.

---

## 4. Student Features & Capabilities

Students access their portal under `/student` governed by `StudentLayout`.

### 4.1 Student Dashboard (`/student`)
- **Active Session Discovery**:
  - Real-time notification banner and session cards when an instructor starts a broadcast targeting the student's class.
  - "Join Lecture" modal prompting for the room/lab password.
- **Today's Timetable Widget**:
  - Displays today's scheduled classes with status tags (`Upcoming`, `In Progress`, `Completed`) and countdown timers.
- **Pending Exams / Waiting Room Alert**:
  - High-priority banner when an exam waiting room is active, providing direct entry to `/student/exam/:id`.
- **Academic Snapshot Metrics**:
  - Personal attendance percentage with warning badges if approaching the 75% threshold.
  - Recent task scores and submission statuses.

### 4.2 Live Lecture Receiver (`/student/live`)
- **WebRTC Broadcast Reception**:
  - Receives live screen share stream from the instructor via `RTCPeerConnection`.
  - Handles WebRTC offers, creates answers, and processes ICE candidates in background.
  - Audio playback with browser autoplay gesture unlocking: Displays an unmute overlay enabling audio once the student clicks.
- **Synchronized Code & Whiteboard Viewers**:
  - **Mirrored Editor**: Receives code text, active language, and cursor updates from the teacher over `teacher:code_changed` and `student:session_state`.
  - **Mirrored Console/Output**: Displays the teacher's code execution outputs (`teacher:code_output`).
  - **Mirrored Whiteboard**: HTML5 canvas rendering instructor drawing strokes in real time (`teacher:whiteboard_stroke`, `teacher:whiteboard_clear`, `teacher:whiteboard_snapshot`).
- **Student Local Workspace (When Enabled)**:
  - When local editing is active, student can diverge from instructor code.
  - **Sync Banner ("Load Latest" vs "Keep Mine")**: Informs the student when instructor code has changed, allowing them to overwrite with latest instructor code or maintain their local branch.
  - **Local Isolated Execution**:
    - JavaScript: Evaluated locally in a sandboxed `iframe` without network transmission.
    - Python: Evaluated locally via client-side Pyodide WebAssembly without server dependencies.
- **Focus Guard & Attention Enforcement**:
  - Fullscreen lock enforced via `useFocusGuard`.
  - Browser fullscreen gesture overlay: Unblockable overlay forcing user click if the browser blocks automated fullscreen requests.
  - Focus loss detection: If the student exits fullscreen or switches tabs, an overlay blocks the screen and emits `student:focus_lost` to the teacher. Clicking "Return to Lecture" re-engages fullscreen and emits `student:focus_regained`.
- **Desktop Application Guard (Electron)**:
  - Receives permitted OS process allowlist for the class.
  - In Electron, background watchdog terminates non-allowlisted applications and emits `student:app_violation`. In Web, displays an informational list of permitted applications.
- **Rejoin Approval Flow**:
  - If a student disconnects or gets dropped, re-entry requires instructor authorization.
  - Student screen displays a waiting overlay (`Waiting for instructor approval...`).
  - Upon approval (`student:rejoin_approved`), automatically re-requests fullscreen and restores live stream.
  - Upon denial (`student:rejoin_denied`), redirects to dashboard with an explanation message.

### 4.3 Task Workspace (`/student/tasks`)
- **Sequential Task Progression**:
  - Displays multi-task browser tabs with lock states.
  - Sequential progression rule: Subsequent tasks remain locked until all preceding tasks are submitted or auto-submitted/closed.
- **Monaco Code Editor & Sandbox Runner**:
  - Code editor supporting assigned languages with local syntax checking.
  - Independent local execution using sandboxed `iframe` (JS) and Pyodide WASM (Python).
  - Dockable output console: Supports docking right, left, top, or bottom, with drag-resizable splits.
- **Automated Autosave**:
  - Debounced autosave (every 5 seconds of idle typing) pushing code snapshots to `POST /tasks/:taskId/autosave`.
- **In-Session Doubt Raising**:
  - Student can click "Ask Doubt", input their question, and submit.
  - Transmits a complete code snapshot and question text to `POST /doubts/raise`.
  - Once answered by the teacher, receives `doubt:resolved` socket event:
    - Displays teacher's response note.
    - Highlights the specific line range in the Monaco editor where the teacher provided guidance.
- **Task Submission & Deadlines**:
  - Live countdown timer tied to task `deadline_at`.
  - Manual submission via `POST /tasks/:taskId/submit`.
  - Automated locking and submission when instructor concludes or extends the task.

### 4.4 Proctored Exam Environment (`/student/exam/:id`)
- **Exam Lobby & Waiting Room**:
  - Student joins waiting room (`phase: waiting`) awaiting instructor launch.
  - Automatically loads exam metadata and designated question set upon receiving `exam:start` socket event.
- **Full-Screen Lockdown & Anti-Cheat Surveillance**:
  - Enters mandatory fullscreen upon exam start.
  - Hardware/browser event listeners detecting:
    - Fullscreen exit (`fullscreenchange`).
    - Tab or application switching (`visibilitychange`).
  - Reports each infraction to `POST /exams/:id/violation`.
  - Displays visual warning toasts with remaining violation allowances (`Warning X/3`).
- **Question Navigation & Answering**:
  - Sidebar question palette showing answered, unanswered, and active question numbers.
  - MCQ Questions: Radio group option selector.
  - Coding Questions: Monaco code editor, starter code, problem description, dockable console, and local test execution runner (Pyodide WASM for Python, sandboxed iframe for JS).
- **Exam Submission & Automated Lockout**:
  - Manual submission: Prompts confirmation modal displaying answered vs unanswered counts, submitting answers to `POST /exams/:id/submit`.
  - Timer expiration: Server auto-submits answers on deadline; client locks immediately upon `exam:force_lock`.
  - Violation Lockout: If violations exceed the limit, server dispatches `exam:force_lock`, rendering the terminal `ExamLocked` screen detailing reason, violation count, answered questions, and timestamp.

### 4.5 Send My Files (`/student/send-files`)
- **Laboratory Work Bundler & Emailer**:
  - Solves the problem of retrieving student code from shared university lab computers without external USB drives or personal logins.
  - Uses the Web File System Access API:
    - `window.showDirectoryPicker`: Selects an entire project folder recursively.
    - `window.showOpenFilePicker`: Selects multiple individual files.
  - **In-Browser Compression**: Compresses selected directories and files into a standard `.zip` archive using `JSZip` client-side with real-time compression progress tracking.
  - Enforces a 20MB file size ceiling.
  - Transmits base64 zip package to `POST /files/email-zip` via `XMLHttpRequest` with upload progress percentage tracking, emailing the lab work to the student's specified email address.

### 4.6 Attendance History (`/student/attendance`)
- **Personal Attendance Ledger**:
  - Chronological log of all sessions attended by the student.
  - Metrics: Total lectures held, lectures attended, absences, and personal attendance percentage.
  - Multi-parameter filtering: Filter records by Subject, Teacher, Status (`Present` vs `Absent`), and chronological sort order.
  - Real-time sync: List automatically refreshes when an active lecture concludes (`session:ended` socket event).

### 4.7 Student Account Settings (`/student/settings`)
- Profile update: Modifies display name via `PUT /users/me`.
- Password change: Updates personal password with length and confirmation validation via `PUT /users/me/password`.
- Timestamp format preferences (12h vs 24h).
- Feature walkthrough tour resets.

---

## 5. Shared & Cross-Role Features

### 5.1 Authentication, Auto-Login & Session Resumption
- **Dual Authentication Modes**:
  - **Manual JWT Authentication**: Standard email and password form at `/login` issuing JSON Web Tokens stored in browser `localStorage` (`edusync_token`).
  - **Windows OS Silent Auto-Login**: In Electron desktop environments, `WindowsAutoLogin` queries the Windows OS username via IPC (`window.electronAPI.getWindowsUsername`) and authenticates silently via `POST /auth/windows-login` with institutional secret key header `X-Edusync-Client-Key`.
- **Session Resumption**:
  - `SessionResume` utility verifies active token validity and checks server session states on initial application mount.
  - Automatically recovers active lecture broadcast or proctored exam attempts if a browser or workstation crashes.

### 5.2 Real-Time Socket.io Infrastructure
- Singleton Socket.io client (`Frontend/src/app/store/socket.js`) configured with auto-reconnection and authentication token payloads.
- Cross-role event mapping:
  - **Signaling**: `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `webrtc:broadcast_ended`.
  - **Editor & Whiteboard State**: `editor:sync`, `editor:mode_changed`, `editor:output`, `teacher:code_changed`, `teacher:whiteboard_stroke`, `teacher:whiteboard_clear`, `teacher:whiteboard_snapshot`.
  - **Classroom Operations**: `session:started`, `session:ended`, `student:joined`, `student:focus_lost`, `student:focus_regained`, `student:rejoin_pending`, `student:rejoin_approved`, `student:rejoin_denied`.
  - **Tasks**: `task:assigned`, `task:closed`, `task:deadline_updated`, `task:deadline_reached`, `doubt:raised`, `doubt:resolved`.
  - **Exams**: `exam:opened`, `exam:start`, `exam:violation_warning`, `exam:force_lock`, `exam:ended`.

### 5.3 In-Browser Sandboxed Code Execution
- Zero server-load architecture: All student and teacher test runs execute strictly inside the client runtime.
- **JavaScript**: Executed in a sandboxed `iframe` without access to parent DOM or cookies, routing console messages (`console.log`, `console.error`) through `window.postMessage`.
- **Python**: Executed locally via Pyodide WebAssembly (`/pyodide/pyodide.js`) utilizing virtualized in-memory file system and capturing `sys.stdout` and `sys.stderr`.

### 5.4 Dual-Platform Desktop Integration (Electron vs Web)
- Dynamic capability detection via `window.electronAPI`:
  - **Electron**: Native Windows username query, OS process watcher terminating unauthorized apps, native disk stream recording, and "Show in Folder" integration.
  - **Web Browser**: Fallback to manual authentication, informational allowlists, File System Access API / Blob downloads, and HTML5 Fullscreen/Visibility API guards.

### 5.5 Accessibility, User Guidance & Preferences
- **Guided Product Tours (`AppTour`)**:
  - Step-by-step interactive onboarding tours across all major pages for Teachers and Students using driver/popover steps.
  - Tracks tour completion status in local storage; can be replayed anytime from Settings.
- **Global Time Display Preference**:
  - Centralized time utility (`formatTimeOfDay`) honoring 12-hour (AM/PM) vs 24-hour preferences configured in user settings.
