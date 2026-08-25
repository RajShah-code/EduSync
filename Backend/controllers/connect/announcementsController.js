const sql = require('../../config/db');
const { resolveClassroomAccess } = require('./connectAccessControl');
const { resolveClassroomRecipients, resolveAllConnectRecipients } = require('./connectNotify');
const { sendPushToUsers } = require('./connectPushSender');

// notifyAnnouncement — live-broadcasts + pushes one announcement to its
// recipients. Students always get it; teachers only get it when the
// announcement is admin-authored (per product decision — a teacher's own
// announcement to their own classroom doesn't need to notify themselves).
// Students and teachers get separate push payloads since their deep-link
// URL differs (each role has its own classroom route).
async function notifyAnnouncement({ io, announcement, isGlobal, targetIds, authorRole }) {
  const notifyTeacherToo = authorRole === 'admin';
  const title = 'New announcement';
  const body = announcement.content.slice(0, 120);

  if (isGlobal) {
    const rooms = await sql`SELECT id FROM connect_class_subjects`;
    for (const { id } of rooms) {
      io?.to(`connect:classroom:${id}`).emit('connect:announcement:new', announcement);
    }
    const { teacherIds, studentIds } = await resolveAllConnectRecipients();
    sendPushToUsers(studentIds, { title, body, url: '/student' })
      .catch((err) => console.error('[Push] global announcement notify (students) failed:', err));
    if (notifyTeacherToo) {
      sendPushToUsers(teacherIds, { title, body, url: '/teacher' })
        .catch((err) => console.error('[Push] global announcement notify (teachers) failed:', err));
    }
    return;
  }

  for (const classSubjectId of targetIds) {
    io?.to(`connect:classroom:${classSubjectId}`).emit('connect:announcement:new', announcement);
    const { teacherId, studentIds } = await resolveClassroomRecipients(classSubjectId);
    sendPushToUsers(studentIds, { title, body, url: `/student/classrooms/${classSubjectId}` })
      .catch((err) => console.error('[Push] announcement notify (students) failed:', err));
    if (notifyTeacherToo) {
      sendPushToUsers([teacherId], { title, body, url: `/teacher/classrooms/${classSubjectId}` })
        .catch((err) => console.error('[Push] announcement notify (teacher) failed:', err));
    }
  }
}

