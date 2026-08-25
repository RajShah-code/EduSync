const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionsRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const classesRoutes = require('./routes/classesRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tasksRoutes = require('./routes/tasksRoutes');
const doubtsRoutes = require('./routes/doubtsRoutes');
const examsRoutes = require('./routes/examsRoutes');
const filesRoutes = require('./routes/filesRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const usersRoutes = require('./routes/usersRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const studentTimetableRoutes = require('./routes/studentTimetableRoutes');
const { initReminderCron } = require('./jobs/reminderCron');
const { invalidateAnalyticsCache } = require('./controllers/analyticsController');
const protect = require('./middleware/authMiddleware');
const dbSetup = require('./config/dbSetup');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin/non-browser
      if (origin === 'http://localhost:5173') return callback(null, true);
      if (origin === 'http://localhost:5174') return callback(null, true); // Connect-Frontend dev (vite.config.js)
      if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use('/files', express.json({ limit: '35mb' }), filesRoutes);
// Mirrors the /files limit above (base64-encoding a 20MB upload cap needs
// ~26.7MB of body room) — must be mounted before the generic
// bodyParser.json() below, same reason /files is, or its default (much
// smaller) limit would reject the request before /connect's own 20MB
// check in connectB2Upload.js ever runs.
app.use('/connect', express.json({ limit: '35mb' }), require('./routes/connect/connectRoutes'));
app.use(bodyParser.json());
app.use('/auth', authRoutes);
app.use('/users', protect(), usersRoutes);
app.use('/sessions', sessionRoutes);
app.use('/attendance', attendanceRoutes);

app.use('/classes', protect(), classesRoutes);
app.use('/admin', protect(['admin']), adminRoutes);
app.use('/tasks', tasksRoutes);
app.use('/doubts', doubtsRoutes);
app.use('/exams', examsRoutes);
app.use('/analytics', protect(['teacher']), analyticsRoutes);
app.use('/timetable', timetableRoutes);
app.use('/student-timetable', studentTimetableRoutes);


app.get('/', (req, res) => { res.send('EduSync backend running'); });

// ── Socket.io Auth Middleware ──────────────────────────────────────────────
// Every socket connection must send a valid JWT in the handshake auth object.
// Client sends: socket = io(URL, { auth: { token } })
// Server verifies and attaches decoded user to socket.user
// socket.user now carries: { id, role, name } — name added to JWT payload
// in authController.generateToken so it flows here automatically.

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token provided'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // { id, role, name }
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ── In-memory session state (reset on server restart — intentional) ────────
//
// teacherSockets     : Map<session_id, teacher_socket_id>
//   — So we can target the teacher with rejoin requests even from student handler.
//
// disconnectedStudents : Map<`${student_id}:${session_id}`, { ... }>
//   — Written when a student socket disconnects mid-session.
//
// pendingRejoins     : Map<`${student_id}:${session_id}`, student_socket_id>
//   — Holds the socket id of a student waiting for teacher approval.
//
// rejoinCounts       : Map<`${session_id}:${student_id}`, number>
//   — 1st join free, 2nd+ requires teacher approval.
//
// sessionStates      : Map<session_id, { mode, code, language }>
//   — Current editor/screen-share mode and latest code snapshot.
//   — Sent to every student on join so they see the right view immediately.
//   — Updated by editor:sync and editor:mode_changed from the teacher.

const sql = require('./config/db');

const teacherSockets = new Map();
const disconnectedStudents = new Map();
const pendingRejoins = new Map();
const rejoinCounts = new Map();
const sessionStates = new Map(); // Map<session_id, { mode: 'editor'|'screen', code: string, language: string }>

const getSessionState = (id) => {
  if (id === undefined || id === null) return null;
  return sessionStates.get(id) || sessionStates.get(Number(id)) || sessionStates.get(String(id));
};
const sessionModes = new Map(); // Map<session_id, 'editor'|'screen_share'>
const sessionAttendance = new Map(); // Map<session_id, Map<student_id, studentSessionState>>
// examStudentSockets: Map<student_id, socket_id>
// Populated when students emit exam:register_socket (on ExamScreen mount and on reconnect).
// Used to send exam:start, exam:force_lock, exam:violation_warning to individual students.
// Cleaned up on socket disconnect to prevent stale entries.
const examStudentSockets = new Map();
// Set of `${session_id}:${userId}` strings for students currently active in a
// session room. Used as an idempotency guard: if a student:join_session arrives
// while the student is already active (e.g. due to a client-side re-render),
// the handler is a no-op — it re-sends the session-state snapshot and returns
// without touching rejoinCounts or disconnectedStudents.
const activeStudentSessions = new Set();

const getConnectedStudentsStatus = (sessionId) => {
  const studentsMap = sessionAttendance.get(sessionId);
  if (!studentsMap) return [];
  
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
  return list;
};

const emitStudentStatusUpdate = (sessionId) => {
  const list = getConnectedStudentsStatus(sessionId);
  io.to(`teacher_session:${sessionId}`).emit('teacher:student_status_update', {
    session_id: sessionId,
    students: list
  });
};


// ── Socket.io Connection Handler ───────────────────────────────────────────
io.on('connection', (socket) => {
  const { id: userId, role, name: userName, class_id: classId } = socket.user;

  // Join student to class room
  if (role === 'student' && classId) {
    console.log(`[Connect] Student ${userId} joined room class:${classId}`);
    socket.join(`class:${classId}`);
  }

  // On connection, if it's a teacher, check if they have an active session
  if (role === 'teacher') {
    socket.join(`teacher:${userId}`);
    sql`SELECT id FROM sessions WHERE teacher_id = ${userId} AND ended_at IS NULL LIMIT 1`
      .then(([session]) => {
        if (session) {
          const sid = session.id;
          console.log(`[Reconnect] Teacher ${userId} reconnected to active session ${sid}`);
          socket._sessionId = sid;
          socket.join(`session:${sid}`);
          socket.join(`teacher_session:${sid}`);
          teacherSockets.set(sid, socket.id);
        }
      })
      .catch((err) => {
        console.error('[Reconnect] Failed to check active session for teacher:', err);
      });
  }

  // ── Phase 10: Exam socket registration ────────────────────────────────────
  // Students emit exam:register_socket on ExamScreen mount AND on every socket
  // reconnect (client re-emits from a useEffect that depends on socket.id).
  // This ensures the map stays current after network blips or page refreshes,
  // preventing the stale-socket-id class of bugs seen in the WebRTC phase.
  if (role === 'student') {
    // Immediately register on connection — this handles the reconnect case where
    // the client may not have had time to emit exam:register_socket yet.
    examStudentSockets.set(userId, socket.id);
  }

  socket.on('exam:register_socket', () => {
    if (role !== 'student') return;
    examStudentSockets.set(userId, socket.id);
    console.log(`[ExamSocket] Student ${userId} registered socket ${socket.id}`);
  });

  // EVENT: exam:join_waiting_room
  // Emitted by a student right after POST /exams/:id/join succeeds. Joining a
  // Socket.IO room (rather than a DB row) gives an accurate, self-cleaning
  // "how many students are actually here" count — the room's membership
  // shrinks automatically on disconnect, no manual bookkeeping needed. The
  // teacher's exam creation/manage screens read this via
  // exam:waiting_count_update (below) and GET /exams/:id/waiting-count.
  socket.on('exam:join_waiting_room', async (payload) => {
    if (role !== 'student') return;
    const examId = parseInt(payload?.examId);
    if (!examId) return;
    try {
      const [exam] = await sql`SELECT created_by FROM exams WHERE id = ${examId}`;
      if (!exam) return;
      socket.join(`exam_waiting:${examId}`);
      socket._examWaitingId = examId;
      socket._examWaitingTeacherId = exam.created_by;
      const count = io.sockets.adapter.rooms.get(`exam_waiting:${examId}`)?.size || 0;
      io.to(`teacher:${exam.created_by}`).emit('exam:waiting_count_update', { examId, count });
    } catch (err) {
      console.error('[ExamSocket] exam:join_waiting_room error:', err);
    }
  });

  // Teacher joins their own room (room name = 'teacher:{userId}')
  // Students join a session room when they join a session (room name = 'session:{sessionId}')
  // The teacher ALSO joins 'session:{sessionId}' so all WebRTC signaling
  // and student:joined events are scoped to that room.

  // EVENT: teacher:start_session
  // Emitted by teacher after calling POST /sessions/start successfully.
  // Payload: { session: { id, lecture_name, subject, lab_room, started_at } }
  // Teacher joins the session room so they receive student:joined and WebRTC signals
  // scoped to this session. Broadcasts session:started to ALL sockets.
  socket.on('teacher:start_session', (payload) => {
    if (role !== 'teacher') return;
    // Leave any previous session room before joining the new one,
    // so signals from old sessions don't bleed into the current broadcast.
    if (socket._sessionId) {
      socket.leave(`session:${socket._sessionId}`);
      socket.leave(`teacher_session:${socket._sessionId}`);
      teacherSockets.delete(socket._sessionId);
      sessionModes.delete(socket._sessionId);
    }
    socket._sessionId = payload.session.id;
    socket.join(`session:${payload.session.id}`);
    socket.join(`teacher_session:${payload.session.id}`);
    teacherSockets.set(payload.session.id, socket.id);
    // Initialise session state snapshot preserving pre-start language and whiteboard strokes
    const sessionId = payload.session.id;
    const prev = sessionStates.get(sessionId);

    const initialLanguage = payload.language || prev?.language || 'javascript';
    const initialCode = payload.code !== undefined ? payload.code : (prev?.code || '');
    const initialStrokes = payload.whiteboardStrokes || prev?.whiteboardStrokes || [];
    const initialBgColor = payload.whiteboardBgColor || prev?.whiteboardBgColor || '#111118';
    const initialOutput = prev?.output || { outputMode: 'none', textOutput: '', iframeSrcdoc: '', consoleLines: [] };

    sessionStates.set(sessionId, {
      mode: prev?.mode || 'editor',
      code: initialCode,
      language: initialLanguage,
      output: initialOutput,
      whiteboardStrokes: initialStrokes,
      whiteboardBgColor: initialBgColor,
    });
    sessionModes.set(sessionId, prev?.mode || 'editor');
    
    const classIds = payload.session.class_ids;
    if (classIds && Array.isArray(classIds) && classIds.length > 0) {
      let emitter = io;
      classIds.forEach(cid => {
        emitter = emitter.to(`class:${cid}`);
      });
      emitter.emit('session:started', { session: payload.session });
    } else {
      io.emit('session:started', { session: payload.session });
    }
  });

  // EVENT: teacher:end_session
  // Emitted by teacher after calling POST /sessions/end successfully.
  // Server broadcasts session:ended to targeted class rooms.
  // Clears all in-memory state for this session so disconnected students
  // no longer get the rejoin-approval flow (session is gone).
  socket.on('teacher:end_session', async (payload) => {
    if (role !== 'teacher') return;
    const sid = parseInt(payload?.session_id, 10);
    if (isNaN(sid)) return;

    let targetClassIds = [];
    try {
      const dbClasses = await sql`
        SELECT class_id FROM session_classes WHERE session_id = ${sid}
      `;
      targetClassIds = dbClasses.map(c => c.class_id);
    } catch (dbErr) {
      console.error('[Socket] Failed to fetch session classes for ending:', dbErr);
    }

    let session_started = new Date();
    let session_ended = new Date();
    try {
      const [session] = await sql`
        SELECT started_at, ended_at FROM sessions WHERE id = ${sid}
      `;
      if (session) {
        session_started = new Date(session.started_at);
        session_ended = session.ended_at ? new Date(session.ended_at) : new Date();
      }
    } catch (dbErr) {
      console.error('[Socket] Failed to fetch session info:', dbErr);
    }

    const session_total_duration_seconds = Math.max(1, Math.round((session_ended - session_started) / 1000));
    const studentsMap = sessionAttendance.get(sid);
    const exceptions = [];

    if (studentsMap) {
      for (const [studentId, studentState] of studentsMap.entries()) {
        const finalized_left_at = studentState.left_at ? new Date(studentState.left_at) : new Date(session_ended);
        const joined_at_date = new Date(studentState.joined_at);

        // Finalize last_fullscreen_exit if set
        if (studentState.last_fullscreen_exit) {
          const duration_seconds = Math.max(0, Math.round((session_ended.getTime() - new Date(studentState.last_fullscreen_exit).getTime()) / 1000));
          studentState.fullscreen_exit_log.push({
            exited_at: studentState.last_fullscreen_exit,
            returned_at: session_ended.getTime(),
            duration_seconds,
          });
          studentState.fullscreen_exit_count += 1;
          studentState.last_fullscreen_exit = null;
        }

        // Compute total time spent outside fullscreen
        const total_outside_seconds = studentState.fullscreen_exit_log.reduce((acc, log) => acc + (log.duration_seconds || 0), 0);

        // Compute total present seconds
        const total_in_session_seconds = Math.max(0, Math.round((finalized_left_at - joined_at_date) / 1000));
        const total_present_seconds = Math.max(0, total_in_session_seconds - total_outside_seconds);

        // Compute presence percentage
        const presence_percentage = Math.min(1.0, total_present_seconds / session_total_duration_seconds);

        let status = 'absent';
        let teacher_decision = null;
        if (presence_percentage >= 0.9 && studentState.fullscreen_exit_count <= 1) {
          status = 'present';
          teacher_decision = 'approved';
        }

        try {
          const [inserted] = await sql`
            INSERT INTO attendance (
              session_id, student_id, joined_at, left_at, total_present_seconds,
              fullscreen_exit_count, fullscreen_exit_log, presence_percentage, status, teacher_decision
            ) VALUES (
              ${sid}, ${studentId}, ${studentState.joined_at}, ${finalized_left_at}, ${total_present_seconds},
              ${studentState.fullscreen_exit_count}, ${JSON.stringify(studentState.fullscreen_exit_log)},
              ${presence_percentage}, ${status}, ${teacher_decision}
            )
            ON CONFLICT (session_id, student_id) DO UPDATE SET
              joined_at = EXCLUDED.joined_at,
              left_at = EXCLUDED.left_at,
              total_present_seconds = EXCLUDED.total_present_seconds,
              fullscreen_exit_count = EXCLUDED.fullscreen_exit_count,
              fullscreen_exit_log = EXCLUDED.fullscreen_exit_log,
              presence_percentage = EXCLUDED.presence_percentage,
              status = EXCLUDED.status,
              teacher_decision = EXCLUDED.teacher_decision
            RETURNING id
          `;

          if (presence_percentage < 0.9 || studentState.fullscreen_exit_count > 1) {
            const minutes_late = Math.max(0, Math.round((joined_at_date - session_started) / 60000));
            exceptions.push({
              attendance_id: inserted.id,
              student_id: studentId,
              student_name: studentState.student_name,
              joined_at: studentState.joined_at,
              minutes_late,
              fullscreen_exit_count: studentState.fullscreen_exit_count,
              fullscreen_exit_log: studentState.fullscreen_exit_log,
              presence_percentage,
            });
          }
        } catch (saveErr) {
          console.error('[Socket] Failed to save attendance:', saveErr);
        }
      }
    }

    if (exceptions.length > 0) {
      console.log(`[Socket] Emitting teacher:attendance_exceptions to room teacher_session:${sid}`);
      io.to(`teacher_session:${sid}`).emit('teacher:attendance_exceptions', {
        session_id: sid,
        exceptions,
      });
    }

    socket.leave(`session:${sid}`);
    socket.leave(`teacher_session:${sid}`);
    socket._sessionId = null;
    teacherSockets.delete(sid);
    sessionModes.delete(sid);

    for (const [key] of disconnectedStudents) {
      if (key.endsWith(`:${sid}`)) disconnectedStudents.delete(key);
    }
    for (const [key] of pendingRejoins) {
      if (key.endsWith(`:${sid}`)) pendingRejoins.delete(key);
    }
    for (const [key] of rejoinCounts) {
      if (key.startsWith(`${sid}:`)) rejoinCounts.delete(key);
    }
    sessionStates.delete(sid);
    sessionAttendance.delete(sid);

    invalidateAnalyticsCache(userId, null, io);

    if (targetClassIds.length > 0) {
      let emitter = io;
      targetClassIds.forEach(cid => {
        emitter = emitter.to(`class:${cid}`);
      });
      emitter.emit('session:ended', { session_id: sid });
    } else {
      io.emit('session:ended', { session_id: sid });
    }
  });

  // EVENT: student:join_session
  // Emitted by student after calling POST /sessions/join successfully.
  // Payload: { session_id }
  //
  // Normal path (first join):
  //   Adds student to session room and notifies room members (teacher + other students).
  //   socket.id is forwarded so the teacher can address WebRTC offers to this socket.
  //
  // Rejoin path (student was previously in this session and disconnected):
  //   Instead of auto-joining, the server holds the student in pendingRejoins and
  //   emits teacher:rejoin_request to the teacher. The student gets student:rejoin_pending
  //   and waits. The teacher then approves or denies via teacher:approve_rejoin /
  //   teacher:deny_rejoin.
  socket.on('student:join_session', (payload) => {
    console.log(`[DEBUG] [server student:join_session] ENTER — socket.id=${socket.id} role=${role} payload=${JSON.stringify(payload)} userId=${userId} ts=${Date.now()}`);
    if (role !== 'student') return;
    const { session_id } = payload;
    const key = `${userId}:${session_id}`;
    // countKey is scoped differently from disconnectedStudents key to avoid conflicts.
    const countKey = `${session_id}:${userId}`;
    // activeKey tracks live membership — keyed session_id:userId so lookups
    // are unambiguous even if the same user has multiple socket connections.
    const activeKey = `${session_id}:${userId}`;

    // ── Idempotency guard ─────────────────────────────────────────────────
    // If this student is already an active member of this session (their socket
    // is in the room and we have them in activeStudentSessions), this is a
    // duplicate emit — e.g. caused by a client re-render or React Strict Mode.
    // Treat it as a no-op: re-send the session-state snapshot so their UI is
    // fresh, but do NOT increment rejoinCounts or touch disconnectedStudents.
    if (activeStudentSessions.has(activeKey)) {
      console.log(`[DEBUG] [server student:join_session] IDEMPOTENCY GUARD TRIPPED — student ${userId} already active in session ${session_id} activeKey=${activeKey} ts=${Date.now()}`);
      console.log(`[Rejoin] duplicate join_session ignored — student ${userId} already active in session ${session_id}`);
      const state = getSessionState(session_id);
      if (state) {
        socket.emit('student:session_state', {
          session_id,
          mode: state.mode,
          code: state.code,
          language: state.language,
          output: state.output,
          currentMode: sessionModes.get(session_id) || 'editor',
          whiteboardStrokes: state.whiteboardStrokes || [],
          whiteboardBgColor: state.whiteboardBgColor || '#111118',
        });
      }
      return;
    }

    // Increment join count. First join = 1, subsequent = 2+.
    // joinCount is used purely for the attempt-number label shown to the teacher
    // and student ("Rejoin attempt #N"). It no longer drives the gate itself.
    const joinCount = (rejoinCounts.get(countKey) ?? 0) + 1;
    rejoinCounts.set(countKey, joinCount);
    console.log(`[Rejoin] student ${userId} join attempt #${joinCount} for session ${session_id}`);

    // ── Rejoin gate: triggered ONLY by a genuine prior disconnect ─────────
    // wasDisconnected is set in the socket 'disconnect' handler when the student
    // drops from the session mid-flight. joinCount alone no longer gates — a
    // duplicate emit from the frontend while still connected is handled above
    // by the idempotency guard and never reaches this point.
    const wasDisconnected = disconnectedStudents.has(key);
    console.log(`[DEBUG] [server student:join_session] CHECK REJOIN GATE — key=${key} wasDisconnected=${wasDisconnected} joinCount=${joinCount} disconnectedStudentsKeys=[${Array.from(disconnectedStudents.keys()).join(',')}] ts=${Date.now()}`);
    if (wasDisconnected) {
      console.log(`[DEBUG] [server student:join_session] BRANCH: REJOIN (wasDisconnected=true) — student_id=${userId} session_id=${session_id} teacherSocketId=${teacherSockets.get(session_id)} ts=${Date.now()}`);
      // Consume the disconnect record. A third attempt will still be gated
      // because the disconnect handler will have written a new record when
      // the student disconnects again.
      disconnectedStudents.delete(key);
      pendingRejoins.set(key, socket.id);

      const teacherSocketId = teacherSockets.get(session_id);
      if (teacherSocketId) {
        console.log(`[DEBUG] [server student:join_session] REJOIN PENDING — emitting teacher:rejoin_request to teacher_session:${session_id} and student:rejoin_pending to socket ${socket.id} (student_id=${userId}, rejoin_count=${joinCount}) ts=${Date.now()}`);
        // Notify the teacher — they see an Allow/Deny toast with the attempt count
        io.to(`teacher_session:${session_id}`).emit('teacher:rejoin_request', {
          session_id,
          student_id: userId,
          student_name: userName ?? `Student ${userId}`,
          rejoin_count: joinCount,
        });
        // Tell the student to show the "waiting for approval" overlay with count
        socket.emit('student:rejoin_pending', { session_id, rejoin_count: joinCount });
      } else {
        console.log(`[DEBUG] [server student:join_session] REJOIN FALLBACK (teacher missing) — student_id=${userId} session_id=${session_id} ts=${Date.now()}`);
        // Teacher is no longer connected (session probably ended between
        // the student's disconnect and reconnect). Fall through to normal
        // join so the student lands on a normal "session ended" state.
        socket._sessionId = session_id;
        socket.join(`session:${session_id}`);
        activeStudentSessions.add(activeKey);
        socket.to(`session:${session_id}`).emit('student:joined', {
          student_id: userId,
          socket_id: socket.id,
          session_id,
          student_name: userName || `Student ${userId}`,
        });

        // Initialize/resume attendance in the fallback case (teacher missing)
        if (!sessionAttendance.has(session_id)) {
          sessionAttendance.set(session_id, new Map());
        }
        const studentsMap = sessionAttendance.get(session_id);
        if (!studentsMap.has(userId)) {
          studentsMap.set(userId, {
            student_id: userId,
            student_name: userName || `Student ${userId}`,
            joined_at: new Date(),
            left_at: null,
            fullscreen_exit_count: 0,
            fullscreen_exit_log: [],
            last_fullscreen_exit: null,
          });
        } else {
          const studentState = studentsMap.get(userId);
          studentState.left_at = null;
          if (studentState.last_fullscreen_exit) {
            const now = Date.now();
            const duration_seconds = Math.max(0, Math.round((now - studentState.last_fullscreen_exit) / 1000));
            studentState.fullscreen_exit_log.push({
              exited_at: studentState.last_fullscreen_exit,
              returned_at: now,
              duration_seconds,
            });
            studentState.fullscreen_exit_count += 1;
            studentState.last_fullscreen_exit = null;
          }
        }
      }
      return;
    }

    // ── Normal first-join path ───────────────────────────────────────────
    console.log(`[DEBUG] [server student:join_session] BRANCH: FRESH JOIN (wasDisconnected=false) — student_id=${userId} session_id=${session_id} socket_id=${socket.id} ts=${Date.now()}`);
    socket._sessionId = session_id;
    socket.join(`session:${session_id}`);
    activeStudentSessions.add(activeKey);
    socket.to(`session:${session_id}`).emit('student:joined', {
      student_id: userId,
      socket_id: socket.id,
      session_id,
      student_name: userName || `Student ${userId}`,
    });

    // Initialize attendance on first join
    if (!sessionAttendance.has(session_id)) {
      sessionAttendance.set(session_id, new Map());
    }
    const studentsMap = sessionAttendance.get(session_id);
    if (!studentsMap.has(userId)) {
      studentsMap.set(userId, {
        student_id: userId,
        student_name: userName || `Student ${userId}`,
        joined_at: new Date(),
        left_at: null,
        fullscreen_exit_count: 0,
        fullscreen_exit_log: [],
        last_fullscreen_exit: null,
      });
    }

    // Send current session state snapshot directly to the joining student so they
    // immediately render the correct mode and see the teacher's current code.
    const state = getSessionState(session_id);
    if (state) {
      socket.emit('student:session_state', {
        session_id,
        mode: state.mode,
        code: state.code,
        language: state.language,
        output: state.output,
        currentMode: sessionModes.get(session_id) || 'editor',
        whiteboardStrokes: state.whiteboardStrokes || [],
        whiteboardBgColor: state.whiteboardBgColor || '#111118',
      });
    }

    emitStudentStatusUpdate(session_id);
  });

  // EVENT: student:request_session_state
  // A gate-free, side-effect-free way for a student to refresh their session-state
  // snapshot without going through the student:join_session rejoin-gate.
  // Used by StudentLayout when returning from a task view (task:closed) so that
  // LiveSession.jsx's sessionStateCache useEffect fires with current mode/code data.
  // No room-join, no joinCount increment, no attendance side effects.
  // If the teacher is currently screen-sharing, also triggers a fresh WebRTC offer
  // via student:resync_offer_needed so the student gets live video on return.
  // Payload: { session_id }
  socket.on('student:request_session_state', ({ session_id }) => {
    if (!session_id) return;

    const state = getSessionState(session_id);
    if (state) {
      socket.emit('student:session_state', {
        session_id,
        mode: state.mode,
        code: state.code,
        language: state.language,
        output: state.output,
        currentMode: sessionModes.get(session_id) || 'editor',
        whiteboardStrokes: state.whiteboardStrokes || [],
        whiteboardBgColor: state.whiteboardBgColor || '#111118',
      });
    }

    // If the teacher is screen-sharing, ask them to (re)send a WebRTC offer to
    // this student's socket. The student's PC was destroyed when they navigated
    // away to the task page, so a fresh offer is needed to restore live video.
    // We use a dedicated event (not student:joined) to avoid attendance/join-gate
    // side effects. The teacher's handleStudentResyncOffer calls the identical
    // createPeerConnectionForStudent path used for initial joins.
    if (sessionModes.get(session_id) === 'screen') {
      const teacherSocketId = teacherSockets.get(session_id);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit('teacher:resend_offer_to_student', {
          session_id,
          student_socket_id: socket.id,
        });
      }
    }
  });

  // EVENT: teacher:approve_rejoin
  // Teacher allows a previously-disconnected student to re-enter the session.
  // Payload: { session_id, student_id }
  // The pending student's socket is retrieved from pendingRejoins, then
  // joined to the session room and notified via student:rejoin_approved.
  // The session room is also notified via student:joined so the teacher's
  // WebRTC mesh creates a new peer connection for them.
  socket.on('teacher:approve_rejoin', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { session_id, student_id } = payload;
      const key = `${student_id}:${session_id}`;
      const studentSocketId = pendingRejoins.get(key);
      if (!studentSocketId) return;

      pendingRejoins.delete(key);
      const studentSocket = io.sockets.sockets.get(studentSocketId);
      if (studentSocket) {
        studentSocket._sessionId = session_id;
        studentSocket.join(`session:${session_id}`);
        // Mark student as active again so any subsequent duplicate emit is a no-op.
        activeStudentSessions.add(`${session_id}:${student_id}`);

        // Resume attendance clock for approved student
        const studentsMap = sessionAttendance.get(session_id);
        if (studentsMap && studentsMap.has(student_id)) {
          const studentState = studentsMap.get(student_id);
          studentState.left_at = null;
          if (studentState.last_fullscreen_exit) {
            const now = Date.now();
            const duration_seconds = Math.max(0, Math.round((now - studentState.last_fullscreen_exit) / 1000));
            studentState.fullscreen_exit_log.push({
              exited_at: studentState.last_fullscreen_exit,
              returned_at: now,
              duration_seconds,
            });
            studentState.fullscreen_exit_count += 1;
            studentState.last_fullscreen_exit = null;
          }
        }

        // Use io.to() so the teacher also receives student:joined (socket.to() would
        // exclude the sender — the teacher — from their own connectedStudents update).
        io.to(`session:${session_id}`).emit('student:joined', {
          student_id,
          socket_id: studentSocketId,
          session_id,
          student_name: studentSocket.user?.name || `Student ${student_id}`,
        });
        // Notify the approved student and replay session state so they get the
        // correct mode and code snapshot immediately.
        io.to(studentSocketId).emit('student:rejoin_approved', { session_id });
        const state = sessionStates.get(session_id);
        if (state) {
          io.to(studentSocketId).emit('student:session_state', {
            session_id,
            mode: state.mode,
            code: state.code,
            language: state.language,
            output: state.output,
            currentMode: sessionModes.get(session_id) || 'editor',
            whiteboardStrokes: state.whiteboardStrokes || [],
            whiteboardBgColor: state.whiteboardBgColor || '#111118',
          });
        }
        emitStudentStatusUpdate(session_id);
      }
    } catch (err) {
      console.error('[Socket] teacher:approve_rejoin error:', err);
    }
  });

  // EVENT: teacher:deny_rejoin
  // Teacher denies the reconnecting student. The student is notified and
  // should return to the dashboard. The pending slot is cleared.
  // Payload: { session_id, student_id }
  socket.on('teacher:deny_rejoin', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { session_id, student_id } = payload;
      const key = `${student_id}:${session_id}`;
      const studentSocketId = pendingRejoins.get(key);
      if (!studentSocketId) return;

      pendingRejoins.delete(key);
      io.to(studentSocketId).emit('student:rejoin_denied', { session_id });
    } catch (err) {
      console.error('[Socket] teacher:deny_rejoin error:', err);
    }
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────
  //
  // Mesh architecture: teacher holds one RTCPeerConnection per student.
  // Broadcast: teacher screen video + microphone audio → students (one-way).
  // Screen audio (getDisplayMedia) is also captured where browsers support it.
  // STUN only — TURN server will be needed for students behind restrictive
  // NAT/firewalls (e.g. university networks). Out of scope for this task.
  //
  // Per-student signaling flow:
  //   1. student:join_session  → room gets student:joined (includes socket.id)
  //   2. Teacher: createPC, addTrack, createOffer, setLocalDescription
  //   3. webrtc:offer          → server relays to target student socket (point-to-point)
  //   4. Student: setRemoteDescription, createAnswer, setLocalDescription
  //   5. webrtc:answer         → server relays back to teacher socket
  //   6. Both: exchange webrtc:ice-candidate events as ICE gathering progresses
  //   7. ICE completes via STUN, video flows peer-to-peer

  // webrtc:offer — teacher → specific student socket
  // Payload in : { target_socket_id, sdp, session_id, teacher_socket_id }
  // Payload out: { sdp, session_id, teacher_socket_id }
  socket.on('webrtc:offer', (payload) => {
    try {
      // DIAG-LOG-3
      console.log(`[DIAG] webrtc:offer relay received — session_id=${payload?.session_id} target_socket_id=${payload?.target_socket_id} ts=${Date.now()}`);
      if (role !== 'teacher') return;
      const { target_socket_id, sdp, session_id, teacher_socket_id } = payload;
      socket.to(target_socket_id).emit('webrtc:offer', { sdp, session_id, teacher_socket_id });
    } catch (err) {
      console.error('[Socket] webrtc:offer relay error:', err);
    }
  });

  // webrtc:answer — student → teacher socket
  // Payload in : { teacher_socket_id, sdp, session_id }
  // Payload out: { sdp, session_id, student_socket_id }
  socket.on('webrtc:answer', (payload) => {
    try {
      if (role !== 'student') return;
      const { teacher_socket_id, sdp, session_id } = payload;
      // Append student's socket_id so teacher can match this answer to the correct PC
      socket.to(teacher_socket_id).emit('webrtc:answer', {
        sdp,
        session_id,
        student_socket_id: socket.id,
      });
    } catch (err) {
      console.error('[Socket] webrtc:answer relay error:', err);
    }
  });

  // webrtc:ice-candidate — bidirectional relay (teacher ↔ student)
  // Payload in : { target_socket_id, candidate, session_id }
  // Payload out: { candidate, session_id, from_socket_id }
  socket.on('webrtc:ice-candidate', (payload) => {
    try {
      const { target_socket_id, candidate, session_id } = payload;
      socket.to(target_socket_id).emit('webrtc:ice-candidate', {
        candidate,
        session_id,
        from_socket_id: socket.id,
      });
    } catch (err) {
      console.error('[Socket] webrtc:ice-candidate relay error:', err);
    }
  });

  // webrtc:broadcast_started — teacher notifies session room that screen share is active.
  socket.on('webrtc:broadcast_started', (payload) => {
    try {
      if (role !== 'teacher') return;
      socket.to(`session:${payload.session_id}`).emit('webrtc:broadcast_started', {
        session_id: payload.session_id,
      });
    } catch (err) {
      console.error('[Socket] webrtc:broadcast_started relay error:', err);
    }
  });

  // webrtc:broadcast_ended — teacher notifies session room that screen share has stopped.
  socket.on('webrtc:broadcast_ended', (payload) => {
    try {
      if (role !== 'teacher') return;
      socket.to(`session:${payload.session_id}`).emit('webrtc:broadcast_ended', {
        session_id: payload.session_id,
      });
    } catch (err) {
      console.error('[Socket] webrtc:broadcast_ended relay error:', err);
    }
  });

  // EVENT: teacher:request_roster
  // Returns the current live roster of students connected to this session,
  // built from actual room membership — used when LiveBroadcast.jsx remounts
  // after the teacher navigates to a sibling route (e.g. Task Assignment) and
  // its local connectedStudents state was wiped on unmount.
  socket.on('teacher:request_roster', ({ session_id }) => {
    console.log(`[DEBUG] [server teacher:request_roster] ENTER — session_id=${session_id} teacher_socket.id=${socket.id} role=${role} ts=${Date.now()}`);
    if (role !== 'teacher' || !session_id) return;
    console.log(`[Socket] teacher:request_roster received for session ${session_id}`);
    const room = io.sockets.adapter.rooms.get(`session:${session_id}`);
    console.log(`[DEBUG] [server teacher:request_roster] room session:${session_id} exists=${!!room} size=${room ? room.size : 0} members=[${room ? Array.from(room).join(',') : ''}] ts=${Date.now()}`);
    const students = [];
    if (room) {
      for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.user && s.user.role === 'student') {
          students.push({
            socket_id: socketId,
            student_id: s.user.id,
            student_name: s.user.name || `Student ${s.user.id}`,
          });
        }
      }
    }
    console.log(`[DEBUG] [server teacher:request_roster] RESULT — sending teacher:roster_snapshot with ${students.length} student(s): ${JSON.stringify(students)} (pendingRejoins keys=[${Array.from(pendingRejoins.keys()).join(',')}]) ts=${Date.now()}`);
    console.log(`[Socket] Sending teacher:roster_snapshot with ${students.length} students`);
    socket.emit('teacher:roster_snapshot', { session_id, students });
  });

  // ── Live Code Editor Signaling ──────────────────────────────────────────────
  //
  // Three events let the teacher share real-time code and output with students:
  //   teacher:mode_changed  — teacher switches between 'screen_share' and 'editor' mode
  //   teacher:code_changed  — throttled keystroke broadcast
  //   teacher:code_output   — execution output panels
  //
  // These are room-scoped to session:{sessionId} and filtered to teacher-only.

  socket.on('teacher:mode_changed', (payload) => {
    try {
      // DIAG-LOG-2
      console.log(`[DIAG] teacher:mode_changed received — sessionId=${payload?.sessionId} mode=${payload?.mode} ts=${Date.now()}`);
      if (role !== 'teacher') return;
      const { sessionId, mode } = payload;
      sessionModes.set(sessionId, mode);
      const prev = sessionStates.get(sessionId);
      if (prev) {
        prev.mode = mode;
        sessionStates.set(sessionId, prev);
      }
      io.to(`session:${sessionId}`).emit('teacher:mode_changed', { sessionId, mode });
    } catch (err) {
      console.error('[Socket] teacher:mode_changed relay error:', err);
    }
  });

  socket.on('teacher:code_changed', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId, code, language } = payload;
      const prev = sessionStates.get(sessionId);
      if (prev) {
        prev.code = code;
        prev.language = language;
        sessionStates.set(sessionId, prev);
      }
      socket.to(`session:${sessionId}`).emit('teacher:code_changed', { sessionId, code, language });
    } catch (err) {
      console.error('[Socket] teacher:code_changed relay error:', err);
    }
  });

  socket.on('teacher:code_output', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId, output } = payload;
      const prev = sessionStates.get(sessionId);
      if (prev) {
        prev.output = output;
        sessionStates.set(sessionId, prev);
      }
      socket.to(`session:${sessionId}`).emit('teacher:code_output', { sessionId, output });
    } catch (err) {
      console.error('[Socket] teacher:code_output relay error:', err);
    }
  });

  socket.on('teacher:whiteboard_stroke', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId, stroke, bgColor } = payload;
      const prev = getSessionState(sessionId);
      if (prev) {
        if (!prev.whiteboardStrokes) prev.whiteboardStrokes = [];
        if (stroke && stroke.phase === 'end') {
          prev.whiteboardStrokes.push(stroke);
        }
        if (bgColor) prev.whiteboardBgColor = bgColor;
      }
      socket.to(`session:${sessionId}`).emit('teacher:whiteboard_stroke', payload);
    } catch (err) {
      console.error('[Socket] teacher:whiteboard_stroke relay error:', err);
    }
  });

  socket.on('teacher:whiteboard_clear', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId } = payload;
      const prev = getSessionState(sessionId);
      if (prev) {
        prev.whiteboardStrokes = [];
      }
      socket.to(`session:${sessionId}`).emit('teacher:whiteboard_clear', payload);
    } catch (err) {
      console.error('[Socket] teacher:whiteboard_clear relay error:', err);
    }
  });

  socket.on('teacher:whiteboard_sync', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId, strokes, bgColor } = payload;
      const prev = getSessionState(sessionId);
      if (prev) {
        prev.whiteboardStrokes = strokes || [];
        if (bgColor) prev.whiteboardBgColor = bgColor;
      }
      socket.to(`session:${sessionId}`).emit('teacher:whiteboard_sync', payload);
    } catch (err) {
      console.error('[Socket] teacher:whiteboard_sync relay error:', err);
    }
  });

  socket.on('teacher:whiteboard_snapshot', (payload) => {
    try {
      if (role !== 'teacher') return;
      const { sessionId, strokes, bgColor } = payload;
      const prev = getSessionState(sessionId);
      if (prev) {
        prev.whiteboardStrokes = strokes || [];
        if (bgColor) prev.whiteboardBgColor = bgColor;
      }
      socket.to(`session:${sessionId}`).emit('teacher:whiteboard_snapshot', payload);
    } catch (err) {
      console.error('[Socket] teacher:whiteboard_snapshot relay error:', err);
    }
  });

  // ── Focus Guard Signaling ──────────────────────────────────────────────────
  //
  // Emitted by useFocusGuard.js (student side) when the student exits or
  // re-enters fullscreen/tab-visible state. The server relays these to the
  // session room so the teacher can show per-student focus indicators.
  //
  // These are visibility events only — no automated punishment happens here.
  // The teacher sees a live indicator and a cumulative loss count per student.
  // Persisting to analytics/attendance is a future task.

  // student:focus_lost — student left fullscreen or switched tabs
  // Payload in : { session_id, student_id, timestamp }
  // Payload out: { student_id, session_id, timestamp }
  socket.on('student:focus_lost', (payload) => {
    try {
      if (role !== 'student') return;
      const { session_id, student_id, timestamp } = payload;
      const roomSize = io.sockets.adapter.rooms.get(`session:${session_id}`)?.size ?? 0;
      console.log(`[FocusGuard] student:focus_lost received for student ${student_id}, session ${session_id}, room size: ${roomSize}`);
      
      const studentsMap = sessionAttendance.get(session_id);
      if (studentsMap && studentsMap.has(userId)) {
        const studentState = studentsMap.get(userId);
        if (studentState && studentState.last_fullscreen_exit === null) {
          studentState.last_fullscreen_exit = timestamp || Date.now();
          emitStudentStatusUpdate(session_id);
        }
      }

      socket.to(`session:${session_id}`).emit('student:focus_lost', {
        student_id: userId,
        session_id,
        timestamp,
      });
    } catch (err) {
      console.error('[Socket] student:focus_lost relay error:', err);
    }
  });

  // student:focus_regained — student returned to fullscreen and tab is visible
  // Payload in : { session_id, student_id, timestamp }
  // Payload out: { student_id, session_id, timestamp }
  socket.on('student:focus_regained', (payload) => {
    try {
      if (role !== 'student') return;
      const { session_id, student_id, timestamp } = payload;
      const roomSize = io.sockets.adapter.rooms.get(`session:${session_id}`)?.size ?? 0;
      console.log(`[FocusGuard] student:focus_regained received for student ${student_id}, session ${session_id}, room size: ${roomSize}`);
      
      const studentsMap = sessionAttendance.get(session_id);
      if (studentsMap && studentsMap.has(userId)) {
        const studentState = studentsMap.get(userId);
        if (studentState && studentState.last_fullscreen_exit !== null) {
          const retAt = timestamp || Date.now();
          const duration_seconds = Math.max(0, Math.round((retAt - studentState.last_fullscreen_exit) / 1000));
          studentState.fullscreen_exit_log.push({
            exited_at: studentState.last_fullscreen_exit,
            returned_at: retAt,
            duration_seconds,
          });
          studentState.fullscreen_exit_count += 1;
          studentState.last_fullscreen_exit = null;
          emitStudentStatusUpdate(session_id);
        }
      }

      socket.to(`session:${session_id}`).emit('student:focus_regained', {
        student_id: userId,
        session_id,
        timestamp,
      });
    } catch (err) {
      console.error('[Socket] student:focus_regained relay error:', err);
    }
  });

  // EVENT: disconnect
  // When a student who was in an active session disconnects, we write a record
  // to disconnectedStudents instead of simply emitting student:left. This record
  // is checked the next time that student_id tries to join the same session_id —
  // if it exists, they go through the teacher-approval rejoin flow instead of
  // auto-joining. student:left is still emitted so the teacher's connected-student
  // list and WebRTC peer connections are cleaned up immediately.
  socket.on('disconnect', () => {
    console.log(`[DEBUG] [server disconnect] ENTER — role=${role} socket.id=${socket.id} userId=${userId} socket._sessionId=${socket._sessionId} teacherConnected=${teacherSockets.has(socket._sessionId)} ts=${Date.now()}`);
    if (role === 'student' && socket._sessionId) {
      const key = `${userId}:${socket._sessionId}`;
      const activeKey = `${socket._sessionId}:${userId}`;

      console.log(`[DEBUG] [server disconnect student] student_id=${userId} session_id=${socket._sessionId} key=${key} — activeStudentSessions before delete: ${activeStudentSessions.has(activeKey)}, disconnectedStudents before set: ${disconnectedStudents.has(key)}`);

      // Remove from active-session tracking so a subsequent join_session
      // is not treated as a duplicate no-op.
      activeStudentSessions.delete(activeKey);

      // Only write the disconnect record if the session is still active
      // (teacher still connected). If teacher already left, no point holding
      // the rejoin record — the session is over.
      if (teacherSockets.has(socket._sessionId)) {
        disconnectedStudents.set(key, {
          student_id: userId,
          session_id: socket._sessionId,
          disconnected_at: Date.now(),
        });
        console.log(`[DEBUG] [server disconnect student] wrote to disconnectedStudents key=${key} ts=${Date.now()}`);
      } else {
        console.log(`[DEBUG] [server disconnect student] teacher missing, skipped writing to disconnectedStudents for key=${key} ts=${Date.now()}`);
      }

      // Update attendance state on disconnect
      const studentsMap = sessionAttendance.get(socket._sessionId);
      if (studentsMap && studentsMap.has(userId)) {
        const studentState = studentsMap.get(userId);
        const now = Date.now();
        studentState.left_at = new Date(now);

        if (studentState.last_fullscreen_exit) {
          const duration_seconds = Math.max(0, Math.round((now - studentState.last_fullscreen_exit) / 1000));
          studentState.fullscreen_exit_log.push({
            exited_at: studentState.last_fullscreen_exit,
            returned_at: now,
            duration_seconds,
          });
          studentState.fullscreen_exit_count += 1;
        }
        // Start tracking the disconnection time as away-time
        studentState.last_fullscreen_exit = now;
      }

      // io.to() is used here (not socket.to()) because the socket has already
      // left all rooms by the time the disconnect event fires.
      console.log(`[DEBUG] [server disconnect student] emitting student:left to session:${socket._sessionId} for student_id=${userId} socket_id=${socket.id} ts=${Date.now()}`);
      io.to(`session:${socket._sessionId}`).emit('student:left', {
        student_id: userId,
        socket_id: socket.id,
        session_id: socket._sessionId,
      });

      emitStudentStatusUpdate(socket._sessionId);
    }
    // If a teacher disconnects, remove their socket and all orphaned session state.
    // This mirrors the cleanup already done in teacher:end_session, preventing
    // stale disconnectedStudents / pendingRejoins / sessionModes / sessionAttendance
    // from leaking into a session-id reuse scenario (e.g. teacher closes the tab
    // instead of clicking "End Session").
    if (role === 'teacher' && socket._sessionId) {
      teacherSockets.delete(socket._sessionId);
      const sid = socket._sessionId;
      for (const [key] of rejoinCounts) {
        if (key.startsWith(`${sid}:`)) rejoinCounts.delete(key);
      }
      for (const [key] of disconnectedStudents) {
        if (key.endsWith(`:${sid}`)) disconnectedStudents.delete(key);
      }
      for (const [key] of pendingRejoins) {
        if (key.endsWith(`:${sid}`)) pendingRejoins.delete(key);
      }
      sessionStates.delete(sid);
      sessionModes.delete(sid);
      // sessionAttendance is intentionally NOT deleted on socket disconnect
      // so student attendance tracking survives teacher refreshes/reconnects
      // until teacher:end_session or POST /sessions/end is executed.
    }
    // ── Phase 10: Exam socket cleanup ─────────────────────────────────────────
    // Remove the student's socket entry on disconnect to prevent stale map entries.
    // On reconnect, the student re-emits exam:register_socket (or is auto-registered
    // at connection time above) with their new socket.id.
    if (role === 'student') {
      examStudentSockets.delete(userId);
      console.log(`[ExamSocket] Student ${userId} socket cleaned up on disconnect`);
    }
    // Socket.IO has already removed this socket from exam_waiting:<id> by the
    // time 'disconnect' fires, so the room's size already reflects the drop —
    // just recompute and notify the teacher (io.to, not socket.to, per the
    // same rule the session disconnect handler above already follows).
    if (role === 'student' && socket._examWaitingId) {
      const examId = socket._examWaitingId;
      const teacherId = socket._examWaitingTeacherId;
      const count = io.sockets.adapter.rooms.get(`exam_waiting:${examId}`)?.size || 0;
      if (teacherId) {
        io.to(`teacher:${teacherId}`).emit('exam:waiting_count_update', { examId, count });
      }
    }
  });
});

require('./controllers/connect/connectSocketController')(io);

// Make io accessible in route controllers via req.app.get('io')
app.set('io', io);
app.set('sessionAttendance', sessionAttendance);
app.set('examStudentSockets', examStudentSockets);

dbSetup()
  .then(() => {
    initReminderCron();
    server.listen(PORT, () => {
      console.log(`EduSync backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database setup failed. Server not started.", err);
    process.exit(1);
  });