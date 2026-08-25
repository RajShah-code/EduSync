const sql = require('../../config/db');
const { resolveClassroomAccess, canSendMessage, isClassroomArchived } = require('./connectAccessControl');

// registerConnectSocketHandlers — attaches EduSync Connect's real-time
// events onto the SAME Socket.io instance the rest of the app uses.
//
// Deliberately registered as a SEPARATE io.on('connection', ...) listener
// rather than adding lines inside the existing one in server.js — Socket.io
// supports multiple listeners on the same event, so this is purely additive
// and the existing connection handler (exam/session/webrtc/etc.) is never
// touched. socket.user is already populated by the app's existing JWT
// handshake auth middleware (io.use in server.js) by the time this fires.
//
// Room naming: `connect:classroom:{classSubjectId}` — one room per
// classroom group, matching the class_subject_id primary key.
module.exports = function registerConnectSocketHandlers(io) {
  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user || {};

    // connect:classroom:join — client asks to enter a classroom's live room.
    // Access is re-validated server-side (never trust that the client only
    // shows classrooms it has access to). On failure, the socket is NOT
    // joined to the room and a connect:error is emitted back — the socket
    // itself is left connected (it's shared with the rest of the app, e.g.
    // an active broadcast session), so we reject the join rather than
    // disconnecting the whole socket.
    socket.on('connect:classroom:join', async ({ classSubjectId } = {}) => {
      if (!classSubjectId) {
        return socket.emit('connect:error', { message: 'classSubjectId is required' });
      }
      try {
        const access = await resolveClassroomAccess(userId, role, classSubjectId);
        if (!access) {
          console.log(`[Connect] REJECTED join — user ${userId} (${role}) has no access to classroom ${classSubjectId}`);
          return socket.emit('connect:error', {
            classSubjectId,
            message: 'You do not have access to this classroom',
          });
        }

        const room = `connect:classroom:${classSubjectId}`;
        socket.join(room);
        console.log(`[Connect] User ${userId} (${role}) joined room ${room}`);
        socket.emit('connect:classroom:joined', { classSubjectId });
      } catch (err) {
        console.error('[Connect] connect:classroom:join failed:', err);
        socket.emit('connect:error', { classSubjectId, message: 'Server error' });
      }
    });

    // connect:message:send — payload: { classSubjectId, content }.
    // Access + posting_mode are re-validated server-side on every send
    // (the client's own UI gating is not trusted). On success, persists to
    // connect_messages and broadcasts connect:message:new to the room —
    // including back to the sender, so all clients render from one source.
    socket.on('connect:message:send', async ({ classSubjectId, content } = {}) => {
      if (!classSubjectId || !content || !content.trim()) {
        return socket.emit('connect:error', { message: 'classSubjectId and content are required' });
      }
      try {
        const access = await resolveClassroomAccess(userId, role, classSubjectId);
        if (!access) {
          console.log(`[Connect] REJECTED send — user ${userId} (${role}) has no access to classroom ${classSubjectId}`);
          return socket.emit('connect:error', {
            classSubjectId,
            message: 'You do not have access to this classroom',
          });
        }
        if (isClassroomArchived(access)) {
          console.log(`[Connect] REJECTED send — classroom ${classSubjectId} is archived (read-only)`);
          return socket.emit('connect:error', {
            classSubjectId,
            message: 'This classroom has been archived and is read-only',
          });
        }
        if (!canSendMessage(access)) {
          console.log(`[Connect] REJECTED send — user ${userId} (student) blocked by teacher_only posting_mode on classroom ${classSubjectId}`);
          return socket.emit('connect:error', {
            classSubjectId,
            message: 'This classroom is teacher-only — students cannot post here',
          });
        }

        const [created] = await sql`
          INSERT INTO connect_messages (class_subject_id, sender_id, sender_role, content)
          VALUES (${classSubjectId}, ${userId}, ${role}, ${content.trim()})
          RETURNING id, class_subject_id, sender_id, sender_role, content, created_at;
        `;
        const payload = { ...created, sender_name: socket.user.name };

        const room = `connect:classroom:${classSubjectId}`;
        io.to(room).emit('connect:message:new', payload);
        console.log(`[Connect] User ${userId} (${role}) sent message ${created.id} to room ${room}`);
      } catch (err) {
        console.error('[Connect] connect:message:send failed:', err);
        socket.emit('connect:error', { classSubjectId, message: 'Server error' });
      }
    });
  });
};
