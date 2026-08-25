const sql = require('../../config/db');
const { resolveClassroomAccess, canSendMessage } = require('./connectAccessControl');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// GET /connect/classrooms/:classSubjectId/messages — paginated history.
//
// Pagination: cursor-based on message id (monotonic — avoids the
// skip/duplicate rows offset pagination gets under concurrent inserts).
// Query params: `before` (optional message id — returns messages older
// than this id), `limit` (optional, default 30, max 100).
// Rows come back newest-first; `next_cursor` is the oldest id in this page
// (pass it back as `before` to fetch the next older page), or null if this
// page wasn't full (i.e. there's nothing older left).
const getMessages = async (req, res) => {
  const { classSubjectId } = req.params;
  const { before, limit } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  const pageSize = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const beforeFilter = before ? sql`AND m.id < ${before}` : sql``;

    const rows = await sql`
      SELECT m.id, m.class_subject_id, m.sender_id, m.sender_role, m.content, m.created_at, u.name AS sender_name
      FROM connect_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.class_subject_id = ${classSubjectId} ${beforeFilter}
      ORDER BY m.id DESC
      LIMIT ${pageSize};
    `;

    res.json({
      messages: rows,
      next_cursor: rows.length === pageSize ? rows[rows.length - 1].id : null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /connect/classrooms/:classSubjectId/messages — fallback send path
// (for reliability alongside the socket path). Access + posting_mode
// checked exactly like the socket handler (shared helper), persists to
// connect_messages, and also broadcasts to the socket room so a message
// sent over REST doesn't silently diverge from what live socket clients see.
const sendMessage = async (req, res) => {
  const { classSubjectId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'content is required' });
  }

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }
    if (!canSendMessage(access)) {
      return res.status(403).json({ message: 'This classroom is teacher-only — students cannot post here' });
    }

    const [created] = await sql`
      INSERT INTO connect_messages (class_subject_id, sender_id, sender_role, content)
      VALUES (${classSubjectId}, ${userId}, ${role}, ${content.trim()})
      RETURNING id, class_subject_id, sender_id, sender_role, content, created_at;
    `;
    const payload = { ...created, sender_name: req.user.name };

    const io = req.app.get('io');
    if (io) {
      io.to(`connect:classroom:${classSubjectId}`).emit('connect:message:new', payload);
    }

    res.status(201).json({ message: payload });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getMessages, sendMessage };
