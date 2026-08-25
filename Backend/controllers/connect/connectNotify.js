const sql = require('../../config/db');

// resolveClassroomRecipients — the teacher who owns a classroom plus every
// student in its class. Reuses the exact same "students in this class"
// lookup myClassroomsController.getStudentClassrooms already relies on
// (users.class_id match), so recipient resolution can't drift from what
// "being in this classroom" actually means elsewhere in the app.
const resolveClassroomRecipients = async (classSubjectId) => {
  const [classroom] = await sql`
    SELECT teacher_id, class_id FROM connect_class_subjects WHERE id = ${classSubjectId}
  `;
  if (!classroom) return { teacherId: null, studentIds: [] };

  const students = await sql`
    SELECT id FROM users WHERE role = 'student' AND class_id = ${classroom.class_id}
  `;
  return { teacherId: classroom.teacher_id, studentIds: students.map((s) => s.id) };
};

// resolveAllConnectRecipients — every teacher who owns at least one
// classroom, and every student who belongs to at least one classroom's
// class. Used for is_global announcements, which reach "every classroom".
const resolveAllConnectRecipients = async () => {
  const rows = await sql`
    SELECT DISTINCT teacher_id, class_id FROM connect_class_subjects
  `;
  const classIds = [...new Set(rows.map((r) => r.class_id))];
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];

  const students = classIds.length
    ? await sql`SELECT id FROM users WHERE role = 'student' AND class_id = ANY(${classIds})`
    : [];

  return { teacherIds, studentIds: students.map((s) => s.id) };
};

module.exports = { resolveClassroomRecipients, resolveAllConnectRecipients };
