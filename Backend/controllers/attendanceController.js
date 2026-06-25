const sql = require('../config/db');

// GET /attendance/session/:session_id — teacher only
const getSessionAttendance = async (req, res) => {
  const session_id = parseInt(req.params.session_id);
  try {
    // Verify the requesting teacher owns this session before returning any data.
    const [owned] = await sql`
      SELECT id FROM sessions WHERE id = ${session_id} AND teacher_id = ${req.user.id}
    `;
    if (!owned) {
      return res.status(403).json({ message: 'You do not have permission to view attendance for this session.' });
    }

    const list = await sql`
      SELECT a.*, u.name AS student_name
      FROM attendance a
      JOIN users u ON a.student_id = u.id
      WHERE a.session_id = ${session_id}
      ORDER BY u.name ASC
    `;
    const parsedList = list.map(row => {
      let log = row.fullscreen_exit_log;
      if (typeof log === 'string') {
        try {
          log = JSON.parse(log);
        } catch (e) {
          log = [];
        }
      }
      return {
        ...row,
        fullscreen_exit_log: log || []
      };
    });
    res.json(parsedList);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /attendance/:attendance_id/decide — teacher only
const decideAttendance = async (req, res) => {
  const attendance_id = parseInt(req.params.attendance_id);
  const { decision } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'Invalid decision. Must be approved or rejected.' });
  }

  const decided_at = new Date();
  const status = decision === 'approved' ? 'present' : 'absent';

  try {
    const [updated] = await sql`
      UPDATE attendance
      SET status = ${status}, teacher_decision = ${decision}, decided_at = ${decided_at}
      WHERE id = ${attendance_id}
        AND session_id IN (SELECT id FROM sessions WHERE teacher_id = ${req.user.id})
      RETURNING *
    `;

    if (!updated) {
      // Distinguish: row exists but teacher doesn't own it (403) vs row is missing (404).
      const [exists] = await sql`SELECT 1 FROM attendance WHERE id = ${attendance_id}`;
      if (exists) {
        return res.status(403).json({ message: 'You do not have permission to decide attendance for this session.' });
      }
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Decision saved', attendance: updated });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /attendance/student/:student_id — student only (or matching auth student)
const getStudentAttendance = async (req, res) => {
  const student_id = parseInt(req.params.student_id);

  if (req.user.role === 'student' && req.user.id !== student_id) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const [user] = await sql`SELECT class_id FROM users WHERE id = ${student_id}`;
    
    let totalLectures = 0;
    if (user && user.class_id) {
      const [row] = await sql`
        SELECT COUNT(DISTINCT session_id)::int AS count 
        FROM session_classes 
        WHERE class_id = ${user.class_id}
      `;
      totalLectures = row ? row.count : 0;
    }

    let list = [];
    if (user && user.class_id) {
      list = await sql`
        SELECT 
          COALESCE(a.id, -s.id)::int AS id,
          COALESCE(a.status, 'absent') AS status,
          s.lecture_name,
          s.started_at
        FROM sessions s
        JOIN session_classes sc ON s.id = sc.session_id
        LEFT JOIN attendance a ON s.id = a.session_id AND a.student_id = ${student_id}
        WHERE sc.class_id = ${user.class_id}
        ORDER BY s.started_at DESC
      `;
    } else {
      list = await sql`
        SELECT a.id, a.status, s.lecture_name, s.started_at
        FROM attendance a
        JOIN sessions s ON a.session_id = s.id
        WHERE a.student_id = ${student_id}
        ORDER BY s.started_at DESC
      `;
    }

    res.json({
      records: list,
      totalLectures
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getSessionAttendance, decideAttendance, getStudentAttendance };
