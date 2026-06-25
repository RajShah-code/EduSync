const sql = require('../config/db');

// POST /doubts/raise — student only
const raiseDoubt = async (req, res) => {
  const { task_id, code_snapshot } = req.body;
  const studentId = req.user.id;
  const studentName = req.user.name;

  try {
    // Verify task exists and is active
    const [task] = await sql`
      SELECT session_id, status FROM tasks WHERE id = ${task_id}
    `;
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (task.status === 'closed') {
      return res.status(400).json({ message: 'Cannot raise doubt on a closed task' });
    }

    // 1. Reject 409 if a pending doubt already exists for (task_id, student_id)
    const [existing] = await sql`
      SELECT id FROM doubt_requests 
      WHERE task_id = ${task_id} AND student_id = ${studentId} AND status = 'pending'
    `;
    if (existing) {
      return res.status(409).json({ message: 'You already have a pending doubt request for this task.' });
    }

    // 2. Insert doubt
    const [doubt] = await sql`
      INSERT INTO doubt_requests (task_id, student_id, code_snapshot, raised_at, status)
      VALUES (${task_id}, ${studentId}, ${code_snapshot}, NOW(), 'pending')
      RETURNING *
    `;

    // 3. Emit doubt:new to the teacher room
    const io = req.app.get('io');
    if (io) {
      io.to(`teacher_session:${task.session_id}`).emit('doubt:new', {
        doubt_id: doubt.id,
        task_id: task_id,
        student_id: studentId,
        student_name: studentName,
        code_snapshot: code_snapshot,
        raised_at: doubt.raised_at,
        status: 'pending'
      });
    }

    res.status(201).json({ doubt });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /doubts/session/:session_id — teacher only
const getSessionDoubts = async (req, res) => {
  const sessionId = parseInt(req.params.session_id);
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the session
    const [session] = await sql`
      SELECT id FROM sessions WHERE id = ${sessionId} AND teacher_id = ${teacherId}
    `;
    if (!session) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const doubts = await sql`
      SELECT d.*, u.name AS student_name, u.roll_no, t.title AS task_title
      FROM doubt_requests d
      JOIN users u ON d.student_id = u.id
      JOIN tasks t ON d.task_id = t.id
      WHERE t.session_id = ${sessionId}
      ORDER BY 
        CASE WHEN d.status = 'pending' THEN 0 ELSE 1 END ASC,
        d.raised_at DESC
    `;

    res.json({ doubts });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /doubts/student/task/:task_id — student only
const getStudentTaskDoubts = async (req, res) => {
  const taskId = parseInt(req.params.task_id);
  const studentId = req.user.id;

  try {
    const doubts = await sql`
      SELECT * FROM doubt_requests
      WHERE task_id = ${taskId} AND student_id = ${studentId}
      ORDER BY raised_at DESC
    `;
    res.json({ doubts });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /doubts/:id/resolve — teacher only
const resolveDoubt = async (req, res) => {
  const doubtId = parseInt(req.params.id);
  const { teacher_response_text, hint_line_start, hint_line_end } = req.body;
  const teacherId = req.user.id;

  // 1. Reject if response_text is empty
  if (!teacher_response_text || teacher_response_text.trim() === '') {
    return res.status(400).json({ message: 'Teacher response text is required.' });
  }

  try {
    // Verify teacher owns the session related to this doubt
    const [doubtCheck] = await sql`
      SELECT d.*, t.session_id FROM doubt_requests d
      JOIN tasks t ON d.task_id = t.id
      JOIN sessions s ON t.session_id = s.id
      WHERE d.id = ${doubtId} AND s.teacher_id = ${teacherId}
    `;
    if (!doubtCheck) {
      return res.status(403).json({ message: 'Unauthorized or doubt not found' });
    }

    // 2. Update status and response text
    const [doubt] = await sql`
      UPDATE doubt_requests
      SET 
        status = 'resolved',
        teacher_response_text = ${teacher_response_text},
        hint_line_start = ${hint_line_start ? parseInt(hint_line_start) : null},
        hint_line_end = ${hint_line_end ? parseInt(hint_line_end) : null},
        resolved_at = NOW()
      WHERE id = ${doubtId}
      RETURNING *
    `;

    // 3. Emit doubt:resolved directly to the student's socket if connected
    const io = req.app.get('io');
    if (io) {
      const studentSocket = Array.from(io.sockets.sockets.values()).find(
        s => s.user && s.user.id === doubt.student_id
      );
      if (studentSocket) {
        studentSocket.emit('doubt:resolved', {
          doubt_id: doubt.id,
          task_id: doubt.task_id,
          teacher_response_text: doubt.teacher_response_text,
          hint_line_start: doubt.hint_line_start,
          hint_line_end: doubt.hint_line_end
        });
      }
    }

    res.json({ doubt });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  raiseDoubt,
  getSessionDoubts,
  getStudentTaskDoubts,
  resolveDoubt
};
