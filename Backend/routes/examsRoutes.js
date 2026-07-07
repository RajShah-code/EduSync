const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  createExam,
  addQuestion,
  startExam,
  getMyQuestions,
  submitExam,
  recordViolation,
  getExamResults,
  getExamById,
  endExam,
  scoreAnswer,
  getSessionExams,
} = require('../controllers/examsController');

// Teacher routes
router.post('/create', protect(['teacher']), createExam);
router.get('/session/:sessionId', protect(['teacher']), getSessionExams);
router.get('/:id', protect(['teacher']), getExamById);
router.post('/:id/sets/:setNumber/questions', protect(['teacher']), addQuestion);
router.post('/:id/start', protect(['teacher']), startExam);
router.post('/:id/end', protect(['teacher']), endExam);
router.get('/:id/results', protect(['teacher']), getExamResults);
router.post('/:id/answers/:answerId/score', protect(['teacher']), scoreAnswer);

// Student routes
router.get('/:id/my-questions', protect(['student']), getMyQuestions);
router.post('/:id/submit', protect(['student']), submitExam);
router.post('/:id/violation', protect(['student']), recordViolation);

module.exports = router;
