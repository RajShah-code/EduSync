const sql = require('./db');

const init = async () => {
  try {
    console.log("Initializing database tables...");

    // Create attendance table if it does not exist
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
        teacher_decision VARCHAR(50), -- 'approved' | 'rejected' | null
        decided_at TIMESTAMP,
        UNIQUE (session_id, student_id)
      );
    `;

    console.log("Attendance table initialized successfully");
    process.exit(0);
  } catch (err) {
    console.error("Failed to initialize database tables:", err);
    process.exit(1);
  }
};

init();
