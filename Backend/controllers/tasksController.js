const sql = require('../config/db');

// In-memory timers mapping: task_id -> Timeout instance
const taskTimers = new Map();

/**
 * Triggers when a task deadline expires.
 * Auto-submits any incomplete tasks, updates DB, and notifies the teacher.
 */
const triggerDeadlineExpired = async (app, taskId, sessionId, title) => {
  try {
    console.log(`[Timer] Deadline expired for task ${taskId} (session ${sessionId})`);

    // 1. Fetch full roster for the session's targeted classes
    const roster = await sql`
      SELECT u.id AS student_id, u.name AS student_name
      FROM users u
      JOIN session_classes sc ON u.class_id = sc.class_id
      WHERE sc.session_id = ${sessionId} AND u.role = 'student'
    `;

    let incompleteCount = 0;
    const io = app.get('io');
    const sessionAttendance = app.get('sessionAttendance');
    const studentsMap = sessionAttendance?.get(sessionId);

    // 2. Process each student enrolled in the target classes
    for (const student of roster) {
      const studentId = student.student_id;

      // Check if a submission already exists
      const [existing] = await sql`
        SELECT id, status, code, language FROM submissions 
        WHERE task_id = ${taskId} AND student_id = ${studentId}
      `;

      let affected = false;
      let finalCode = '';
      let finalLanguage = '';

      if (!existing) {
        // Roster student who hasn't opened/started the task: insert auto_submitted
        await sql`
          INSERT INTO submissions (task_id, student_id, code, language, status, submitted_at, updated_at)
          VALUES (${taskId}, ${studentId}, '', '', 'auto_submitted', NOW(), NOW())
        `;
        affected = true;
        incompleteCount++;
      } else if (existing.status === 'not_started' || existing.status === 'in_progress') {
        // Opened or saved task: update to auto_submitted
        await sql`
          UPDATE submissions
          SET status = 'auto_submitted', submitted_at = NOW(), updated_at = NOW()
          WHERE task_id = ${taskId} AND student_id = ${studentId} AND status IN ('not_started', 'in_progress')
        `;
        affected = true;
        incompleteCount++;
        finalCode = existing.code || '';
        finalLanguage = existing.language || '';
      }

      // 3. Emit status updates to the teacher if affected
      if (affected && io) {
        const liveState = studentsMap?.get(studentId);
        io.to(`teacher_session:${sessionId}`).emit('task:student_status', {
          task_id: taskId,
          student_id: studentId,
          student_name: student.student_name,
          is_fullscreen: liveState ? liveState.last_fullscreen_exit === null : false,
          outOfFocus: liveState ? liveState.last_fullscreen_exit !== null : true,
          isLeft: liveState ? liveState.left_at !== null : true,
          submission: {
            status: 'auto_submitted',
            code: finalCode,
            language: finalLanguage,
            score: null,
            submitted_at: new Date()
          }
        });
      }
    }

    // 4. Emit task:time_expired_summary to the teacher (Do NOT auto-unlock next task)
    if (io) {
      io.to(`teacher_session:${sessionId}`).emit('task:time_expired_summary', {
        task_id: taskId,
        title: title,
        incomplete_count: incompleteCount
      });
      io.to(`session:${sessionId}`).emit('task:deadline_reached', { task_id: taskId });
    }
  } catch (err) {
    console.error(`[Timer] Error handling deadline expiration for task ${taskId}:`, err);
  }
};

/**
 * Schedules or reschedules the in-memory timer callback.
 */
const scheduleTaskTimer = (app, taskId, deadline, sessionId, title) => {
  if (taskTimers.has(taskId)) {
    clearTimeout(taskTimers.get(taskId));
    taskTimers.delete(taskId);
  }

  const remainingMs = new Date(deadline).getTime() - Date.now();
  if (remainingMs <= 0) {
    triggerDeadlineExpired(app, taskId, sessionId, title);
  } else {
    const timerId = setTimeout(() => {
      triggerDeadlineExpired(app, taskId, sessionId, title);
    }, remainingMs);
    taskTimers.set(taskId, timerId);
  }
};

