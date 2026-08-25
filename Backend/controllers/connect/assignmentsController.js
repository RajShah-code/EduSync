const sql = require('../../config/db');
const { resolveClassroomAccess, isClassroomArchived } = require('./connectAccessControl');
const { checkUploadRateLimit, decodeBase64File, uploadBufferToB2, getPresignedUrlForKey } = require('./connectB2Upload');

function extFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const m = filename.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0] : '';
}

// POST /connect/classrooms/:classSubjectId/assignments — teacher-only,
// and only the teacher who owns THAT classroom. Optional attachment
// (base64 in body, mirroring filesRoutes.js's upload flow).
const createAssignment = async (req, res) => {
  const { classSubjectId } = req.params;
  const { title, description, due_at, attachment_data, attachment_filename, attachment_content_type } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'title is required' });
  }

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access || !access.isTeacher) {
      return res.status(403).json({ message: 'Only the teacher of this classroom can create an assignment' });
    }
    if (isClassroomArchived(access)) {
      return res.status(403).json({ message: 'This classroom has been archived and is read-only' });
    }

    let attachmentKey = null;
    if (attachment_data) {
      const limit = checkUploadRateLimit(userId);
      if (!limit.allowed) {
        return res.status(429).json({ message: 'Rate limit exceeded. Maximum 5 uploads allowed per hour. Please try again later.' });
      }
      let buffer;
      try {
        buffer = decodeBase64File(attachment_data);
      } catch (e) {
        return res.status(e.status || 500).json({ message: e.message || 'Upload failed' });
      }
      const key = `connect-assignments/${classSubjectId}/attachment-${userId}-${Date.now()}${extFromFilename(attachment_filename)}`;
      await uploadBufferToB2(buffer, key, attachment_content_type);
      attachmentKey = key;
      limit.record();
    }

    const [assignment] = await sql`
      INSERT INTO connect_assignments (class_subject_id, creator_id, title, description, attachment_url, due_at)
      VALUES (${classSubjectId}, ${userId}, ${title.trim()}, ${description || null}, ${attachmentKey}, ${due_at || null})
      RETURNING id, class_subject_id, creator_id, title, description, attachment_url, due_at, created_at;
    `;

    res.status(201).json({
      assignment: { ...assignment, attachment_url: await getPresignedUrlForKey(assignment.attachment_url) },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error', error: err.message });
  }
};

