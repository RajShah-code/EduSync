const sql = require('../config/db');
const { syncClassroomForAllotment, archiveClassroomForAllotment } = require('./connect/connectClassroomSync');

// GET /admin/subject-allotments — list all allotments with joined subject/class/teacher names.
// Optional filters: class_id, semester, teacher_id, subject_id
const listAllotments = async (req, res) => {
  const { class_id, semester, teacher_id, subject_id } = req.query;

  try {
    const classFilter = class_id && class_id !== 'all' ? sql`AND sa.class_id = ${class_id}` : sql``;
    const semesterFilter = semester && semester !== 'all' ? sql`AND sa.semester = ${semester}` : sql``;
    const teacherFilter = teacher_id && teacher_id !== 'all'
      ? (teacher_id === 'unassigned' ? sql`AND sa.teacher_id IS NULL` : sql`AND sa.teacher_id = ${teacher_id}`)
      : sql``;
    const subjectFilter = subject_id && subject_id !== 'all' ? sql`AND sa.subject_id = ${subject_id}` : sql``;

    const allotments = await sql`
      SELECT
        sa.id, sa.class_id, c.name AS class_name,
        sa.subject_id, s.name AS subject_name, s.code AS subject_code,
        sa.semester, sa.teacher_id, u.name AS teacher_name, u.email AS teacher_email,
        sa.created_at
      FROM subject_allotments sa
      JOIN classes c ON c.id = sa.class_id
      JOIN subjects s ON s.id = sa.subject_id
      LEFT JOIN users u ON u.id = sa.teacher_id
      WHERE 1=1 ${classFilter} ${semesterFilter} ${teacherFilter} ${subjectFilter}
      ORDER BY c.name ASC, sa.semester ASC, s.name ASC;
    `;
    res.json({ allotments });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /admin/subject-allotments — create a new class+subject+semester(+teacher) allotment
const createAllotment = async (req, res) => {
  const { class_id, subject_id, semester, teacher_id } = req.body;

  if (!class_id || !Number.isInteger(Number(class_id))) {
    return res.status(400).json({ message: 'class_id is required and must be an integer' });
  }
  if (!subject_id || !Number.isInteger(Number(subject_id))) {
    return res.status(400).json({ message: 'subject_id is required and must be an integer' });
  }
  const semesterNum = Number(semester);
  if (!semester || !Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8) {
    return res.status(400).json({ message: 'semester is required and must be an integer between 1 and 8' });
  }

  try {
    const [cls] = await sql`SELECT id FROM classes WHERE id = ${class_id}`;
    if (!cls) return res.status(400).json({ message: 'class_id does not refer to a valid class' });

    const [subject] = await sql`SELECT id FROM subjects WHERE id = ${subject_id}`;
    if (!subject) return res.status(400).json({ message: 'subject_id does not refer to a valid subject' });

    let targetTeacherId = null;
    if (teacher_id !== undefined && teacher_id !== null && teacher_id !== '') {
      const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
      if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });
      targetTeacherId = teacher_id;
    }

    const [created] = await sql`
      INSERT INTO subject_allotments (class_id, subject_id, semester, teacher_id)
      VALUES (${class_id}, ${subject_id}, ${semesterNum}, ${targetTeacherId})
      RETURNING id, class_id, subject_id, semester, teacher_id, created_at;
    `;

    // Materialize into a live EduSync Connect classroom the moment a
    // teacher is attached — see connectClassroomSync.js. A teacher-less
    // allotment ("offered, teacher TBD") has no Connect classroom yet.
    if (targetTeacherId) {
      await syncClassroomForAllotment({
        allotmentId: created.id,
        classId: created.class_id,
        subjectId: created.subject_id,
        teacherId: created.teacher_id,
        semester: created.semester,
      });
    }

    res.status(201).json({ allotment: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This exact class/subject/semester/teacher allotment already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /admin/subject-allotments/:id — reassign teacher and/or semester
const updateAllotment = async (req, res) => {
  const { id } = req.params;
  const { semester, teacher_id } = req.body;

  try {
    const [existing] = await sql`SELECT * FROM subject_allotments WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ message: 'Allotment not found' });

    let nextSemester = existing.semester;
    if (semester !== undefined && semester !== null && semester !== '') {
      const semesterNum = Number(semester);
      if (!Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8) {
        return res.status(400).json({ message: 'semester must be an integer between 1 and 8' });
      }
      nextSemester = semesterNum;
    }

    let nextTeacherId = existing.teacher_id;
    if (teacher_id !== undefined) {
      if (teacher_id === null || teacher_id === '') {
        nextTeacherId = null;
      } else {
        const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
        if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });
        nextTeacherId = teacher_id;
      }
    }

    const [updated] = await sql`
      UPDATE subject_allotments
      SET semester = ${nextSemester}, teacher_id = ${nextTeacherId}
      WHERE id = ${id}
      RETURNING id, class_id, subject_id, semester, teacher_id, created_at;
    `;

    // Keep the linked Connect classroom (if any) in sync: a non-null
    // teacher creates/updates/reactivates it in place (same room, history
    // preserved even across a reassignment); clearing the teacher archives
    // it — read-only, never deleted. See connectClassroomSync.js.
    if (updated.teacher_id) {
      await syncClassroomForAllotment({
        allotmentId: updated.id,
        classId: updated.class_id,
        subjectId: updated.subject_id,
        teacherId: updated.teacher_id,
        semester: updated.semester,
      });
    } else {
      await archiveClassroomForAllotment(updated.id);
    }

    res.json({ allotment: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This exact class/subject/semester/teacher allotment already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /admin/subject-allotments/:id
const deleteAllotment = async (req, res) => {
  const { id } = req.params;
  try {
    // Archive the linked Connect classroom BEFORE the allotment row is
    // gone (needs the still-valid subject_allotment_id to find it) — the
    // classroom and its history are never deleted by this action.
    await archiveClassroomForAllotment(id);

    const [deleted] = await sql`DELETE FROM subject_allotments WHERE id = ${id} RETURNING id`;
    if (!deleted) return res.status(404).json({ message: 'Allotment not found' });
    res.json({ message: 'Allotment deleted', id: deleted.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  listAllotments,
  createAllotment,
  updateAllotment,
  deleteAllotment,
};
