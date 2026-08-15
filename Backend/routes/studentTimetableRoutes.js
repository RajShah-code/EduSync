const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getStudentTimetable } = require('../controllers/studentTimetableController');

// All endpoints require logged-in student
router.use(protect(['student']));

// GET /student-timetable/schedule — list student's class timetable entries
router.get('/schedule', getStudentTimetable);

module.exports = router;