// GET /connect/classrooms/:classSubjectId/assignments — any user with
// access. For a student, includes their own submission status inline
// (not_submitted / submitted / late / graded) plus their full submission,
// so the frontend never needs a second call per assignment.
const listClassroomAssignments = async (req, res) => {
  const { classSubjectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const assignments = await sql`
      SELECT id, class_subject_id, creator_id, title, description, attachment_url, due_at, created_at
      FROM connect_assignments
      WHERE class_subject_id = ${classSubjectId}
      ORDER BY created_at DESC;
    `;

    const out = [];
    for (const a of assignments) {
      const attachmentUrl = await getPresignedUrlForKey(a.attachment_url);
      const base = { ...a, attachment_url: attachmentUrl };

      if (role === 'student') {
        const [submission] = await sql`
          SELECT id, text_content, file_url, submitted_at, is_late, grade, feedback, graded_at
          FROM connect_submissions WHERE assignment_id = ${a.id} AND student_id = ${userId}
        `;
        let status = 'not_submitted';
        let mySubmission = null;
        if (submission) {
          status = submission.grade !== null ? 'graded' : submission.is_late ? 'late' : 'submitted';
          mySubmission = { ...submission, file_url: await getPresignedUrlForKey(submission.file_url) };
        }
        out.push({ ...base, submission_status: status, my_submission: mySubmission });
      } else {
        const [{ count }] = await sql`
          SELECT COUNT(*)::int AS count FROM connect_submissions WHERE assignment_id = ${a.id}
        `;
        out.push({ ...base, submission_count: count });
      }
    }

    res.json({ assignments: out });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /connect/assignments/:assignmentId/submit — student-only. text
// and/or file. Resubmission UPDATEs the same row (ON CONFLICT on the DB's
// UNIQUE(assignment_id, student_id)) — never a second row — and resets any
// prior grade/feedback, since a changed submission should be re-graded.
const submitAssignment = async (req, res) => {
  const { assignmentId } = req.params;
  const { text_content, file_data, file_filename, file_content_type } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if ((!text_content || !text_content.trim()) && !file_data) {
    return res.status(400).json({ message: 'Provide text_content and/or a file' });
  }

  try {
    const [assignment] = await sql`SELECT id, class_subject_id, due_at FROM connect_assignments WHERE id = ${assignmentId}`;
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    const access = await resolveClassroomAccess(userId, role, assignment.class_subject_id);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }
    if (isClassroomArchived(access)) {
      return res.status(403).json({ message: 'This classroom has been archived and is read-only' });
    }

    let fileKey = null;
    if (file_data) {
      const limit = checkUploadRateLimit(userId);
      if (!limit.allowed) {
        return res.status(429).json({ message: 'Rate limit exceeded. Maximum 5 uploads allowed per hour. Please try again later.' });
      }
      let buffer;
      try {
        buffer = decodeBase64File(file_data);
      } catch (e) {
        return res.status(e.status || 500).json({ message: e.message || 'Upload failed' });
      }
      const key = `connect-assignments/submissions/${assignmentId}/${userId}-${Date.now()}${extFromFilename(file_filename)}`;
      await uploadBufferToB2(buffer, key, file_content_type);
      fileKey = key;
      limit.record();
    }

    const isLate = !!(assignment.due_at && new Date(assignment.due_at) < new Date());

    const [submission] = await sql`
      INSERT INTO connect_submissions (assignment_id, student_id, text_content, file_url, is_late)
      VALUES (${assignmentId}, ${userId}, ${text_content ? text_content.trim() : null}, ${fileKey}, ${isLate})
      ON CONFLICT (assignment_id, student_id) DO UPDATE SET
        text_content = EXCLUDED.text_content,
        file_url = EXCLUDED.file_url,
        submitted_at = NOW(),
        is_late = EXCLUDED.is_late,
        grade = NULL,
        feedback = NULL,
        graded_at = NULL,
        graded_by = NULL
      RETURNING id, assignment_id, student_id, text_content, file_url, submitted_at, is_late, grade, feedback, graded_at;
    `;

    res.status(201).json({ submission: { ...submission, file_url: await getPresignedUrlForKey(submission.file_url) } });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error', error: err.message });
  }
};

// GET /connect/assignments/:assignmentId/submissions — teacher-only, and
// only for an assignment THEY created (own the parent assignment, checked
// directly via creator_id — not just "teaches that classroom now", in case
// of a later admin reassignment).
const listSubmissions = async (req, res) => {
  const { assignmentId } = req.params;
  const userId = req.user.id;

  try {
    const [assignment] = await sql`SELECT id, creator_id FROM connect_assignments WHERE id = ${assignmentId}`;
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.creator_id !== userId) {
      return res.status(403).json({ message: 'You do not own this assignment' });
    }

    const rows = await sql`
      SELECT s.id, s.assignment_id, s.student_id, u.name AS student_name, s.text_content, s.file_url,
        s.submitted_at, s.is_late, s.grade, s.feedback, s.graded_at
      FROM connect_submissions s
      JOIN users u ON u.id = s.student_id
      WHERE s.assignment_id = ${assignmentId}
      ORDER BY s.submitted_at DESC;
    `;

    const submissions = [];
    for (const r of rows) {
      submissions.push({ ...r, file_url: await getPresignedUrlForKey(r.file_url) });
    }

    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /connect/submissions/:submissionId/grade — teacher-only, must own
// the parent assignment (creator_id check, same as listSubmissions).
const gradeSubmission = async (req, res) => {
  const { submissionId } = req.params;
  const { grade, feedback } = req.body;
  const userId = req.user.id;

  if (grade === undefined || grade === null || Number.isNaN(Number(grade))) {
    return res.status(400).json({ message: 'grade is required and must be a number' });
  }

  try {
    const [row] = await sql`
      SELECT s.id, s.assignment_id, a.creator_id
      FROM connect_submissions s
      JOIN connect_assignments a ON a.id = s.assignment_id
      WHERE s.id = ${submissionId}
    `;
    if (!row) return res.status(404).json({ message: 'Submission not found' });
    if (row.creator_id !== userId) {
      return res.status(403).json({ message: 'You do not own this assignment' });
    }

    const [updated] = await sql`
      UPDATE connect_submissions
      SET grade = ${grade}, feedback = ${feedback || null}, graded_at = NOW(), graded_by = ${userId}
      WHERE id = ${submissionId}
      RETURNING id, assignment_id, student_id, text_content, file_url, submitted_at, is_late, grade, feedback, graded_at, graded_by;
    `;

    res.json({ submission: { ...updated, file_url: await getPresignedUrlForKey(updated.file_url) } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createAssignment, listClassroomAssignments, submitAssignment, listSubmissions, gradeSubmission };
