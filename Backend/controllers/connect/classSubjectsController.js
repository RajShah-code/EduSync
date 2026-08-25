const sql = require('../../config/db');

// POST /connect/admin/class-subjects — admin creates a new teacher+class+subject allotment.
// posting_mode is no longer accepted from the client — every classroom is
// 'teacher_only' (open discussion mode removed by product decision).
const createClassSubject = async (req, res) => {
  const { teacher_id, class_id, subject_name } = req.body;

  if (!teacher_id || !Number.isInteger(Number(teacher_id))) {
    return res.status(400).json({ message: 'teacher_id is required and must be an integer' });
  }
  if (!class_id || !Number.isInteger(Number(class_id))) {
    return res.status(400).json({ message: 'class_id is required and must be an integer' });
  }
  if (!subject_name || !subject_name.trim()) {
    return res.status(400).json({ message: 'subject_name is required' });
  }

  try {
    const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
    if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });

    const [cls] = await sql`SELECT id FROM classes WHERE id = ${class_id}`;
    if (!cls) return res.status(400).json({ message: 'class_id does not refer to a valid class' });

    const [created] = await sql`
      INSERT INTO connect_class_subjects (teacher_id, class_id, subject_name)
      VALUES (${teacher_id}, ${class_id}, ${subject_name.trim()})
      RETURNING id, teacher_id, class_id, subject_name, posting_mode, created_at;
    `;
    res.status(201).json({ allotment: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This teacher already has this subject assigned for this class' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/admin/class-subjects — admin lists all allotments with joined teacher/class names
const listClassSubjects = async (req, res) => {
  try {
    const allotments = await sql`
      SELECT
        cs.id, cs.teacher_id, u.name AS teacher_name,
        cs.class_id, c.name AS class_name,
        cs.subject_name, cs.posting_mode, cs.semester, cs.status,
        cs.subject_allotment_id, cs.created_at
      FROM connect_class_subjects cs
      JOIN users u ON u.id = cs.teacher_id
      JOIN classes c ON c.id = cs.class_id
      ORDER BY cs.id DESC;
    `;
    res.json({ allotments });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /connect/admin/class-subjects/:id — admin edits subject_name/reassigns teacher.
// posting_mode is no longer editable — every classroom is 'teacher_only'.
const updateClassSubject = async (req, res) => {
  const { id } = req.params;
  const { teacher_id, subject_name } = req.body;

  try {
    const [existing] = await sql`SELECT * FROM connect_class_subjects WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ message: 'Allotment not found' });

    if (teacher_id) {
      const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
      if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });
    }

    const nextTeacherId = teacher_id ?? existing.teacher_id;
    const nextSubjectName = subject_name && subject_name.trim() ? subject_name.trim() : existing.subject_name;

    const [updated] = await sql`
      UPDATE connect_class_subjects
      SET teacher_id = ${nextTeacherId}, subject_name = ${nextSubjectName}
      WHERE id = ${id}
      RETURNING id, teacher_id, class_id, subject_name, posting_mode, created_at;
    `;
    res.json({ allotment: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This teacher already has this subject assigned for this class' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /connect/admin/class-subjects/:id — admin removes an allotment
const deleteClassSubject = async (req, res) => {
  const { id } = req.params;
  try {
    const [deleted] = await sql`DELETE FROM connect_class_subjects WHERE id = ${id} RETURNING id`;
    if (!deleted) return res.status(404).json({ message: 'Allotment not found' });
    res.json({ message: 'Allotment deleted', id: deleted.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /connect/teacher/classrooms/:classSubjectId — teacher-only, and
// only for a classroom they own AND that is already archived. Prevents a
// teacher from accidentally wiping out a live classroom via this path —
// deleting a live one stays admin-only via deleteClassSubject above. Hard
// delete, cascades to messages/announcements/polls/assignments/materials/
// read-state via the existing ON DELETE CASCADE FKs — no new cleanup logic.
const deleteOwnArchivedClassroom = async (req, res) => {
  const { classSubjectId } = req.params;
  const teacherId = req.user.id;

  try {
    const [existing] = await sql`
      SELECT id, teacher_id, status FROM connect_class_subjects WHERE id = ${classSubjectId}
    `;
    if (!existing) return res.status(404).json({ message: 'Classroom not found' });
    if (existing.teacher_id !== teacherId) {
      return res.status(403).json({ message: 'You do not own this classroom' });
    }
    if (existing.status !== 'archived') {
      return res.status(400).json({ message: 'Only an archived classroom can be deleted this way' });
    }

    await sql`DELETE FROM connect_class_subjects WHERE id = ${classSubjectId}`;
    res.json({ message: 'Classroom deleted', id: Number(classSubjectId) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  createClassSubject,
  listClassSubjects,
  updateClassSubject,
  deleteClassSubject,
  deleteOwnArchivedClassroom,
};