// POST /tasks/create — teacher only
const createTask = async (req, res) => {
  const { session_id, title, description, allowed_languages, time_limit_seconds } = req.body;
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the session
    const [session] = await sql`
      SELECT id FROM sessions WHERE id = ${session_id} AND teacher_id = ${teacherId} AND ended_at IS NULL
    `;
    if (!session) {
      return res.status(403).json({ message: 'Unauthorized or session is already ended' });
    }

    // Calculate sequence order = max + 1
    const [seqResult] = await sql`
      SELECT COALESCE(MAX(sequence_order), 0) as max_seq FROM tasks WHERE session_id = ${session_id}
    `;
    const sequence_order = seqResult.max_seq + 1;

    // Calculate deadline_at if a time limit is set
    const deadline_at = time_limit_seconds 
      ? new Date(Date.now() + parseInt(time_limit_seconds) * 1000) 
      : null;

    // Insert task
    const [task] = await sql`
      INSERT INTO tasks (
        session_id, title, description, allowed_languages, time_limit_seconds, 
        sequence_order, status, assigned_at, deadline_at
      )
      VALUES (
        ${session_id}, ${title}, ${description}, ${allowed_languages}, ${time_limit_seconds ? parseInt(time_limit_seconds) : null}, 
        ${sequence_order}, 'active', NOW(), ${deadline_at}
      )
      RETURNING *
    `;

    // Schedule timer
    if (deadline_at) {
      scheduleTaskTimer(req.app, task.id, deadline_at, session_id, title);
    }

    // Emit task:assigned to the session room
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${session_id}`).emit('task:assigned', { task });
    }

    res.status(201).json({ task });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /tasks/:id/submit — student only
const submitTask = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const studentId = req.user.id;
  const { code, language } = req.body;

  try {
    const [task] = await sql`SELECT sequence_order, session_id, status FROM tasks WHERE id = ${taskId}`;
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (task.status === 'closed') {
      return res.status(400).json({ message: 'This task is closed' });
    }

    // 1. Check sequence constraint: Reject 403 if any earlier task has not been submitted/auto_submitted
    const unfinishedPrevTasks = await sql`
      SELECT t.id FROM tasks t
      LEFT JOIN submissions s ON t.id = s.task_id AND s.student_id = ${studentId}
      WHERE t.session_id = ${task.session_id}
        AND t.sequence_order < ${task.sequence_order}
        AND (s.id IS NULL OR s.status NOT IN ('submitted', 'auto_submitted'))
    `;
    if (unfinishedPrevTasks.length > 0) {
      return res.status(403).json({ message: 'You must submit all previous tasks first.' });
    }

    // 2. Reject 409 if already submitted/auto_submitted (terminal)
    const [existing] = await sql`
      SELECT status FROM submissions WHERE task_id = ${taskId} AND student_id = ${studentId}
    `;
    if (existing && (existing.status === 'submitted' || existing.status === 'auto_submitted')) {
      return res.status(409).json({ message: 'This task has already been finalized.' });
    }

    // 3. Upsert as submitted
    const [submission] = await sql`
      INSERT INTO submissions (task_id, student_id, code, language, status, submitted_at, updated_at)
      VALUES (${taskId}, ${studentId}, ${code}, ${language}, 'submitted', NOW(), NOW())
      ON CONFLICT (task_id, student_id)
      DO UPDATE SET
        code = EXCLUDED.code,
        language = EXCLUDED.language,
        status = 'submitted',
        submitted_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `;

    // 4. Emit updates to the teacher
    const io = req.app.get('io');
    if (io) {
      const liveState = req.app.get('sessionAttendance')?.get(task.session_id)?.get(studentId);
      io.to(`teacher_session:${task.session_id}`).emit('task:student_status', {
        task_id: taskId,
        student_id: studentId,
        student_name: req.user.name,
        is_fullscreen: liveState ? liveState.last_fullscreen_exit === null : false,
        outOfFocus: liveState ? liveState.last_fullscreen_exit !== null : true,
        isLeft: liveState ? liveState.left_at !== null : true,
        submission: {
          status: 'submitted',
          code: code,
          language: language,
          score: null,
          submitted_at: submission.submitted_at
        }
      });
    }

    res.json({ submission });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /tasks/:id/autosave — student only
const autosaveTask = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const studentId = req.user.id;
  const { code, language } = req.body;

  try {
    const [task] = await sql`SELECT sequence_order, session_id, status FROM tasks WHERE id = ${taskId}`;
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (task.status === 'closed') {
      return res.status(400).json({ message: 'This task is closed' });
    }

    // 1. Check sequence constraint
    const unfinishedPrevTasks = await sql`
      SELECT t.id FROM tasks t
      LEFT JOIN submissions s ON t.id = s.task_id AND s.student_id = ${studentId}
      WHERE t.session_id = ${task.session_id}
        AND t.sequence_order < ${task.sequence_order}
        AND (s.id IS NULL OR s.status NOT IN ('submitted', 'auto_submitted'))
    `;
    if (unfinishedPrevTasks.length > 0) {
      return res.status(403).json({ message: 'You must submit all previous tasks first.' });
    }

    // 2. Reject 409 if already submitted/auto_submitted
    const [existing] = await sql`
      SELECT status FROM submissions WHERE task_id = ${taskId} AND student_id = ${studentId}
    `;
    if (existing && (existing.status === 'submitted' || existing.status === 'auto_submitted')) {
      return res.status(409).json({ message: 'This task is already finalized.' });
    }

    // 3. First save flips 'not_started' -> 'in_progress'
    const newStatus = 'in_progress';

    const [submission] = await sql`
      INSERT INTO submissions (task_id, student_id, code, language, status, updated_at)
      VALUES (${taskId}, ${studentId}, ${code}, ${language}, ${newStatus}, NOW())
      ON CONFLICT (task_id, student_id)
      DO UPDATE SET
        code = EXCLUDED.code,
        language = EXCLUDED.language,
        status = CASE 
          WHEN submissions.status = 'not_started' THEN 'in_progress'
          ELSE submissions.status
        END,
        updated_at = NOW()
      RETURNING *
    `;

    // 4. Emit updates to the teacher
    const io = req.app.get('io');
    if (io) {
      const liveState = req.app.get('sessionAttendance')?.get(task.session_id)?.get(studentId);
      io.to(`teacher_session:${task.session_id}`).emit('task:student_status', {
        task_id: taskId,
        student_id: studentId,
        student_name: req.user.name,
        is_fullscreen: liveState ? liveState.last_fullscreen_exit === null : false,
        outOfFocus: liveState ? liveState.last_fullscreen_exit !== null : true,
        isLeft: liveState ? liveState.left_at !== null : true,
        submission: {
          status: submission.status,
          code: code,
          language: language,
          score: null,
          submitted_at: null
        }
      });
    }

    res.json({ submission });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /tasks/session/:session_id — student AND teacher
const getSessionTasks = async (req, res) => {
  const sessionId = parseInt(req.params.session_id);
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    if (userRole === 'teacher') {
      // Verify teacher owns session
      const [session] = await sql`
        SELECT id FROM sessions WHERE id = ${sessionId} AND teacher_id = ${userId}
      `;
      if (!session) {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      const tasks = await sql`
        SELECT * FROM tasks WHERE session_id = ${sessionId} ORDER BY sequence_order ASC
      `;
      return res.json({ tasks });
    } else {
      // Student: join own submissions data
      const tasks = await sql`
        SELECT t.*, 
               s.status AS submission_status, 
               s.code AS submission_code, 
               s.language AS submission_language,
               s.score AS submission_score,
               s.submitted_at AS submission_submitted_at
        FROM tasks t
        LEFT JOIN submissions s ON t.id = s.task_id AND s.student_id = ${userId}
        WHERE t.session_id = ${sessionId}
        ORDER BY t.sequence_order ASC
      `;
      return res.json({ tasks });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /tasks/:id/progress — teacher only (returns ONLY task/submission fields)
const getTaskProgress = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the task's session
    const [task] = await sql`
      SELECT t.session_id FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      WHERE t.id = ${taskId} AND s.teacher_id = ${teacherId}
    `;
    if (!task) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const submissions = await sql`
      SELECT student_id, status, code, language, score, submitted_at, updated_at
      FROM submissions
      WHERE task_id = ${taskId}
    `;
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /submissions/task/:id — teacher only (full code reviews list)
const getTaskSubmissions = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the task's session
    const [task] = await sql`
      SELECT t.session_id FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      WHERE t.id = ${taskId} AND s.teacher_id = ${teacherId}
    `;
    if (!task) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const submissions = await sql`
      SELECT s.*, u.name AS student_name, u.roll_no
      FROM submissions s
      JOIN users u ON s.student_id = u.id
      WHERE s.task_id = ${taskId}
      ORDER BY u.name ASC
    `;
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /submissions/:id/score — teacher only
const scoreSubmission = async (req, res) => {
  const submissionId = parseInt(req.params.id);
  const { score } = req.body;
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the session the submission task belongs to
    const [task] = await sql`
      SELECT t.id FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      JOIN submissions sub ON t.id = sub.task_id
      WHERE sub.id = ${submissionId} AND s.teacher_id = ${teacherId}
    `;
    if (!task) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const [submission] = await sql`
      UPDATE submissions
      SET score = ${score ? parseFloat(score) : null}, updated_at = NOW()
      WHERE id = ${submissionId}
      RETURNING *
    `;

    res.json({ submission });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /tasks/:id/extend — teacher only
const extendTask = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const { additional_seconds } = req.body;
  const teacherId = req.user.id;

  try {
    const [task] = await sql`
      SELECT t.* FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      WHERE t.id = ${taskId} AND s.teacher_id = ${teacherId}
    `;
    if (!task) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Calculate new deadline
    const newDeadline = new Date(Date.now() + parseInt(additional_seconds) * 1000);

    // Update task deadline and activate it
    const [updatedTask] = await sql`
      UPDATE tasks
      SET deadline_at = ${newDeadline}, status = 'active', updated_at = NOW()
      WHERE id = ${taskId}
      RETURNING *
    `;

    // Revert ONLY auto_submitted rows to in_progress
    const affectedSubs = await sql`
      UPDATE submissions
      SET status = 'in_progress', submitted_at = NULL, updated_at = NOW()
      WHERE task_id = ${taskId} AND status = 'auto_submitted'
      RETURNING student_id, code, language
    `;

    // Reschedule timer
    scheduleTaskTimer(req.app, taskId, newDeadline, task.session_id, task.title);

    // Emit socket event to students in the session
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${task.session_id}`).emit('task:deadline_updated', { task: updatedTask });

      // Notify the teacher grid of status reverts
      const sessionAttendance = req.app.get('sessionAttendance');
      const studentsMap = sessionAttendance?.get(task.session_id);

      for (const sub of affectedSubs) {
        const liveState = studentsMap?.get(sub.student_id);
        const [student] = await sql`SELECT name FROM users WHERE id = ${sub.student_id}`;
        io.to(`teacher_session:${task.session_id}`).emit('task:student_status', {
          task_id: taskId,
          student_id: sub.student_id,
          student_name: student ? student.name : `Student ${sub.student_id}`,
          is_fullscreen: liveState ? liveState.last_fullscreen_exit === null : false,
          outOfFocus: liveState ? liveState.last_fullscreen_exit !== null : true,
          isLeft: liveState ? liveState.left_at !== null : true,
          submission: {
            status: 'in_progress',
            code: sub.code,
            language: sub.language,
            score: null,
            submitted_at: null
          }
        });
      }
    }

    res.json({ task: updatedTask });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /tasks/:id/move_on — teacher only
