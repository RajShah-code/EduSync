const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  raiseDoubt,
  getSessionDoubts,
  getStudentTaskDoubts,
  resolveDoubt
} = require('../controllers/doubtsController');

router.post('/raise', protect(['student']), raiseDoubt);
router.get('/session/:session_id', protect(['teacher']), getSessionDoubts);
router.get('/student/task/:task_id', protect(['student']), getStudentTaskDoubts);
router.post('/:id/resolve', protect(['teacher']), resolveDoubt);

module.exports = router;
