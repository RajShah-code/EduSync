const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getClasses, createClass, updateClass } = require('../controllers/classesController');

// All endpoints in this router are already mounted on /classes
// GET /classes is accessible by any logged-in user
router.get('/', getClasses);

// Admin-only endpoints
router.post('/', protect(['admin']), createClass);
router.put('/:id', protect(['admin']), updateClass);

module.exports = router;
