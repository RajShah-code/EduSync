const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  getMyTimetable,
  createTimetableEntries,
  updateTimetableEntry,
  deleteTimetableEntry,
} = require('../controllers/timetableController');

// All endpoints require logged-in teacher
router.use(protect(['teacher']));

// GET /timetable/me — list logged-in teacher's entries
router.get('/me', getMyTimetable);

// POST /timetable/entries — create single entry or array of entries
router.post('/entries', createTimetableEntries);

// PUT /timetable/entries/:id — update single entry
router.put('/entries/:id', updateTimetableEntry);

// DELETE /timetable/entries/:id — delete single entry
router.delete('/entries/:id', deleteTimetableEntry);

module.exports = router;
