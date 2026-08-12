const express = require('express');
const router = express.Router();
const multer = require('multer');
const protect = require('../middleware/authMiddleware');
const {
  getMyTimetable,
  updateTimetableSettings,
  createTimetableEntries,
  updateTimetableEntry,
  deleteTimetableEntry,
  downloadTimetableTemplate,
  importTimetable,
  getTimetableExceptions,
  createTimetableException,
  deleteTimetableException,
} = require('../controllers/timetableController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// All endpoints require logged-in teacher
router.use(protect(['teacher']));

// GET /timetable/me — list logged-in teacher's entries & settings
router.get('/me', getMyTimetable);

// PUT /timetable/settings — update teacher's global reminder delay setting
router.put('/settings', updateTimetableSettings);

// GET /timetable/template — download Excel template
router.get('/template', downloadTimetableTemplate);

// POST /timetable/import — bulk import timetable entries via Excel upload
router.post('/import', upload.single('file'), importTimetable);

// Timetable Exceptions (Reminder Suppression Dates)
router.get('/exceptions', getTimetableExceptions);
router.post('/exceptions', createTimetableException);
router.delete('/exceptions/:id', deleteTimetableException);

// POST /timetable/entries — create single entry or array of entries
router.post('/entries', createTimetableEntries);

// PUT /timetable/entries/:id — update single entry
router.put('/entries/:id', updateTimetableEntry);

// DELETE /timetable/entries/:id — delete single entry
router.delete('/entries/:id', deleteTimetableEntry);

module.exports = router;
