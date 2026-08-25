const express = require('express');
const router = express.Router();
const protect = require('../../middleware/authMiddleware');
const {
  createClassSubject,
  listClassSubjects,
  updateClassSubject,
  deleteClassSubject,
  updateOwnPostingMode,
} = require('../../controllers/connect/classSubjectsController');
const {
  getTeacherClassrooms,
  getStudentClassrooms,
} = require('../../controllers/connect/myClassroomsController');
const { getMessages, sendMessage } = require('../../controllers/connect/messagesController');
const {
  createAnnouncement,
  getClassroomAnnouncements,
  getAdminAnnouncements,
} = require('../../controllers/connect/announcementsController');
const { createPoll, listPolls, voteOnPoll, getPollResults } = require('../../controllers/connect/pollsController');
const {
  createAssignment,
  listClassroomAssignments,
  submitAssignment,
  listSubmissions,
  gradeSubmission,
} = require('../../controllers/connect/assignmentsController');
const {
  createMaterial,
  listMaterials,
  getDownloadLink,
  deleteMaterial,
} = require('../../controllers/connect/materialsController');
const { markSeen, getUnreadSummary } = require('../../controllers/connect/notificationsController');

// ── Admin: class-subject allotment management ──────────────────────────────
router.post('/admin/class-subjects', protect(['admin']), createClassSubject);
router.get('/admin/class-subjects', protect(['admin']), listClassSubjects);
router.put('/admin/class-subjects/:id', protect(['admin']), updateClassSubject);
router.delete('/admin/class-subjects/:id', protect(['admin']), deleteClassSubject);

// ── Teacher / Student: "my classrooms" read endpoints ───────────────────────
router.get('/teacher/my-classrooms', protect(['teacher']), getTeacherClassrooms);
router.get('/student/my-classrooms', protect(['student']), getStudentClassrooms);

// ── Classroom messaging — access is checked per-classroom inside the
// controller (resolveClassroomAccess), not by role here, since either a
// teacher or a student can have access depending on the specific room. ──
router.get('/classrooms/:classSubjectId/messages', protect(), getMessages);
router.post('/classrooms/:classSubjectId/messages', protect(), sendMessage);

// ── Announcements — POST is role-branched inside the controller (teacher
// vs admin rules); the classroom feed GET is access-checked per-classroom
// like messages above; the admin history GET is admin-only. ──────────────
router.post('/announcements', protect(['teacher', 'admin']), createAnnouncement);
router.get('/classrooms/:classSubjectId/announcements', protect(), getClassroomAnnouncements);
router.get('/admin/announcements', protect(['admin']), getAdminAnnouncements);

// ── Teacher: toggle their own classroom's posting_mode ──────────────────
router.patch('/teacher/classrooms/:classSubjectId/posting-mode', protect(['teacher']), updateOwnPostingMode);

// ── Polls — creation is teacher-of-that-classroom-only (checked inside the
// controller via resolveClassroomAccess.isTeacher); list/vote/results are
// access-checked per-classroom like messages/announcements above. ────────
router.post('/classrooms/:classSubjectId/polls', protect(['teacher']), createPoll);
router.get('/classrooms/:classSubjectId/polls', protect(), listPolls);
router.post('/polls/:pollId/vote', protect(), voteOnPoll);
router.get('/polls/:pollId/results', protect(), getPollResults);

// ── Assignments — creation is teacher-of-that-classroom-only; the
// classroom list is access-checked per-classroom (student view includes
// submission status inline); submit is student-only; submissions/grading
// are teacher-only, ownership re-checked against the assignment's own
// creator_id inside the controller. ──────────────────────────────────────
router.post('/classrooms/:classSubjectId/assignments', protect(['teacher']), createAssignment);
router.get('/classrooms/:classSubjectId/assignments', protect(), listClassroomAssignments);
router.post('/assignments/:assignmentId/submit', protect(['student']), submitAssignment);
router.get('/assignments/:assignmentId/submissions', protect(['teacher']), listSubmissions);
router.put('/submissions/:submissionId/grade', protect(['teacher']), gradeSubmission);

// ── Study materials — upload/delete are teacher-of-that-classroom-only;
// list is access-checked per-classroom (metadata only, no baked link);
// download link is generated fresh on-demand, access-checked the same way. ─
router.post('/classrooms/:classSubjectId/materials', protect(['teacher']), createMaterial);
router.get('/classrooms/:classSubjectId/materials', protect(), listMaterials);
router.get('/materials/:id/download', protect(), getDownloadLink);
router.delete('/materials/:id', protect(['teacher']), deleteMaterial);

// ── Notifications — lightweight last-seen model, not per-item read
// receipts. mark-seen is access-checked per-classroom like other reads
// above; unread-summary is batched (no N+1) across the caller's own
// classrooms, role-branched inside the controller. ────────────────────────
router.post('/classrooms/:classSubjectId/mark-seen', protect(), markSeen);
router.get('/unread-summary', protect(), getUnreadSummary);

module.exports = router;
