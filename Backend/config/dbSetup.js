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
        raised_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        hint_line_start INTEGER,
        hint_line_end INTEGER,
        teacher_response_text TEXT,
        resolved_at TIMESTAMP
      );
    `;
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
    
    // Update users_role_check constraint to allow 'admin'
    await sql`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `;
    await sql`
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin'));
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
    console.log("Database Setup: questions table and max_score column checked.");

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
