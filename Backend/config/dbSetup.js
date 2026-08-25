const sql = require('./db');
const bcrypt = require('bcryptjs');

/**
 * Automatically creates/updates the database schema for Phase 1.
 * Seeds initial classes and exactly one admin user if none exists.
 */
const setup = async () => {
  try {
    console.log("Database Setup: Checking tables and columns...");

    // 0. Create base tables if they do not exist
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        roll_no VARCHAR(50),
        has_seen_tour BOOLEAN DEFAULT false
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        lecture_name VARCHAR(200) NOT NULL,
        subject VARCHAR(200) NOT NULL,
        lab_room VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        teacher_id INTEGER REFERENCES users(id),
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP NOT NULL,
        left_at TIMESTAMP,
        total_present_seconds INTEGER DEFAULT 0,
        fullscreen_exit_count INTEGER DEFAULT 0,
        fullscreen_exit_log JSONB DEFAULT '[]'::jsonb,
        presence_percentage DECIMAL DEFAULT 0.0,
        status VARCHAR(50) DEFAULT 'absent',
        teacher_decision VARCHAR(50),
        decided_at TIMESTAMP,
        UNIQUE (session_id, student_id)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS timetable_entries (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        subject TEXT NOT NULL,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        room VARCHAR(255) DEFAULT NULL,
        session_type VARCHAR(50) DEFAULT 'standard',
        reminder_enabled BOOLEAN DEFAULT false,
        reminder_delay_minutes INTEGER DEFAULT NULL,
        last_triggered_date DATE DEFAULT NULL,
        last_reminder_sent_date DATE DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    // Additive column migrations for existing instances
    await sql`ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS room VARCHAR(255) DEFAULT NULL;`;
    await sql`ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS session_type VARCHAR(50) DEFAULT 'standard';`;
    await sql`ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS last_triggered_date DATE DEFAULT NULL;`;
    await sql`ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS last_reminder_sent_date DATE DEFAULT NULL;`;
    await sql`
      CREATE TABLE IF NOT EXISTS timetable_exceptions (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exception_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, exception_date)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        allowed_languages TEXT[] NOT NULL DEFAULT ARRAY['python']::TEXT[],
        time_limit_seconds INTEGER,
        sequence_order INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        assigned_at TIMESTAMP DEFAULT NOW(),
        deadline_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT DEFAULT '',
        language VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'not_started',
        submitted_at TIMESTAMP,
        score NUMERIC,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (task_id, student_id)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS doubt_requests (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_snapshot TEXT NOT NULL,
        question_text TEXT,
        raised_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        hint_line_start INTEGER,
        hint_line_end INTEGER,
        teacher_response_text TEXT,
        resolved_at TIMESTAMP
      );
    `;
    await sql`ALTER TABLE doubt_requests ADD COLUMN IF NOT EXISTS question_text TEXT;`;
    console.log("Database Setup: Base tables checked.");

    // 1. Create classes table
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: classes table checked.");

    // 2. Add class_id and roll_no to users table if they do not exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;
    `;
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS roll_no VARCHAR(50);
    `;
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS has_seen_tour BOOLEAN DEFAULT false;
    `;
    // Note: UNIQUE constraint on windows_username is intentionally deferred to avoid blocking future admin bulk-import edge cases (e.g. temporary blank entries).
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS windows_username VARCHAR(255);
    `;
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS default_reminder_delay_minutes INTEGER DEFAULT 5;
    `;
    
    // Update users_role_check constraint to allow 'admin'.
    // Wrapped in DO/EXCEPTION (not just DROP-then-ADD) because the DROP can
    // report "does not exist, skipping" while the ADD still hits a
    // duplicate — observed against the shared Neon DB, likely a replica/
    // caching lag between the two statements. The EXCEPTION guard makes
    // this idempotent regardless of that race.
    await sql`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `;
    await sql`
      DO $$ BEGIN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `;
    console.log("Database Setup: users table columns and check constraint checked.");

    // Create session_classes join table
    await sql`
      CREATE TABLE IF NOT EXISTS session_classes (
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        PRIMARY KEY (session_id, class_id)
      );
    `;
    console.log("Database Setup: session_classes join table checked.");

    // Add updated_at column to tasks table if it does not exist
    // (tasksController.js extendTask / moveOnTask write to this column)
    await sql`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW();
    `;
    console.log("Database Setup: tasks.updated_at column checked.");

    // ── Phase 10: Secure Exam Mode ─────────────────────────────────────────────

    // Exam status lifecycle flow: draft -> waiting_room -> active -> ended
    await sql`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id),
        title VARCHAR(255) NOT NULL,
        question_type VARCHAR(20) NOT NULL,
        num_sets INTEGER NOT NULL,
        time_limit_minutes INTEGER NOT NULL,
        violation_limit INTEGER NOT NULL DEFAULT 3,
        status VARCHAR(20) DEFAULT 'draft',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    console.log("Database Setup: exams table checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS exam_classes (
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        PRIMARY KEY (exam_id, class_id)
      );
    `;
    console.log("Database Setup: exam_classes join table checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS exam_sets (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id),
        set_number INTEGER NOT NULL
      );
    `;
    console.log("Database Setup: exam_sets table checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_set_id INTEGER REFERENCES exam_sets(id),
        type VARCHAR(10) NOT NULL,
        question_text TEXT NOT NULL,
        options JSONB,
        correct_option INTEGER,
        language VARCHAR(20),
        starter_code TEXT,
        max_score NUMERIC NOT NULL DEFAULT 1
      );
    `;
    await sql`
      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS max_score NUMERIC NOT NULL DEFAULT 1;
    `;
    await sql`
      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS description TEXT;
    `;
    console.log("Database Setup: questions table, max_score, and description columns checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS exam_attempts (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id),
        student_id INTEGER REFERENCES users(id),
        exam_set_id INTEGER REFERENCES exam_sets(id),
        started_at TIMESTAMP,
        submitted_at TIMESTAMP,
        auto_submitted BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'not_started'
      );
    `;
    console.log("Database Setup: exam_attempts table checked.");

    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'exam_attempts_exam_student_unique'
        ) THEN
          ALTER TABLE exam_attempts ADD CONSTRAINT exam_attempts_exam_student_unique UNIQUE (exam_id, student_id);
        END IF;
      END $$;
    `;
    console.log("Database Setup: exam_attempts unique constraint checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS exam_answers (
        id SERIAL PRIMARY KEY,
        exam_attempt_id INTEGER REFERENCES exam_attempts(id),
        question_id INTEGER REFERENCES questions(id),
        selected_option INTEGER,
        code_answer TEXT,
        score NUMERIC,
        UNIQUE (exam_attempt_id, question_id)
      );
    `;
    console.log("Database Setup: exam_answers table checked.");

    await sql`
      CREATE TABLE IF NOT EXISTS exam_violations (
        id SERIAL PRIMARY KEY,
        exam_attempt_id INTEGER REFERENCES exam_attempts(id),
        violation_type VARCHAR(30),
        occurred_at TIMESTAMP DEFAULT NOW()
      );
    `;
    console.log("Database Setup: exam_violations table checked.");

    // ── EduSync Connect (companion app) — additive-only foundation phase.
    // connect_class_subjects is the source of truth for a "classroom group":
    // one row = one (teacher, class, subject) allotment. posting_mode is
    // decided per classroom by the teacher who owns it.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_class_subjects (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        subject_name VARCHAR(255) NOT NULL,
        posting_mode VARCHAR(20) NOT NULL DEFAULT 'teacher_only' CHECK (posting_mode IN ('teacher_only', 'open')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (teacher_id, class_id, subject_name)
      );
    `;
    console.log("Database Setup: connect_class_subjects table checked.");

    // "Open discussion" mode removed by product decision: only teachers/
    // admins ever post; students read + vote in polls only. Migrate any
    // existing 'open' rows first, then tighten the CHECK so it can never
    // come back — DO/EXCEPTION-guarded the same way users_role_check is,
    // for the same DROP/ADD race reason documented on that block below.
    await sql`UPDATE connect_class_subjects SET posting_mode = 'teacher_only' WHERE posting_mode = 'open';`;
    await sql`ALTER TABLE connect_class_subjects DROP CONSTRAINT IF EXISTS connect_class_subjects_posting_mode_check;`;
    await sql`
      DO $$ BEGIN
        ALTER TABLE connect_class_subjects ADD CONSTRAINT connect_class_subjects_posting_mode_check CHECK (posting_mode IN ('teacher_only'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `;
    console.log("Database Setup: connect_class_subjects posting_mode locked to teacher_only.");

    // connect_messages — real-time classroom messages, scoped to one
    // connect_class_subjects row per message.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_messages (
        id SERIAL PRIMARY KEY,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_messages table checked.");

    // connect_announcements — a teacher's own-classroom pin, or an admin's
    // targeted/global broadcast. is_global = true means "every classroom" —
    // connect_announcement_targets is intentionally left empty for those.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_announcements (
        id SERIAL PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        is_global BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_announcements table checked.");

    // connect_announcement_targets — one row per (announcement, classroom)
    // it was sent to. Not populated at all when the announcement is_global.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_announcement_targets (
        id SERIAL PRIMARY KEY,
        announcement_id INTEGER NOT NULL REFERENCES connect_announcements(id) ON DELETE CASCADE,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE
      );
    `;
    console.log("Database Setup: connect_announcement_targets table checked.");

    // connect_polls — one poll per classroom. closes_at NULL means open
    // indefinitely (no deadline).
    await sql`
      CREATE TABLE IF NOT EXISTS connect_polls (
        id SERIAL PRIMARY KEY,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE,
        creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        closes_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_polls table checked.");

    // connect_poll_options — the choices for a poll, in display order.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_poll_options (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL REFERENCES connect_polls(id) ON DELETE CASCADE,
        option_text TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0
      );
    `;
    console.log("Database Setup: connect_poll_options table checked.");

    // connect_poll_votes — one vote per user per poll, enforced at the DB
    // level (not just app logic) via UNIQUE(poll_id, user_id). No
    // vote-changing in v1: a second vote attempt hits this constraint and
    // is surfaced as a real 409, not silently overwritten.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_poll_votes (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL REFERENCES connect_polls(id) ON DELETE CASCADE,
        option_id INTEGER NOT NULL REFERENCES connect_poll_options(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (poll_id, user_id)
      );
    `;
    console.log("Database Setup: connect_poll_votes table checked.");

    // connect_assignments — attachment_url stores a B2 OBJECT KEY, not a
    // baked presigned URL (those expire; a fresh one is generated per read
    // in the controller). due_at NULL means no deadline.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_assignments (
        id SERIAL PRIMARY KEY,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE,
        creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        attachment_url TEXT,
        due_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_assignments table checked.");

    // connect_submissions — one row per (assignment, student), enforced at
    // the DB level. A resubmission is an UPDATE of this same row (via
    // ON CONFLICT DO UPDATE in the controller), never a second row.
    // file_url stores a B2 object key, same convention as attachment_url
    // above. is_late is computed once at submit time against due_at.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES connect_assignments(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text_content TEXT,
        file_url TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_late BOOLEAN NOT NULL DEFAULT false,
        grade NUMERIC,
        feedback TEXT,
        graded_at TIMESTAMP,
        graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (assignment_id, student_id)
      );
    `;
    console.log("Database Setup: connect_submissions table checked.");

    // connect_materials — teacher-uploaded study materials for a classroom.
    // file_url stores a B2 object key (same convention as
    // connect_assignments.attachment_url) — download links are generated
    // on-demand, not baked in, since materials are browsed repeatedly.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_materials (
        id SERIAL PRIMARY KEY,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE,
        uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_type VARCHAR(100),
        file_size_bytes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_materials table checked.");

    // connect_read_state — one row per (user, classroom): the last time
    // that user marked that classroom "seen". Deliberately a single
    // timestamp, not per-message/per-announcement read flags — that would
    // be a heavier, different feature.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_read_state (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_subject_id INTEGER NOT NULL REFERENCES connect_class_subjects(id) ON DELETE CASCADE,
        last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, class_subject_id)
      );
    `;
    console.log("Database Setup: connect_read_state table checked.");

    // connect_push_subscriptions — Web Push subscriptions (one row per
    // user per browser/device, since the same user can have several).
    // endpoint is the push service URL the browser hands back on
    // subscribe — globally unique by construction. p256dh/auth are the
    // subscription's own public key + auth secret, required by the Web
    // Push protocol for encrypting the payload — not application secrets.
    await sql`
      CREATE TABLE IF NOT EXISTS connect_push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: connect_push_subscriptions table checked.");

    // ── Subject Catalog + Semester-Based Allotments ─────────────────────────
    // subjects: a reusable, standalone catalog (name/code), not tied to any
    // one class or semester — the same "Data Structures" row is reused
    // across every class/semester that teaches it.
    await sql`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (name)
      );
    `;
    console.log("Database Setup: subjects table checked.");

    // subject_allotments: one row = one concrete "Subject S is taught to
    // Class C in Semester N (by Teacher T)" fact. teacher_id is nullable so
    // a subject can be allotted to a class/semester before a teacher is
    // assigned. ON DELETE SET NULL on teacher_id (not CASCADE) so removing
    // a teacher doesn't erase the curriculum record itself.
    await sql`
      CREATE TABLE IF NOT EXISTS subject_allotments (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, subject_id, semester, teacher_id)
      );
    `;
    console.log("Database Setup: subject_allotments table checked.");

    // Links a connect_class_subjects row back to the subject_allotments row
    // that created it via the main EduSync admin panel's sync (see
    // connectClassroomSync.js). NULL for classrooms Connect's own admin
    // page created manually — those are untouched by the sync. Must be
    // added after subject_allotments exists (the FK target above).
    await sql`ALTER TABLE connect_class_subjects ADD COLUMN IF NOT EXISTS subject_allotment_id INTEGER REFERENCES subject_allotments(id) ON DELETE SET NULL;`;
    // Populated only for synced classrooms — drives the richer
    // "ClassName(SemN) - Subject" teacher-side display name.
    await sql`ALTER TABLE connect_class_subjects ADD COLUMN IF NOT EXISTS semester INTEGER;`;
    // 'active' | 'archived'. Deleting/unassigning the linked allotment
    // archives (never deletes) the classroom — read-only, no new posts,
    // history preserved. See connectClassroomSync.js.
    await sql`ALTER TABLE connect_class_subjects ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));`;
    console.log("Database Setup: connect_class_subjects sync columns (subject_allotment_id/semester/status) checked.");

    // ── Per-class OS-level app allow-list (broadcast sessions) ──────────────
    // One row = one process allowed to run on a student's machine while a
    // broadcast session for this class is live. A class with zero rows
    // means "nothing extra allowed beyond Electron's own hardcoded
    // system-safe list" (see Frontend/electron/main.cjs) — that hardcoded
    // list is intentionally NOT stored here or admin-editable, so a narrow
    // allow-list can never accidentally cause core OS processes to be
    // closed. Enforcement itself (Electron-only; the web build only
    // displays this list) lives in main.cjs's app-guard IPC handlers.
    await sql`
      CREATE TABLE IF NOT EXISTS app_allowlist_entries (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        process_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, process_name)
      );
    `;
    console.log("Database Setup: app_allowlist_entries table checked.");

    // 3. Seed default classes if none exist
    const [{ count: classCount }] = await sql`SELECT COUNT(*)::int FROM classes;`;
    if (classCount === 0) {
      console.log("Database Setup: Seeding default classes...");
      await sql`
        INSERT INTO classes (name) VALUES 
        ('FYBCA'), 
        ('SYBCA'), 
        ('TYBCA');
      `;
      console.log("Database Setup: Seed classes successfully added.");
    }

    // 4. Seed default admin if none exist
    const [{ count: adminCount }] = await sql`SELECT COUNT(*)::int FROM users WHERE role = 'admin';`;
    if (adminCount === 0) {
      console.log("Database Setup: Seeding default admin user (credentials: admin / admin123)...");
      const passwordHash = await bcrypt.hash('admin123', 10);
      await sql`
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Admin', 'admin', ${passwordHash}, 'admin');
      `;
      console.log("Database Setup: Default admin seeded.");
    }

    console.log("Database Setup: Initialization complete.");
  } catch (err) {
    console.error("Database Setup: Failed to initialize schema/seed:", err);
    throw err;
  }
};

module.exports = setup;
