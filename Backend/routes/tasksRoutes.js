const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  createTask,
  submitTask,
  autosaveTask,
  getSessionTasks,
  getTaskProgress,
  getTaskSubmissions,
  scoreSubmission,
  extendTask,
  moveOnTask
} = require('../controllers/tasksController');

router.post('/create', protect(['teacher']), createTask);
router.post('/:id/submit', protect(['student']), submitTask);
router.post('/:id/autosave', protect(['student']), autosaveTask);
router.get('/session/:session_id', protect(), getSessionTasks);
router.get('/:id/progress', protect(['teacher']), getTaskProgress);
router.get('/submissions/task/:id', protect(['teacher']), getTaskSubmissions);
router.put('/submissions/:id/score', protect(['teacher']), scoreSubmission);
router.post('/:id/extend', protect(['teacher']), extendTask);
router.post('/:id/move_on', protect(['teacher']), moveOnTask);

module.exports = router;