// POST /connect/announcements — role-branched: teacher pins to classroom(s)
// they own; admin targets specific classroom(s) (any teacher's) or goes
// is_global to reach every classroom. Body:
//   { content, is_global?: boolean, target_class_subject_ids?: number[] }
//
// A teacher setting is_global=true gets a hard 403, not a silent strip —
// silently dropping a field the client explicitly sent would hide a client
// bug instead of surfacing it.
const createAnnouncement = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { content, is_global, target_class_subject_ids } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'content is required' });
  }

  const targetIds = Array.isArray(target_class_subject_ids)
    ? [...new Set(target_class_subject_ids.map(Number))]
    : [];

  try {
    if (role === 'teacher') {
      if (is_global) {
        return res.status(403).json({ message: 'Teachers cannot create global announcements' });
      }
      if (targetIds.length === 0) {
        return res.status(400).json({ message: 'target_class_subject_ids is required and must be a non-empty array' });
      }

      // Ownership re-verified server-side for every target — never trust
      // the client's own list of "classrooms I teach".
      const owned = await sql`
        SELECT id, status FROM connect_class_subjects
        WHERE id = ANY(${targetIds}) AND teacher_id = ${userId}
      `;
      const ownedIds = new Set(owned.map((r) => r.id));
      const notOwned = targetIds.filter((id) => !ownedIds.has(id));
      if (notOwned.length > 0) {
        return res.status(403).json({
          message: 'You can only post announcements to classrooms you teach',
          not_owned: notOwned,
        });
      }

      const archived = owned.filter((r) => r.status === 'archived').map((r) => r.id);
      if (archived.length > 0) {
        return res.status(403).json({
          message: 'This classroom has been archived and is read-only',
          archived,
        });
      }

      const announcement = await insertAnnouncement({ userId, role, content, isGlobal: false, targetIds });
      notifyAnnouncement({ io: req.app.get('io'), announcement, isGlobal: false, targetIds, authorRole: role })
        .catch((err) => console.error('[Connect] announcement notify failed:', err));
      return res.status(201).json({ announcement });
    }

    if (role === 'admin') {
      if (is_global && targetIds.length > 0) {
        return res.status(400).json({ message: 'Provide either is_global or target_class_subject_ids, not both' });
      }
      if (!is_global && targetIds.length === 0) {
        return res.status(400).json({ message: 'Provide is_global=true or a non-empty target_class_subject_ids array' });
      }

      if (!is_global) {
        const existing = await sql`
          SELECT id FROM connect_class_subjects WHERE id = ANY(${targetIds})
        `;
        const existingIds = new Set(existing.map((r) => r.id));
        const missing = targetIds.filter((id) => !existingIds.has(id));
        if (missing.length > 0) {
          return res.status(400).json({ message: 'One or more target_class_subject_ids do not exist', missing });
        }
      }

      const announcement = await insertAnnouncement({ userId, role, content, isGlobal: !!is_global, targetIds: is_global ? [] : targetIds });
      notifyAnnouncement({ io: req.app.get('io'), announcement, isGlobal: !!is_global, targetIds, authorRole: role })
        .catch((err) => console.error('[Connect] announcement notify failed:', err));
      return res.status(201).json({ announcement });
    }

    return res.status(403).json({ message: 'Only teachers and admins can create announcements' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// insertAnnouncement — shared insert + target-row fan-out for both branches above.
async function insertAnnouncement({ userId, role, content, isGlobal, targetIds }) {
  const [announcement] = await sql`
    INSERT INTO connect_announcements (author_id, author_role, content, is_global)
    VALUES (${userId}, ${role}, ${content.trim()}, ${isGlobal})
    RETURNING id, author_id, author_role, content, is_global, created_at;
  `;

  if (!isGlobal && targetIds.length > 0) {
    for (const classSubjectId of targetIds) {
      await sql`
        INSERT INTO connect_announcement_targets (announcement_id, class_subject_id)
        VALUES (${announcement.id}, ${classSubjectId});
      `;
    }
  }

  return { ...announcement, target_class_subject_ids: isGlobal ? [] : targetIds };
}

// GET /connect/classrooms/:classSubjectId/announcements — any user with
// access to that classroom (teacher who owns it, or student in its class).
// Sees: announcements targeted at this classroom UNION every is_global one.
const getClassroomAnnouncements = async (req, res) => {
  const { classSubjectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const announcements = await sql`
      SELECT DISTINCT a.id, a.author_id, u.name AS author_name, a.author_role, a.content, a.is_global, a.created_at
      FROM connect_announcements a
      JOIN users u ON u.id = a.author_id
      LEFT JOIN connect_announcement_targets t ON t.announcement_id = a.id
      WHERE a.is_global = true OR t.class_subject_id = ${classSubjectId}
      ORDER BY a.created_at DESC;
    `;

    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/admin/announcements — admin-only, everything this admin has
// sent (their own reference/history — not every admin's).
const getAdminAnnouncements = async (req, res) => {
  const adminId = req.user.id;

  try {
    const announcements = await sql`
      SELECT a.id, a.author_id, a.author_role, a.content, a.is_global, a.created_at,
        COALESCE(
          json_agg(t.class_subject_id) FILTER (WHERE t.class_subject_id IS NOT NULL),
          '[]'
        ) AS target_class_subject_ids
      FROM connect_announcements a
      LEFT JOIN connect_announcement_targets t ON t.announcement_id = a.id
      WHERE a.author_id = ${adminId}
      GROUP BY a.id
      ORDER BY a.created_at DESC;
    `;

    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createAnnouncement, getClassroomAnnouncements, getAdminAnnouncements };
