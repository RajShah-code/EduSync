const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { startSession, endSession, getActiveSessions, getMyActiveSession, joinSession, kickStudent, getMySessions, getSessionStudents } = require('../controllers/sessionsController');

router.post('/start', protect(['teacher']), startSession);
router.post('/end', protect(['teacher']), endSession);
router.get('/active', protect(['student']), getActiveSessions);
router.get('/my-active', protect(['teacher']), getMyActiveSession);
router.get('/my-sessions', protect(['teacher']), getMySessions);
router.get('/:session_id/students', protect(['teacher']), getSessionStudents);
router.post('/join', protect(['student']), joinSession);
router.post('/kick', protect(['teacher']), kickStudent);

module.exports = router;

