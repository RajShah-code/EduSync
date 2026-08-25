const sql = require('../../config/db');

// connectClassroomSync — materializes main-EduSync curriculum allotments
// (subject_allotments, admin panel) into EduSync Connect classrooms
// (connect_class_subjects), so a teacher/student never has to manually
// recreate in Connect what an admin already set up in the curriculum.
// One-way sync: subject_allotments is the source of truth, Connect never
// writes back to it. Connect's own admin page can still create classrooms
// manually (subject_allotment_id stays NULL for those) — untouched here.

// syncClassroomForAllotment — called whenever an allotment is created/
// updated with a non-null teacher_id. Upserts the matching Connect
// classroom, keyed first by subject_allotment_id (so a teacher reassignment
// updates the SAME classroom, preserving message/poll/assignment history),
// falling back to Connect's own (teacher_id, class_id, subject_name)
// uniqueness (so a manually-created Connect row with the identical
// combination gets linked/revived instead of erroring on that constraint).
const syncClassroomForAllotment = async ({ allotmentId, classId, subjectId, teacherId, semester }) => {
  const [subject] = await sql`SELECT name FROM subjects WHERE id = ${subjectId}`;
  if (!subject) return null;

  const [existingByAllotment] = await sql`
    SELECT id FROM connect_class_subjects WHERE subject_allotment_id = ${allotmentId}
  `;

  if (existingByAllotment) {
    const [updated] = await sql`
      UPDATE connect_class_subjects
      SET teacher_id = ${teacherId}, class_id = ${classId}, subject_name = ${subject.name}, semester = ${semester}, status = 'active'
      WHERE id = ${existingByAllotment.id}
      RETURNING id;
    `;
    return updated;
  }

  const [synced] = await sql`
    INSERT INTO connect_class_subjects (teacher_id, class_id, subject_name, subject_allotment_id, semester, status)
    VALUES (${teacherId}, ${classId}, ${subject.name}, ${allotmentId}, ${semester}, 'active')
    ON CONFLICT (teacher_id, class_id, subject_name) DO UPDATE SET
      subject_allotment_id = EXCLUDED.subject_allotment_id,
      semester = EXCLUDED.semester,
      status = 'active'
    RETURNING id;
  `;
  return synced;
};

// archiveClassroomForAllotment — called when an allotment loses its teacher
// (unassigned) or is deleted. Never deletes the Connect classroom or its
// content — flips it to 'archived' (read-only, dimmed, no new posts) so
// history stays intact. No-op if nothing is linked.
const archiveClassroomForAllotment = async (allotmentId) => {
  await sql`
    UPDATE connect_class_subjects SET status = 'archived' WHERE subject_allotment_id = ${allotmentId};
  `;
};

module.exports = { syncClassroomForAllotment, archiveClassroomForAllotment };
