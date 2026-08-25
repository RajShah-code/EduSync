const sql = require('../../config/db');

// GET /connect/teacher/my-classrooms — teacher-only.
//
// display_name rule (flagged for review — not locked down per the spec):
// group this teacher's own allotments by class_id. If this teacher teaches
// MORE THAN ONE subject_name for that class, display_name = "ClassName(Subject)"
// (e.g. "FYBCA(Math)") so the teacher can tell those classrooms apart in a
// list; if they only teach one subject for that class, display_name is just
// "ClassName".
const getTeacherClassrooms = async (req, res) => {
  const teacherId = req.user.id;

  try {
    const rows = await sql`
      SELECT cs.id, cs.class_id, c.name AS class_name, cs.subject_name, cs.posting_mode, cs.created_at
      FROM connect_class_subjects cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.teacher_id = ${teacherId}
      ORDER BY c.name ASC, cs.subject_name ASC;
    `;

    const subjectCountByClass = new Map();
    for (const row of rows) {
      subjectCountByClass.set(row.class_id, (subjectCountByClass.get(row.class_id) || 0) + 1);
    }

    const classrooms = rows.map((row) => ({
      id: row.id,
      class_id: row.class_id,
      class_name: row.class_name,
      subject_name: row.subject_name,
      posting_mode: row.posting_mode,
      created_at: row.created_at,
      display_name:
        subjectCountByClass.get(row.class_id) > 1
          ? `${row.class_name}(${row.subject_name})`
          : row.class_name,
    }));

    res.json({ classrooms });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/student/my-classrooms — student-only.
//
// A student's classrooms are derived from users.class_id (the single class
// a student belongs to, confirmed against the existing schema) crossed with
// every connect_class_subjects row for that class.
//
// display_name rule (flagged for review — not locked down per the spec):
// group this class's allotments by subject_name. If MORE THAN ONE teacher
// teaches that subject to this student's class, display_name =
// "Subject(TeacherName)" (e.g. "DSA(Mr. Shah)") so the student can tell
// them apart; otherwise display_name is just "Subject".
const getStudentClassrooms = async (req, res) => {
  const studentId = req.user.id;

  try {
    const [student] = await sql`SELECT class_id FROM users WHERE id = ${studentId}`;
    if (!student || !student.class_id) {
      return res.json({ classrooms: [] });
    }

    const rows = await sql`
      SELECT cs.id, cs.teacher_id, u.name AS teacher_name, cs.subject_name, cs.posting_mode, cs.created_at
      FROM connect_class_subjects cs
      JOIN users u ON u.id = cs.teacher_id
      WHERE cs.class_id = ${student.class_id}
      ORDER BY cs.subject_name ASC;
    `;

    const teachersBySubject = new Map();
    for (const row of rows) {
      const set = teachersBySubject.get(row.subject_name) || new Set();
      set.add(row.teacher_id);
      teachersBySubject.set(row.subject_name, set);
    }

    const classrooms = rows.map((row) => ({
      id: row.id,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      subject_name: row.subject_name,
      posting_mode: row.posting_mode,
      created_at: row.created_at,
      display_name:
        teachersBySubject.get(row.subject_name).size > 1
          ? `${row.subject_name}(${row.teacher_name})`
          : row.subject_name,
    }));

    res.json({ classrooms });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getTeacherClassrooms, getStudentClassrooms };
