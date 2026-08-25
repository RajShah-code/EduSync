const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getSubjects, createSubject, updateSubject, deleteSubject } = require('../controllers/subjectsController');

// All endpoints in this router are already mounted on /subjects
// GET /subjects is accessible by any logged-in user
router.get('/', getSubjects);

// Admin-only endpoints
router.post('/', protect(['admin']), createSubject);
router.put('/:id', protect(['admin']), updateSubject);
router.delete('/:id', protect(['admin']), deleteSubject);

module.exports = router;
