const sql = require('../../config/db');

// resolveClassroomAccess — shared by both the REST endpoints and the
// Socket.io handlers (single source of truth, per the spec, so the two
// paths can never drift apart).
//
// A user may READ/enter a classroom (class_subject_id) if either:
//   - they are the teacher on that connect_class_subjects row, or
//   - they are a student whose users.class_id matches that row's class_id
//     (same lookup myClassroomsController.getStudentClassrooms uses).
//
// Returns { classroom, isTeacher, isStudent } on success, or null if the
// classroom doesn't exist or this user has no relationship to it.
async function resolveClassroomAccess(userId, role, classSubjectId) {
  const [classroom] = await sql`
    SELECT id, teacher_id, class_id, subject_name, posting_mode, status
    FROM connect_class_subjects
    WHERE id = ${classSubjectId}
  `;
  if (!classroom) return null;

  if (role === 'teacher' && classroom.teacher_id === userId) {
    return { classroom, isTeacher: true, isStudent: false };
  }

  if (role === 'student') {
    const [student] = await sql`SELECT class_id FROM users WHERE id = ${userId}`;
    if (student && student.class_id === classroom.class_id) {
      return { classroom, isTeacher: false, isStudent: true };
    }
  }

  return null;
}

// canSendMessage — only the teacher who owns the classroom can ever send.
// "Open discussion" mode was removed by product decision: students read
// and vote in polls, never post. Assumes `access` already came back
// non-null from resolveClassroomAccess (i.e. read access is established).
function canSendMessage(access) {
  if (!access) return false;
  if (access.classroom.status === 'archived') return false;
  return access.isTeacher;
}

// isClassroomArchived — the one shared check every other write path
// (announcements/polls/assignments/materials) layers on top of its own
// isTeacher/access gate. An archived classroom is read-only: history stays
// visible, but nothing new can be posted into it.
function isClassroomArchived(access) {
  return !!access && access.classroom.status === 'archived';
}

module.exports = { resolveClassroomAccess, canSendMessage, isClassroomArchived };
