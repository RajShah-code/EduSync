/*
 * Sessions Table — run once in PostgreSQL to create this table:
 *
 * CREATE TABLE sessions (
 *   id SERIAL PRIMARY KEY,
 *   lecture_name VARCHAR(200) NOT NULL,
 *   subject VARCHAR(200) NOT NULL,
 *   lab_room VARCHAR(100) NOT NULL,
 *   password_hash TEXT NOT NULL,
 *   teacher_id INTEGER REFERENCES users(id),
 *   started_at TIMESTAMP DEFAULT NOW(),
 *   ended_at TIMESTAMP
 * );
 */

const sql = require('../config/db');
const bcrypt = require('bcryptjs');

// POST /sessions/start — teacher only
const startSession = async (req, res) => {
  const { lecture_name, subject, lab_room, password, class_ids } = req.body;
  const teacher_id = req.user.id;

  if (!class_ids || !Array.isArray(class_ids) || class_ids.length === 0) {
    return res.status(400).json({ message: 'Target class selection is required (at least 1 class must be selected).' });
  }

  try {
    // Error if teacher already has an active session
    const existing = await sql`
      SELECT id FROM sessions
      WHERE teacher_id = ${teacher_id} AND ended_at IS NULL
    `;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'You already have an active session. End it before starting a new one.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [session] = await sql`
      INSERT INTO sessions (lecture_name, subject, lab_room, password_hash, teacher_id)
      VALUES (${lecture_name}, ${subject}, ${lab_room}, ${password_hash}, ${teacher_id})
      RETURNING id, lecture_name, subject, lab_room, teacher_id, started_at
    `;

    // Map session to targeted classes
    for (const cid of class_ids) {
      await sql`
        INSERT INTO session_classes (session_id, class_id)
        VALUES (${session.id}, ${Number(cid)})
      `;
    }

    res.status(201).json({ session: { ...session, class_ids: class_ids.map(Number) } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /sessions/end — teacher only
const endSession = async (req, res) => {
  const teacher_id = req.user.id;

  try {
    const [session] = await sql`
      UPDATE sessions
      SET ended_at = NOW()
      WHERE teacher_id = ${teacher_id} AND ended_at IS NULL
      RETURNING id
    `;

    if (!session) {
      return res.status(404).json({ message: 'No active session found' });
    }

    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /sessions/active — student only (or other authenticated roles as fallback)
const getActiveSessions = async (req, res) => {
  const class_id = req.user.class_id;
  try {
    let sessions = [];
    if (req.user.role === 'student' && class_id) {
      sessions = await sql`
        SELECT s.id, s.lecture_name, s.subject, s.lab_room, s.started_at
        FROM sessions s
        JOIN session_classes sc ON s.id = sc.session_id
        WHERE s.ended_at IS NULL AND sc.class_id = ${class_id}
        ORDER BY s.started_at DESC
      `;
    } else {
      // Student with no class_id gets no sessions — never fall back to an
      // unfiltered query that would expose all institution sessions.
      sessions = [];
    }

    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const mappings = await sql`
        SELECT session_id, class_id 
        FROM session_classes
        WHERE session_id IN (${sessionIds});
      `;
      sessions = sessions.map(s => {
        const cids = mappings.filter(m => m.session_id === s.id).map(m => m.class_id);
        return { ...s, class_ids: cids };
      });
    }

    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /sessions/my-active — teacher only
const getMyActiveSession = async (req, res) => {
  const teacher_id = req.user.id;
  try {
    const [session] = await sql`
      SELECT id, lecture_name, subject, lab_room, started_at
      FROM sessions
      WHERE teacher_id = ${teacher_id} AND ended_at IS NULL
      LIMIT 1
    `;
    if (session) {
      const classes = await sql`
        SELECT class_id FROM session_classes WHERE session_id = ${session.id}
      `;
      session.class_ids = classes.map(c => c.class_id);
    }
    res.json({ session: session || null });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /sessions/join — student only
const joinSession = async (req, res) => {
  const { session_id, password } = req.body;

  try {
    const [session] = await sql`
      SELECT * FROM sessions
      WHERE id = ${session_id} AND ended_at IS NULL
    `;

    if (!session) {
      return res.status(404).json({ message: 'Session not found or already ended' });
    }

    const isMatch = await bcrypt.compare(password, session.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Enforce class-membership: verify the student's class is targeted by this session.
    const student_class_id = req.user.class_id;
    if (!student_class_id) {
      return res.status(403).json({ message: 'You are not enrolled in a class targeted by this session.' });
    }
    const [membership] = await sql`
      SELECT 1 FROM session_classes
      WHERE session_id = ${session_id} AND class_id = ${student_class_id}
    `;
    if (!membership) {
      return res.status(403).json({ message: 'You are not enrolled in a class targeted by this session.' });
    }

    res.json({
      message: 'Joined',
      session: {
        id: session.id,
        lecture_name: session.lecture_name,
        subject: session.subject,
        lab_room: session.lab_room,
        started_at: session.started_at,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /sessions/kick — teacher only (placeholder for student monitoring)
const kickStudent = async (req, res) => {
  // placeholder — will be implemented with student monitoring
  res.json({ message: 'Not yet implemented' });
};

// GET /sessions/my-sessions — teacher only
const getMySessions = async (req, res) => {
  const teacher_id = req.user.id;
  try {
    const sessions = await sql`
      SELECT id, lecture_name, subject, lab_room, started_at, ended_at
      FROM sessions
      WHERE teacher_id = ${teacher_id}
      ORDER BY started_at DESC
    `;
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /sessions/:session_id/students — teacher only
const getSessionStudents = async (req, res) => {
  const session_id = parseInt(req.params.session_id);
  const sessionAttendance = req.app.get('sessionAttendance');
  if (!sessionAttendance) {
    return res.json({ students: [] });
  }

  const studentsMap = sessionAttendance.get(session_id);
  if (!studentsMap) {
    return res.json({ students: [] });
  }

  const list = [];
  for (const student of studentsMap.values()) {
    if (student.left_at === null) {
      list.push({
        student_id: student.student_id,
        student_name: student.student_name,
        joined_at: student.joined_at,
        is_fullscreen: student.last_fullscreen_exit === null,
        fullscreen_exit_count: student.fullscreen_exit_count,
        last_exit_at: student.last_fullscreen_exit ? new Date(student.last_fullscreen_exit) : null
      });
    }
  }

  res.json({ students: list });
};

module.exports = { startSession, endSession, getActiveSessions, getMyActiveSession, joinSession, kickStudent, getMySessions, getSessionStudents };
