const sql = require('../config/db');

const init = async () => {
  try {
    // 1. Create classes table
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        roll_no VARCHAR(50)
      );
    `;

    // 3. Create sessions table
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

    // 4. Create session_classes table
    await sql`
      CREATE TABLE IF NOT EXISTS session_classes (
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        PRIMARY KEY (session_id, class_id)
      );
    `;

    // 5. Create attendance table
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

    // 6. Create tasks table
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

    // 7. Create submissions table
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

    // 8. Create doubt_requests table
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

    console.log("✅ Database schema initialized");
    process.exit(0);
  } catch (err) {
    console.error("❌ Database schema initialization failed:", err);
    process.exit(1);
  }
};

init();
