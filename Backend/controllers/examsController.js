const sql = require('../config/db');
const { invalidateAnalyticsCache } = require('./analyticsController');

// In-memory exam expiry timers: exam_id -> Timeout
const examTimers = new Map();

// ── Pure function: Adjacency-guarded set assignment ────────────────────────────
//
// Input:  students  — array of { id, roll_no } sorted ascending by roll_no
//         numSets   — integer number of question sets (>= 1)
// Output: Map<student_id, set_number>   (set_number is 1-indexed)
//
// Algorithm:
//   Walk the sorted list round-robin (index mod numSets → set 1..numSets).
//   After each assignment, check if the set equals the previous student's set.
//   If it does, advance the cursor by 1 (mod numSets) until it differs —
//   then continue the rotation from the new cursor position.
//   With numSets=1, the adjacency rule is skipped (only one option exists).
//
function assignSetsWithAdjacencyGuard(students, numSets) {
  const assignments = new Map();
  if (students.length === 0) return assignments;

  let cursor = 0; // 0-indexed position into [0..numSets-1], maps to set (cursor+1)
  let prevSet = null;

  for (const student of students) {
    if (numSets === 1) {
      assignments.set(student.id, 1);
      continue;
    }

    // Advance cursor until set differs from the previous assignment
    let attempts = 0;
    while (cursor % numSets === (prevSet - 1 + numSets) % numSets && attempts < numSets) {
      cursor = (cursor + 1) % numSets;
      attempts++;
    }

    const setNumber = (cursor % numSets) + 1;
    assignments.set(student.id, setNumber);
    prevSet = setNumber;
    cursor = (cursor + 1) % numSets;
  }

  return assignments;
}

// ── Auto-expire handler ────────────────────────────────────────────────────────
// Called when exam time runs out. Auto-submits all in_progress attempts
// and emits exam:force_lock to each affected student socket.
const triggerExamExpired = async (app, examId) => {
  try {
    console.log(`[ExamTimer] Exam ${examId} time expired — auto-submitting.`);
    const io = app.get('io');
    const examStudentSockets = app.get('examStudentSockets');

    // Find all in-progress attempts for this exam
    const attempts = await sql`
      SELECT id, student_id FROM exam_attempts
      WHERE exam_id = ${examId} AND status = 'in_progress'
    `;

    for (const attempt of attempts) {
      await sql`
        UPDATE exam_attempts
        SET status = 'submitted', auto_submitted = TRUE, submitted_at = NOW()
        WHERE id = ${attempt.id}
      `;

      // Emit force_lock to the individual student socket
      if (io && examStudentSockets) {
        const socketId = examStudentSockets.get(attempt.student_id);
        if (socketId) {
          io.to(socketId).emit('exam:force_lock', {
            examId,
            reason: 'time_expired',
          });
        }
      }
    }

    // Mark exam as ended
    await sql`
      UPDATE exams SET status = 'ended' WHERE id = ${examId}
    `;

    console.log(`[ExamTimer] Exam ${examId} auto-submitted ${attempts.length} attempt(s).`);
  } catch (err) {
    console.error(`[ExamTimer] Error auto-submitting exam ${examId}:`, err);
  }
};

const scheduleExamTimer = (app, examId, startedAt, timeLimitMinutes) => {
  if (examTimers.has(examId)) {
    clearTimeout(examTimers.get(examId));
    examTimers.delete(examId);
  }

  const expiresAt = new Date(startedAt).getTime() + timeLimitMinutes * 60 * 1000;
  const remainingMs = expiresAt - Date.now();

  if (remainingMs <= 0) {
    triggerExamExpired(app, examId);
  } else {
    const timerId = setTimeout(() => triggerExamExpired(app, examId), remainingMs);
    examTimers.set(examId, timerId);
  }
};

