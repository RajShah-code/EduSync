const sql = require('../config/db');

// Named risk thresholds (configurable by teacher/admin)
const ATTENDANCE_THRESHOLD = 75;
const TASK_COMPLETION_THRESHOLD = 50;
const EXAM_AVG_THRESHOLD = 40;

// In-memory TTL Cache: key `${teacherId}:${classId}` -> { expiresAt, data }
const analyticsCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Clears cache for teacher/class and emits analytics:updated to teacher's socket room.
 */
const invalidateAnalyticsCache = (teacherId, classId, io) => {
  if (teacherId && classId) {
    analyticsCache.delete(`${teacherId}:${classId}`);
  } else if (teacherId) {
    for (const key of analyticsCache.keys()) {
      if (key.startsWith(`${teacherId}:`)) {
        analyticsCache.delete(key);
      }
    }
  } else {
    analyticsCache.clear();
  }

  if (io && teacherId) {
    console.log(`[AnalyticsCache] Invalidated & emitting analytics:updated to teacher:${teacherId}`);
    io.to(`teacher:${teacherId}`).emit('analytics:updated');
  }
};

/**
 * GET /analytics/class/:class_id
 * Returns aggregated analytics for the specified class scoped strictly to the requesting teacher's sessions.
 */
const getClassAnalytics = async (req, res) => {
  const teacherId = req.user.id;
  const classId = parseInt(req.params.class_id);

  if (!classId || isNaN(classId)) {
    return res.status(400).json({ message: 'Invalid class ID' });
  }

  const cacheKey = `${teacherId}:${classId}`;
  const cached = analyticsCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[AnalyticsCache] HIT for ${cacheKey} at ${new Date().toISOString()}`);
    const io = req.app.get('io');
    if (io) {
      io.to(`teacher:${teacherId}`).emit('analytics:updated');
    }
    return res.json({ ...cached.data, cached: true });
  }

  console.log(`[AnalyticsCache] MISS for ${cacheKey} at ${new Date().toISOString()}`);

  try {
    // 1. Verify class exists
    const [targetClass] = await sql`SELECT id, name FROM classes WHERE id = ${classId}`;
    if (!targetClass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // 2. Fetch sessions strictly scoped to this teacher and this class
    const sessions = await sql`
      SELECT s.id, s.lecture_name, s.started_at
      FROM sessions s
      JOIN session_classes sc ON s.id = sc.session_id
      WHERE s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
      ORDER BY s.started_at ASC
    `;

    const totalSessions = sessions.length;

    // If zero sessions exist for this teacher and class, return empty analytics payload
    if (totalSessions === 0) {
      const emptyPayload = {
        class_id: classId,
        class_name: targetClass.name,
        summary: {
          avgAttendance: 0,
          avgTaskCompletion: 0,
          avgExamScore: 0,
          atRiskCount: 0,
          totalGradedAnswers: 0,
          totalExamAnswers: 0,
        },
        attendanceTrend: [],
        taskCompletion: { overallPct: 0 },
        examPerformance: [],
        atRiskStudents: [],
      };

      analyticsCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: emptyPayload,
      });

      return res.json(emptyPayload);
    }

    // 3. Attendance Trend (per-session average presence percentage)
    const attendanceTrendRows = await sql`
      SELECT 
        s.id AS session_id,
        s.lecture_name,
        s.started_at,
        COALESCE(AVG(a.presence_percentage), 0) AS avg_presence
      FROM sessions s
      JOIN session_classes sc ON s.id = sc.session_id
      LEFT JOIN attendance a ON s.id = a.session_id
      WHERE s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
      GROUP BY s.id, s.lecture_name, s.started_at
      ORDER BY s.started_at ASC
    `;

    const attendanceTrend = attendanceTrendRows.map((row) => {
      const d = new Date(row.started_at);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()} - ${row.lecture_name}`;
      return {
        session_id: row.session_id,
        date: dateStr,
        rate: Math.round(parseFloat(row.avg_presence) * 1000) / 10, // float 0-100 with 1 decimal
      };
    });

    const overallAvgAttendance =
      attendanceTrend.length > 0
        ? Math.round(
            (attendanceTrend.reduce((acc, curr) => acc + curr.rate, 0) / attendanceTrend.length) * 10
          ) / 10
        : 0;

    // 4. Task Completion (across tasks in this teacher+class's sessions)
    const tasks = await sql`
      SELECT t.id
      FROM tasks t
      JOIN sessions s ON t.session_id = s.id
      JOIN session_classes sc ON s.id = sc.session_id
      WHERE s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
    `;

    const totalTasks = tasks.length;

    const [studentCountRow] = await sql`
      SELECT COUNT(*)::int AS count FROM users WHERE role = 'student' AND class_id = ${classId}
    `;
    const totalStudentsInClass = studentCountRow ? studentCountRow.count : 0;

    const expectedSubmissions = totalTasks * totalStudentsInClass;

    const [submittedCountRow] = await sql`
      SELECT COUNT(*)::int AS count
      FROM submissions sub
      JOIN tasks t ON sub.task_id = t.id
      JOIN sessions s ON t.session_id = s.id
      JOIN session_classes sc ON s.id = sc.session_id
      WHERE s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
        AND sub.status IN ('submitted', 'auto_submitted')
    `;

    const submittedSubmissions = submittedCountRow ? submittedCountRow.count : 0;
    const taskCompletionPct =
      expectedSubmissions > 0
        ? Math.round((submittedSubmissions / expectedSubmissions) * 1000) / 10
        : 0;

    // 5. Exam Performance (exams scoped strictly to this teacher and class)
    const exams = await sql`
      SELECT DISTINCT e.id, e.title, e.created_at
      FROM exams e
      LEFT JOIN exam_classes ec ON e.id = ec.exam_id
      LEFT JOIN sessions s ON e.session_id = s.id
      LEFT JOIN session_classes sc ON s.id = sc.session_id
      WHERE (e.created_by = ${teacherId} AND ec.class_id = ${classId})
         OR (s.teacher_id = ${teacherId} AND sc.class_id = ${classId})
      ORDER BY e.created_at ASC
    `;

    const examPerformance = [];
    let totalGradedAnswers = 0;
    let totalExamAnswers = 0;
    let sumExamScores = 0;
    let examCountWithScores = 0;

    for (const exam of exams) {
      const [answerStats] = await sql`
        SELECT 
          COUNT(ea.id)::int AS total_answers,
          COUNT(ea.score)::int AS graded_answers,
          COALESCE(AVG(ea.score), 0) AS avg_score
        FROM exam_answers ea
        JOIN exam_attempts att ON ea.exam_attempt_id = att.id
        WHERE att.exam_id = ${exam.id}
      `;

      const total = answerStats ? answerStats.total_answers : 0;
      const graded = answerStats ? answerStats.graded_answers : 0;
      const avg = answerStats ? parseFloat(answerStats.avg_score) : 0;

      // Note: assuming question score is 0..1 or scaled 0..100.
      // If score is 0..1, avgScorePct = avg * 100.
      const avgScorePct = Math.round(avg * 1000) / 10;

      totalExamAnswers += total;
      totalGradedAnswers += graded;

      if (total > 0 && graded > 0) {
        sumExamScores += avgScorePct;
        examCountWithScores += 1;
      }

      examPerformance.push({
        exam_id: exam.id,
        exam: exam.title,
        avg: avgScorePct,
        graded_count: graded,
        total_count: total,
        is_fully_graded: total > 0 && graded === total,
      });
    }

    const overallAvgExamScore =
      examCountWithScores > 0
        ? Math.round((sumExamScores / examCountWithScores) * 10) / 10
        : 0;

    // 6. At-Risk Students (scoped to users in class_id, filtered by teacher sessions)
    const students = await sql`
      SELECT id, name, roll_no
      FROM users
      WHERE role = 'student' AND class_id = ${classId}
      ORDER BY name ASC
    `;

    const atRiskStudents = [];

    for (const student of students) {
      // Student Attendance %
      const [studentAttendanceRow] = await sql`
        SELECT COALESCE(AVG(a.presence_percentage), 0) AS avg_presence, COUNT(a.id)::int AS records_count
        FROM attendance a
        JOIN sessions s ON a.session_id = s.id
        JOIN session_classes sc ON s.id = sc.session_id
        WHERE a.student_id = ${student.id} AND s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
      `;

      const studentAttPct = studentAttendanceRow
        ? Math.round(parseFloat(studentAttendanceRow.avg_presence) * 1000) / 10
        : 0;

      const hasAttendanceRisk = totalSessions > 0 && studentAttPct < ATTENDANCE_THRESHOLD;

      // Student Task Completion %
      const [studentTasksRow] = await sql`
        SELECT COUNT(sub.id)::int AS submitted_count
        FROM submissions sub
        JOIN tasks t ON sub.task_id = t.id
        JOIN sessions s ON t.session_id = s.id
        JOIN session_classes sc ON s.id = sc.session_id
        WHERE sub.student_id = ${student.id} AND s.teacher_id = ${teacherId} AND sc.class_id = ${classId}
          AND sub.status IN ('submitted', 'auto_submitted')
      `;

      const studentTaskCount = studentTasksRow ? studentTasksRow.submitted_count : 0;
      const studentTaskCompPct =
        totalTasks > 0 ? Math.round((studentTaskCount / totalTasks) * 1000) / 10 : 100;

      const hasTaskRisk = totalTasks > 0 && studentTaskCompPct < TASK_COMPLETION_THRESHOLD;

      // Student Exam Score & Grading Completeness Guard
      const [studentExamRow] = await sql`
        SELECT 
          COUNT(ea.id)::int AS total_answers,
          COUNT(ea.score)::int AS graded_answers,
          COALESCE(AVG(ea.score), 0) AS avg_score
        FROM exam_answers ea
        JOIN exam_attempts att ON ea.exam_attempt_id = att.id
        JOIN exams e ON att.exam_id = e.id
        LEFT JOIN exam_classes ec ON e.id = ec.exam_id
        LEFT JOIN sessions s ON e.session_id = s.id
        LEFT JOIN session_classes sc ON s.id = sc.session_id
        WHERE att.student_id = ${student.id}
          AND ((e.created_by = ${teacherId} AND ec.class_id = ${classId})
           OR (s.teacher_id = ${teacherId} AND sc.class_id = ${classId}))
      `;

      const totalAns = studentExamRow ? studentExamRow.total_answers : 0;
      const gradedAns = studentExamRow ? studentExamRow.graded_answers : 0;
      const studentExamScorePct = studentExamRow
        ? Math.round(parseFloat(studentExamRow.avg_score) * 1000) / 10
        : 0;

      // Exam Risk Exclusion Guard (Rule 1a):
      // Only flag exam risk if an exam attempt is 100% graded (no pending score IS NULL code questions)
      const isFullyGraded = totalAns > 0 && gradedAns === totalAns;
      const hasExamRisk = isFullyGraded && studentExamScorePct < EXAM_AVG_THRESHOLD;

      // Calculate total triggered risk flags
      const riskCount = (hasAttendanceRisk ? 1 : 0) + (hasTaskRisk ? 1 : 0) + (hasExamRisk ? 1 : 0);

      if (riskCount >= 1) {
        atRiskStudents.push({
          id: student.id,
          name: student.name,
          roll_no: student.roll_no,
          attendance: `${studentAttPct}%`,
          taskCompletion: `${studentTaskCompPct}%`,
          avgScore: isFullyGraded ? `${studentExamScorePct}%` : `${studentExamScorePct}%*`,
          isFullyGraded,
          riskLevel: riskCount >= 2 ? 'high' : 'medium',
          triggeredRisks: {
            attendance: hasAttendanceRisk,
            task: hasTaskRisk,
            exam: hasExamRisk,
          },
        });
      }
    }

    const responsePayload = {
      class_id: classId,
      class_name: targetClass.name,
      summary: {
        avgAttendance: overallAvgAttendance,
        avgTaskCompletion: taskCompletionPct,
        avgExamScore: overallAvgExamScore,
        atRiskCount: atRiskStudents.length,
        totalGradedAnswers,
        totalExamAnswers,
      },
      attendanceTrend,
      taskCompletion: { overallPct: taskCompletionPct },
      examPerformance,
      atRiskStudents,
    };

    analyticsCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: responsePayload,
    });

    res.json(responsePayload);
  } catch (err) {
    console.error('[AnalyticsController] Error computing analytics:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getClassAnalytics,
  invalidateAnalyticsCache,
  ATTENDANCE_THRESHOLD,
  TASK_COMPLETION_THRESHOLD,
  EXAM_AVG_THRESHOLD,
};