const moveOnTask = async (req, res) => {
  const taskId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    const [task] = await sql`
      SELECT t.* FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      WHERE t.id = ${taskId} AND s.teacher_id = ${teacherId}
    `;
    if (!task) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Set status to closed
    const [updatedTask] = await sql`
      UPDATE tasks
      SET status = 'closed', updated_at = NOW()
      WHERE id = ${taskId}
      RETURNING *
    `;

    // Clear timer
    if (taskTimers.has(taskId)) {
      clearTimeout(taskTimers.get(taskId));
      taskTimers.delete(taskId);
    }

    // ── DEFENSIVE SWEEP: AUTO-SUBMIT INCOMPLETE SUBMISSIONS UPON CLOSURE ──
    const roster = await sql`
      SELECT u.id AS student_id, u.name AS student_name
      FROM users u
      JOIN session_classes sc ON u.class_id = sc.class_id
      WHERE sc.session_id = ${task.session_id} AND u.role = 'student'
    `;

    const io = req.app.get('io');
    const sessionAttendance = req.app.get('sessionAttendance');
    const studentsMap = sessionAttendance?.get(task.session_id);

    for (const student of roster) {
      const studentId = student.student_id;

      const [existing] = await sql`
        SELECT id, status, code, language FROM submissions 
        WHERE task_id = ${taskId} AND student_id = ${studentId}
      `;

      let affected = false;
      let finalCode = '';
      let finalLanguage = '';

      if (!existing) {
        // Roster student who hasn't opened/started the task: insert auto_submitted
        await sql`
          INSERT INTO submissions (task_id, student_id, code, language, status, submitted_at, updated_at)
          VALUES (${taskId}, ${studentId}, '', '', 'auto_submitted', NOW(), NOW())
        `;
        affected = true;
      } else if (existing.status === 'not_started' || existing.status === 'in_progress') {
        // Opened or saved task: update to auto_submitted
        await sql`
          UPDATE submissions
          SET status = 'auto_submitted', submitted_at = NOW(), updated_at = NOW()
          WHERE task_id = ${taskId} AND student_id = ${studentId} AND status IN ('not_started', 'in_progress')
        `;
        affected = true;
        finalCode = existing.code || '';
        finalLanguage = existing.language || '';
      }

      // Emit status updates to the teacher if affected
      if (affected && io) {
        const liveState = studentsMap?.get(studentId);
        io.to(`teacher_session:${task.session_id}`).emit('task:student_status', {
          task_id: taskId,
          student_id: studentId,
          student_name: student.student_name,
          is_fullscreen: liveState ? liveState.last_fullscreen_exit === null : false,
          outOfFocus: liveState ? liveState.last_fullscreen_exit !== null : true,
          isLeft: liveState ? liveState.left_at !== null : true,
          submission: {
            status: 'auto_submitted',
            code: finalCode,
            language: finalLanguage,
            score: null,
            submitted_at: new Date()
          }
        });
      }
    }

    // Emit task:closed to session room
    if (io) {
      io.to(`session:${task.session_id}`).emit('task:closed', { task_id: taskId });
    }

    res.json({ task: updatedTask });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  createTask,
  submitTask,
  autosaveTask,
  getSessionTasks,
  getTaskProgress,
  getTaskSubmissions,
  scoreSubmission,
  extendTask,
  moveOnTask
};