// ── POST /exams/create — teacher only ─────────────────────────────────────────
const createExam = async (req, res) => {
  // Role check: createExam is teacher-only
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const { session_id, title, question_type, num_sets, time_limit_minutes, violation_limit, class_ids } = req.body;
  const teacherId = req.user.id;

  if (!title || !question_type || !num_sets || !time_limit_minutes) {
    return res.status(400).json({ message: 'title, question_type, num_sets, and time_limit_minutes are required' });
  }

  const validTypes = ['mcq', 'code', 'both'];
  if (!validTypes.includes(question_type)) {
    return res.status(400).json({ message: 'question_type must be mcq, code, or both' });
  }

  try {
    // If session_id provided, verify the teacher owns it
    if (session_id) {
      const [session] = await sql`
        SELECT id FROM sessions WHERE id = ${session_id} AND teacher_id = ${teacherId}
      `;
      if (!session) {
        return res.status(403).json({ message: 'Unauthorized: session not owned by this teacher' });
      }
    }

    const [exam] = await sql`
      INSERT INTO exams (session_id, title, question_type, num_sets, time_limit_minutes, violation_limit, status, created_by)
      VALUES (
        ${session_id || null},
        ${title},
        ${question_type},
        ${parseInt(num_sets)},
        ${parseInt(time_limit_minutes)},
        ${violation_limit ? parseInt(violation_limit) : 3},
        'draft',
        ${teacherId}
      )
      RETURNING *
    `;

    if (Array.isArray(class_ids)) {
      for (const classId of class_ids) {
        await sql`INSERT INTO exam_classes (exam_id, class_id) VALUES (${exam.id}, ${classId}) ON CONFLICT DO NOTHING`;
      }
    }

    // Pre-create the exam_sets rows so questions can be added immediately
    for (let i = 1; i <= parseInt(num_sets); i++) {
      await sql`
        INSERT INTO exam_sets (exam_id, set_number) VALUES (${exam.id}, ${i})
      `;
    }

    res.status(201).json({ exam });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/sets/:setNumber/questions — teacher only ──────────────────
const addQuestion = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const setNumber = parseInt(req.params.setNumber);
  const teacherId = req.user.id;
  const { type, question_text, options, correct_option, language, starter_code } = req.body;

  try {
    // Verify teacher owns this exam
    const [exam] = await sql`
      SELECT id, question_type FROM exams WHERE id = ${examId} AND created_by = ${teacherId}
    `;
    if (!exam) {
      return res.status(403).json({ message: 'Unauthorized or exam not found' });
    }

    // Enforce type constraint
    if (exam.question_type !== 'both' && type !== exam.question_type) {
      return res.status(400).json({
        message: `This exam only accepts ${exam.question_type} questions`
      });
    }
    if (type !== 'mcq' && type !== 'code') {
      return res.status(400).json({ message: 'type must be mcq or code' });
    }

    // Resolve the exam_set row
    const [examSet] = await sql`
      SELECT id FROM exam_sets WHERE exam_id = ${examId} AND set_number = ${setNumber}
    `;
    if (!examSet) {
      return res.status(404).json({ message: `Set ${setNumber} not found for this exam` });
    }

    let finalMaxScore = 1;
    if (type === 'mcq') {
      finalMaxScore = 1;
    } else if (type === 'code') {
      if (req.body.max_score === undefined || req.body.max_score === null) {
        console.warn('[addQuestion] max_score omitted for code question, defaulting to 10');
        finalMaxScore = 10;
      } else {
        finalMaxScore = parseFloat(req.body.max_score) || 10;
      }
    }

    const [question] = await sql`
      INSERT INTO questions (exam_set_id, type, question_text, options, correct_option, language, starter_code, max_score)
      VALUES (
        ${examSet.id},
        ${type},
        ${question_text},
        ${type === 'mcq' ? JSON.stringify(options) : null},
        ${type === 'mcq' ? correct_option : null},
        ${type === 'code' ? language : null},
        ${type === 'code' ? starter_code : null},
        ${finalMaxScore}
      )
      RETURNING *
    `;

    res.status(201).json({ question });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/start — teacher only ──────────────────────────────────────
// Runs the adjacency-guarded set assignment, creates exam_attempts,
// emits exam:start individually to each student, starts server-side expiry timer.
const startExam = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    // Verify teacher owns this exam and it's in draft or waiting_room status
    const [exam] = await sql`
      SELECT * FROM exams WHERE id = ${examId} AND created_by = ${teacherId}
    `;
    if (!exam) {
      return res.status(403).json({ message: 'Unauthorized or exam not found' });
    }
    if (exam.status !== 'draft' && exam.status !== 'waiting_room') {
      return res.status(400).json({ message: `Exam is already ${exam.status}` });
    }

    // Fetch all students in the exam's targeted classes, sorted by roll_no
    const students = await sql`
      SELECT u.id, u.name, u.roll_no
      FROM users u
      JOIN exam_classes ec ON u.class_id = ec.class_id
      WHERE ec.exam_id = ${exam.id} AND u.role = 'student'
      ORDER BY u.roll_no ASC NULLS LAST, u.id ASC
    `;

    if (students.length === 0) {
      return res.status(400).json({ message: 'No students found in the classes assigned to this exam' });
    }

    // Fetch exam_sets to resolve set_number -> exam_set_id
    const examSets = await sql`
      SELECT id, set_number FROM exam_sets WHERE exam_id = ${examId}
    `;
    const setIdByNumber = new Map(examSets.map(s => [s.set_number, s.id]));

    // Run the adjacency-guarded assignment algorithm
    const assignments = assignSetsWithAdjacencyGuard(students, exam.num_sets);

    // Log the mapping for spot-checking
    console.log(`[ExamStart] Exam ${examId} — roll_no → set_number mapping:`);
    for (const student of students) {
      const setNum = assignments.get(student.id);
      console.log(`  roll_no=${student.roll_no ?? '(none)'} name="${student.name}" → set ${setNum}`);
    }

    // Mark exam as active and record the start timestamp
    const startedAt = new Date();
    await sql`
      UPDATE exams SET status = 'active' WHERE id = ${examId}
    `;

    // Create exam_attempts and emit exam:start to each student individually
    const io = req.app.get('io');
    const examStudentSockets = req.app.get('examStudentSockets');

    for (const student of students) {
      const setNumber = assignments.get(student.id);
      const examSetId = setIdByNumber.get(setNumber);

      await sql`
        INSERT INTO exam_attempts (exam_id, student_id, exam_set_id, started_at, status)
        VALUES (${examId}, ${student.id}, ${examSetId}, ${startedAt}, 'in_progress')
        ON CONFLICT DO NOTHING
      `;

      // Emit only to this student's individual socket — never broadcast to room
      if (io && examStudentSockets) {
        const socketId = examStudentSockets.get(student.id);
        if (socketId) {
          io.to(socketId).emit('exam:start', {
            examId,
            setNumber,
            timeLimitMinutes: exam.time_limit_minutes,
            serverStartTimestamp: startedAt.getTime(),
          });
        } else {
          console.warn(`[ExamStart] Student ${student.id} has no registered socket — exam:start not delivered`);
        }
      }
    }

    // Schedule server-side expiry timer
    scheduleExamTimer(req.app, examId, startedAt, exam.time_limit_minutes);

    res.json({ message: 'Exam started', examId, studentCount: students.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /exams/:id/my-questions — student only ────────────────────────────────
const getMyQuestions = async (req, res) => {
  // Role check: getMyQuestions is student-only
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied: student role required' });
  }

  const examId = parseInt(req.params.id);
  const studentId = req.user.id;

  try {
    // Verify this student has an attempt for this exam
    const [attempt] = await sql`
      SELECT ea.id, ea.exam_set_id, ea.status, es.set_number, e.violation_limit, e.time_limit_minutes, e.title, ea.started_at,
        (SELECT COUNT(*)::int FROM exam_violations ev WHERE ev.exam_attempt_id = ea.id) AS violation_count
      FROM exam_attempts ea
      JOIN exam_sets es ON ea.exam_set_id = es.id
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.exam_id = ${examId} AND ea.student_id = ${studentId}
    `;
    if (!attempt) {
      return res.status(403).json({ message: 'No exam attempt found for this student' });
    }
    if (attempt.status === 'locked') {
      return res.status(403).json({ message: 'Exam is locked for this student' });
    }

    // Fetch only this student's assigned set — never expose other sets
    const questions = await sql`
      SELECT id, type, question_text, options, language, starter_code
      FROM questions
      WHERE exam_set_id = ${attempt.exam_set_id}
      ORDER BY id ASC
    `;
    // Note: correct_option is deliberately excluded from student-facing response

    const formattedQuestions = questions.map(q => {
      let parsedOptions = q.options;
      if (typeof q.options === 'string') {
        try {
          parsedOptions = JSON.parse(q.options);
        } catch (e) {
          parsedOptions = [];
        }
      }
      return {
        ...q,
        options: parsedOptions
      };
    });

    res.json({
      attemptId: attempt.id,
      setNumber: attempt.set_number,
      violationCount: attempt.violation_count,
      violationLimit: attempt.violation_limit,
      timeLimitMinutes: attempt.time_limit_minutes,
      title: attempt.title,
      startedAt: attempt.started_at,
      questions: formattedQuestions,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/submit — student only ─────────────────────────────────────
// Saves all answers. MCQ answers are auto-scored against correct_option.
// Code answers receive score = null (require manual teacher scoring).
const submitExam = async (req, res) => {
  // Role check: submitExam is student-only
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied: student role required' });
  }

  const examId = parseInt(req.params.id);
  const studentId = req.user.id;
  // answers: [{ questionId, selectedOption?, codeAnswer? }]
  const { answers = [] } = req.body;

  try {
    const [attempt] = await sql`
      SELECT ea.id, ea.status, e.created_by, e.title
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.exam_id = ${examId} AND ea.student_id = ${studentId}
    `;
    if (!attempt) {
      return res.status(404).json({ message: 'No exam attempt found' });
    }
    if (attempt.status === 'submitted' || attempt.status === 'locked') {
      return res.status(409).json({ message: 'Exam already finalized' });
    }

    // Upsert each answer and auto-score MCQ
    for (const ans of answers) {
      const questionId = parseInt(ans.questionId);

      // Fetch question to check type, correct_option, and max_score
      const [question] = await sql`
        SELECT type, correct_option, max_score FROM questions WHERE id = ${questionId}
      `;
      if (!question) continue;

      let score = null;
      if (question.type === 'mcq' && ans.selectedOption !== undefined && ans.selectedOption !== null) {
        // Auto-score: max_score for correct, 0 for incorrect
        score = parseInt(ans.selectedOption) === question.correct_option ? parseFloat(question.max_score || 1) : 0;
      }

      await sql`
        INSERT INTO exam_answers (exam_attempt_id, question_id, selected_option, code_answer, score)
        VALUES (
          ${attempt.id},
          ${questionId},
          ${question.type === 'mcq' ? (ans.selectedOption ?? null) : null},
          ${question.type === 'code' ? (ans.codeAnswer ?? null) : null},
          ${score}
        )
        ON CONFLICT (exam_attempt_id, question_id)
        DO UPDATE SET
          selected_option = EXCLUDED.selected_option,
          code_answer = EXCLUDED.code_answer,
          score = EXCLUDED.score
      `;
    }

    // Mark attempt as submitted
    await sql`
      UPDATE exam_attempts
      SET status = 'submitted', submitted_at = NOW()
      WHERE id = ${attempt.id}
    `;

    let studentName = req.user.name;
    if (!studentName) {
      const [u] = await sql`SELECT name FROM users WHERE id = ${req.user.id}`;
      studentName = u?.name || 'Student';
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`teacher:${attempt.created_by}`).emit('exam:student_submitted', {
        examId, studentId: req.user.id, studentName,
      });
    }

    invalidateAnalyticsCache(attempt.created_by, null, io);
    res.json({ message: 'Exam submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/violation — student only ──────────────────────────────────
// Logs a violation row. If count reaches violation_limit, force-locks the attempt.
const recordViolation = async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied: student role required' });
  }

  const examId = parseInt(req.params.id);
  const studentId = req.user.id;
  const { violation_type } = req.body; // 'fullscreen_exit' | 'tab_switch'

  try {
    const [attempt] = await sql`
      SELECT ea.id, ea.status, e.violation_limit
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.exam_id = ${examId} AND ea.student_id = ${studentId}
    `;
    if (!attempt) {
      return res.status(404).json({ message: 'No exam attempt found' });
    }
    if (attempt.status === 'submitted' || attempt.status === 'locked') {
      return res.status(409).json({ message: 'Exam already finalized — violation not recorded' });
    }

    // Insert violation record
    await sql`
      INSERT INTO exam_violations (exam_attempt_id, violation_type)
      VALUES (${attempt.id}, ${violation_type})
    `;

    // Count total violations for this attempt
    const [{ count: violationCount }] = await sql`
      SELECT COUNT(*)::int AS count FROM exam_violations WHERE exam_attempt_id = ${attempt.id}
    `;

    const io = req.app.get('io');
    const examStudentSockets = req.app.get('examStudentSockets');
    const studentSocketId = examStudentSockets?.get(studentId);

    if (violationCount >= attempt.violation_limit) {
      // Force-lock: auto-submit and lock the attempt
      await sql`
        UPDATE exam_attempts
        SET status = 'locked', auto_submitted = TRUE, submitted_at = NOW()
        WHERE id = ${attempt.id}
      `;

      console.log(`[Violation] Student ${studentId} LOCKED on exam ${examId} after ${violationCount} violations`);

      if (io && studentSocketId) {
        io.to(studentSocketId).emit('exam:force_lock', {
          examId,
          reason: 'violation_limit_reached',
          violationCount,
          violationLimit: attempt.violation_limit,
        });
      }

      return res.json({
        violationCount,
        violationLimit: attempt.violation_limit,
        locked: true,
      });
    }

    // Not yet locked — send warning
    if (io && studentSocketId) {
      io.to(studentSocketId).emit('exam:violation_warning', {
        examId,
        violationCount,
        violationLimit: attempt.violation_limit,
        message: `Warning ${violationCount}/${attempt.violation_limit}`,
      });
    }

    res.json({
      violationCount,
      violationLimit: attempt.violation_limit,
      locked: false,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /exams/:id/results — teacher only ─────────────────────────────────────
const getExamResults = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    const [exam] = await sql`
      SELECT * FROM exams WHERE id = ${examId} AND created_by = ${teacherId}
    `;
    if (!exam) {
      return res.status(403).json({ message: 'Unauthorized or exam not found' });
    }

    const attempts = await sql`
      SELECT
        ea.id AS attempt_id,
        ea.student_id,
        u.name AS student_name,
        u.roll_no,
        es.set_number,
        ea.started_at,
        ea.submitted_at,
        ea.auto_submitted,
        ea.status,
        (SELECT COUNT(*)::int FROM exam_violations ev WHERE ev.exam_attempt_id = ea.id) AS violation_count
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      JOIN exam_sets es ON ea.exam_set_id = es.id
      WHERE ea.exam_id = ${examId}
      ORDER BY u.roll_no ASC NULLS LAST, u.name ASC
    `;

    // For each attempt, attach their answers
    const results = [];
    for (const attempt of attempts) {
      const answers = await sql`
        SELECT
          ans.id AS answer_id,
          ans.question_id,
          q.type,
          q.question_text,
          q.options,
          q.correct_option,
          q.max_score,
          ans.selected_option,
          ans.code_answer,
          ans.score
        FROM exam_answers ans
        JOIN questions q ON ans.question_id = q.id
        WHERE ans.exam_attempt_id = ${attempt.attempt_id}
        ORDER BY q.id ASC
      `;
      const formattedAnswers = answers.map(ans => {
        let parsedOptions = ans.options;
        if (typeof ans.options === 'string') {
          try {
            parsedOptions = JSON.parse(ans.options);
          } catch (e) {
            parsedOptions = [];
          }
        }
        return {
          ...ans,
          options: parsedOptions
        };
      });
      results.push({ ...attempt, answers: formattedAnswers });
    }

    res.json({ exam, results });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /exams/:id — teacher only ─────────────────────────────────────────────
const getExamById = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    const [exam] = await sql`
      SELECT * FROM exams WHERE id = ${examId} AND created_by = ${teacherId}
    `;
    if (!exam) {
      return res.status(403).json({ message: 'Unauthorized or exam not found' });
    }

    const sets = await sql`
      SELECT es.id, es.set_number,
        json_agg(q ORDER BY q.id) FILTER (WHERE q.id IS NOT NULL) AS questions
      FROM exam_sets es
      LEFT JOIN questions q ON q.exam_set_id = es.id
      WHERE es.exam_id = ${examId}
      GROUP BY es.id, es.set_number
      ORDER BY es.set_number ASC
    `;

    const formattedSets = sets.map(set => {
      const questions = (set.questions || []).map(q => {
        let parsedOptions = q.options;
        if (typeof q.options === 'string') {
          try {
            parsedOptions = JSON.parse(q.options);
          } catch (e) {
            parsedOptions = [];
          }
        }
        return {
          ...q,
          options: parsedOptions
        };
      });
      return {
        ...set,
        questions
      };
    });

    const classIds = await sql`
      SELECT class_id FROM exam_classes WHERE exam_id = ${examId}
    `;
    exam.class_ids = classIds.map(c => c.class_id);

    res.json({ exam, sets: formattedSets });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/end — teacher only ────────────────────────────────────────
// Force-ends the exam: auto-submits all in_progress attempts and notifies students.
const endExam = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const teacherId = req.user.id;

  try {
    const [exam] = await sql`
      SELECT id, status FROM exams WHERE id = ${examId} AND created_by = ${teacherId}
    `;
    if (!exam) {
      return res.status(403).json({ message: 'Unauthorized or exam not found' });
    }

    // Clear any running timer
    if (examTimers.has(examId)) {
      clearTimeout(examTimers.get(examId));
      examTimers.delete(examId);
    }

    // Trigger the same expiry logic
    await triggerExamExpired(req.app, examId);

    res.json({ message: 'Exam ended' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── POST /exams/:id/answers/:answerId/score — teacher only ────────────────────
// Manual score for a single code answer. Minimal: numeric score only.
const scoreAnswer = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const examId = parseInt(req.params.id);
  const answerId = parseInt(req.params.answerId);
  const { score } = req.body;
  const teacherId = req.user.id;

  try {
    // Verify teacher owns the exam this answer belongs to and fetch max_score
    const [answerRow] = await sql`
      SELECT ans.id, q.max_score FROM exam_answers ans
      JOIN exam_attempts ea ON ans.exam_attempt_id = ea.id
      JOIN exams e ON ea.exam_id = e.id
      JOIN questions q ON ans.question_id = q.id
      WHERE ans.id = ${answerId} AND e.id = ${examId} AND e.created_by = ${teacherId}
    `;
    if (!answerRow) {
      return res.status(403).json({ message: 'Unauthorized or answer not found' });
    }

    if (score !== undefined && score !== null && score !== '') {
      const parsedScore = parseFloat(score);
      const maxScore = parseFloat(answerRow.max_score || 10);
      if (parsedScore < 0 || parsedScore > maxScore) {
        return res.status(400).json({
          message: `Score must be between 0 and ${maxScore}`
        });
      }
    }

    const [updated] = await sql`
      UPDATE exam_answers
      SET score = ${score !== undefined && score !== null && score !== '' ? parseFloat(score) : null}
      WHERE id = ${answerId}
      RETURNING *
    `;

    invalidateAnalyticsCache(teacherId, null, req.app.get('io'));
    res.json({ answer: updated });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /exams/session/:sessionId — teacher only ──────────────────────────────
// Lists all exams for a session (used by ExamCreation to check existing exams)
const getSessionExams = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }

  const sessionId = parseInt(req.params.sessionId);
  const teacherId = req.user.id;

  try {
    const [session] = await sql`
      SELECT id FROM sessions WHERE id = ${sessionId} AND teacher_id = ${teacherId}
    `;
    if (!session) {
      return res.status(403).json({ message: 'Unauthorized or session not found' });
    }

    const exams = await sql`
      SELECT * FROM exams WHERE session_id = ${sessionId} ORDER BY created_at DESC
    `;
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getMyExams = async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Access denied: teacher role required' });
  }
  try {
    const exams = await sql`
      SELECT id, title, status, question_type, time_limit_minutes, created_at, num_sets, violation_limit
      FROM exams WHERE created_by = ${req.user.id}
      ORDER BY created_at DESC
    `;
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const openExam = async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Access denied: teacher role required' });
  const examId = parseInt(req.params.id);
  const teacherId = req.user.id;
  try {
    const [exam] = await sql`SELECT * FROM exams WHERE id = ${examId} AND created_by = ${teacherId}`;
    if (!exam) return res.status(403).json({ message: 'Unauthorized or exam not found' });
    if (exam.status !== 'draft') return res.status(400).json({ message: `Exam is already ${exam.status}` });

    await sql`UPDATE exams SET status = 'waiting_room' WHERE id = ${examId}`;

    const classes = await sql`SELECT class_id FROM exam_classes WHERE exam_id = ${examId}`;
    const io = req.app.get('io');
    if (io) {
      for (const { class_id } of classes) {
        io.to(`class:${class_id}`).emit('exam:opened', {
          examId,
          title: exam.title,
          timeLimitMinutes: exam.time_limit_minutes,
        });
      }
    }
    res.json({ message: 'Exam opened', examId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAvailableExams = async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Access denied: student role required' });
  const studentId = req.user.id;
  try {
    const exams = await sql`
      SELECT e.id, e.title, e.status, e.time_limit_minutes
      FROM exams e
      JOIN exam_classes ec ON e.id = ec.exam_id
      JOIN users u ON u.class_id = ec.class_id
      WHERE u.id = ${studentId} AND e.status IN ('waiting_room', 'active')
      ORDER BY e.created_at DESC
    `;
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const joinExam = async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Access denied: student role required' });
  const examId = parseInt(req.params.id);
  try {
    const [exam] = await sql`SELECT * FROM exams WHERE id = ${examId}`;
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'waiting_room') {
      return res.status(400).json({ message: 'Exam is not open for joining right now' });
    }

    let studentName = req.user.name;
    if (!studentName) {
      const [u] = await sql`SELECT name FROM users WHERE id = ${req.user.id}`;
      studentName = u?.name || 'Student';
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`teacher:${exam.created_by}`).emit('exam:student_joined_waiting', {
        examId, studentId: req.user.id, studentName,
      });
    }

    res.json({ examId, status: exam.status, title: exam.title });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  createExam,
  addQuestion,
  startExam,
  getMyQuestions,
  submitExam,
  recordViolation,
  getExamResults,
  getExamById,
  endExam,
  scoreAnswer,
  getSessionExams,
  openExam,
  getAvailableExams,
  joinExam,
  getMyExams,
  // Exported for server.js timer restoration on restart (future use)
  scheduleExamTimer,
};
