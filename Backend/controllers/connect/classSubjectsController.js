const sql = require('../../config/db');

const VALID_POSTING_MODES = ['teacher_only', 'open'];

// POST /connect/admin/class-subjects — admin creates a new teacher+class+subject allotment
const createClassSubject = async (req, res) => {
  const { teacher_id, class_id, subject_name, posting_mode } = req.body;

  if (!teacher_id || !Number.isInteger(Number(teacher_id))) {
    return res.status(400).json({ message: 'teacher_id is required and must be an integer' });
  }
  if (!class_id || !Number.isInteger(Number(class_id))) {
    return res.status(400).json({ message: 'class_id is required and must be an integer' });
  }
  if (!subject_name || !subject_name.trim()) {
    return res.status(400).json({ message: 'subject_name is required' });
  }
  const mode = posting_mode || 'teacher_only';
  if (!VALID_POSTING_MODES.includes(mode)) {
    return res.status(400).json({ message: "posting_mode must be 'teacher_only' or 'open'" });
  }

  try {
    const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
    if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });

    const [cls] = await sql`SELECT id FROM classes WHERE id = ${class_id}`;
    if (!cls) return res.status(400).json({ message: 'class_id does not refer to a valid class' });

    const [created] = await sql`
      INSERT INTO connect_class_subjects (teacher_id, class_id, subject_name, posting_mode)
      VALUES (${teacher_id}, ${class_id}, ${subject_name.trim()}, ${mode})
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
        cs.subject_name, cs.posting_mode, cs.created_at
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

// PUT /connect/admin/class-subjects/:id — admin edits subject_name/posting_mode/reassigns teacher
const updateClassSubject = async (req, res) => {
  const { id } = req.params;
  const { teacher_id, subject_name, posting_mode } = req.body;

  if (posting_mode && !VALID_POSTING_MODES.includes(posting_mode)) {
    return res.status(400).json({ message: "posting_mode must be 'teacher_only' or 'open'" });
  }

  try {
    const [existing] = await sql`SELECT * FROM connect_class_subjects WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ message: 'Allotment not found' });

    if (teacher_id) {
      const [teacher] = await sql`SELECT id FROM users WHERE id = ${teacher_id} AND role = 'teacher'`;
      if (!teacher) return res.status(400).json({ message: 'teacher_id does not refer to a valid teacher' });
    }

    const nextTeacherId = teacher_id ?? existing.teacher_id;
    const nextSubjectName = subject_name && subject_name.trim() ? subject_name.trim() : existing.subject_name;
    const nextPostingMode = posting_mode || existing.posting_mode;

    const [updated] = await sql`
      UPDATE connect_class_subjects
      SET teacher_id = ${nextTeacherId}, subject_name = ${nextSubjectName}, posting_mode = ${nextPostingMode}
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

// PATCH /connect/teacher/classrooms/:classSubjectId/posting-mode — teacher-only.
// Updates ONLY posting_mode on a row the teacher themselves owns (never
// subject_name/teacher_id/class_id — reassignment stays admin-only via
// updateClassSubject above). Body: { posting_mode: 'open' | 'teacher_only' }.
const updateOwnPostingMode = async (req, res) => {
  const { classSubjectId } = req.params;
  const { posting_mode } = req.body;
  const teacherId = req.user.id;

  if (!posting_mode || !VALID_POSTING_MODES.includes(posting_mode)) {
    return res.status(400).json({ message: "posting_mode must be 'teacher_only' or 'open'" });
  }

  try {
    const [existing] = await sql`SELECT id, teacher_id FROM connect_class_subjects WHERE id = ${classSubjectId}`;
    if (!existing) return res.status(404).json({ message: 'Classroom not found' });
    if (existing.teacher_id !== teacherId) {
      return res.status(403).json({ message: 'You do not own this classroom' });
    }

    const [updated] = await sql`
      UPDATE connect_class_subjects
      SET posting_mode = ${posting_mode}
      WHERE id = ${classSubjectId}
      RETURNING id, teacher_id, class_id, subject_name, posting_mode, created_at;
    `;
    res.json({ allotment: updated });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createClassSubject, listClassSubjects, updateClassSubject, deleteClassSubject, updateOwnPostingMode };
