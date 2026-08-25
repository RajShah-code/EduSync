const sql = require('../../config/db');
const { resolveClassroomAccess } = require('./connectAccessControl');

// POST /connect/classrooms/:classSubjectId/mark-seen — any user with access
// to the classroom. Upserts their own last_seen_at to now().
const markSeen = async (req, res) => {
  const { classSubjectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const [row] = await sql`
      INSERT INTO connect_read_state (user_id, class_subject_id, last_seen_at)
      VALUES (${userId}, ${classSubjectId}, NOW())
      ON CONFLICT (user_id, class_subject_id) DO UPDATE SET last_seen_at = NOW()
      RETURNING user_id, class_subject_id, last_seen_at;
    `;

    res.json({ read_state: row });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/unread-summary — per-classroom counts for the requesting
// user's own classrooms. Three batched aggregate queries (messages,
// announcements, and — teacher only — ungraded submissions), each covering
// every classroom in one shot — no N+1 per-classroom queries.
const getUnreadSummary = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // 1. Resolve this user's classroom set, one query.
    let classrooms;
    if (role === 'teacher') {
      classrooms = await sql`
        SELECT cs.id, cs.class_id, c.name AS class_name, cs.subject_name
        FROM connect_class_subjects cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.teacher_id = ${userId}
      `;
    } else if (role === 'student') {
      const [student] = await sql`SELECT class_id FROM users WHERE id = ${userId}`;
      classrooms = student && student.class_id
        ? await sql`
            SELECT cs.id, cs.class_id, c.name AS class_name, cs.subject_name
            FROM connect_class_subjects cs
            JOIN classes c ON c.id = cs.class_id
            WHERE cs.class_id = ${student.class_id}
          `
        : [];
    } else {
      return res.status(403).json({ message: 'Only teachers and students have an unread summary' });
    }

    if (classrooms.length === 0) {
      return res.json({ classrooms: [] });
    }
    const classroomIds = classrooms.map((c) => c.id);

    // 2. Per-classroom last_seen_at for this user, in one shot via a CTE
    // that also fills in every classroom (even ones never marked seen).
    const messageCounts = await sql`
      WITH my_classrooms AS (
        SELECT unnest(${classroomIds}::int[]) AS class_subject_id
      ),
      classroom_seen AS (
        SELECT mc.class_subject_id, rs.last_seen_at
        FROM my_classrooms mc
        LEFT JOIN connect_read_state rs
          ON rs.class_subject_id = mc.class_subject_id AND rs.user_id = ${userId}
      )
      SELECT cs.class_subject_id, COUNT(m.id)::int AS unread_count
      FROM classroom_seen cs
      JOIN connect_messages m
        ON m.class_subject_id = cs.class_subject_id
        AND m.created_at > COALESCE(cs.last_seen_at, '-infinity'::timestamp)
      GROUP BY cs.class_subject_id;
    `;

    // 3. Unread announcements — targeted at this classroom OR is_global,
    // same last_seen_at time filter, same batching approach.
    const announcementCounts = await sql`
      WITH my_classrooms AS (
        SELECT unnest(${classroomIds}::int[]) AS class_subject_id
      ),
      classroom_seen AS (
        SELECT mc.class_subject_id, rs.last_seen_at
        FROM my_classrooms mc
        LEFT JOIN connect_read_state rs
          ON rs.class_subject_id = mc.class_subject_id AND rs.user_id = ${userId}
      )
      SELECT cs.class_subject_id, COUNT(DISTINCT a.id)::int AS unread_count
      FROM classroom_seen cs
      JOIN connect_announcements a
        ON a.created_at > COALESCE(cs.last_seen_at, '-infinity'::timestamp)
        AND (
          a.is_global = true
          OR a.id IN (
            SELECT announcement_id FROM connect_announcement_targets
            WHERE class_subject_id = cs.class_subject_id
          )
        )
      GROUP BY cs.class_subject_id;
    `;

    // 4. Teacher-only: ungraded submissions across their own assignments,
    // per classroom. NOT time-gated by last_seen_at — "ungraded" is a
    // standing state, not a since-you-last-looked count (a submission
    // doesn't become "read" just because the teacher visited the room).
    let ungradedCounts = [];
    if (role === 'teacher') {
      ungradedCounts = await sql`
        SELECT a.class_subject_id, COUNT(s.id)::int AS ungraded_count
        FROM connect_assignments a
        JOIN connect_submissions s ON s.assignment_id = a.id AND s.grade IS NULL
        WHERE a.class_subject_id = ANY(${classroomIds})
        GROUP BY a.class_subject_id;
      `;
    }

    const messageMap = new Map(messageCounts.map((r) => [r.class_subject_id, r.unread_count]));
    const announcementMap = new Map(announcementCounts.map((r) => [r.class_subject_id, r.unread_count]));
    const ungradedMap = new Map(ungradedCounts.map((r) => [r.class_subject_id, r.ungraded_count]));

    const summary = classrooms.map((c) => ({
      class_subject_id: c.id,
      class_name: c.class_name,
      subject_name: c.subject_name,
      unread_messages: messageMap.get(c.id) || 0,
      unread_announcements: announcementMap.get(c.id) || 0,
      ...(role === 'teacher' ? { ungraded_submissions: ungradedMap.get(c.id) || 0 } : {}),
    }));

    res.json({ classrooms: summary });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { markSeen, getUnreadSummary };
