const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getSessionAttendance, decideAttendance, getStudentAttendance } = require('../controllers/attendanceController');

router.get('/session/:session_id', protect(['teacher']), getSessionAttendance);
router.post('/:attendance_id/decide', protect(['teacher']), decideAttendance);
router.get('/student/:student_id', protect(['student']), getStudentAttendance);

module.exports = router;
