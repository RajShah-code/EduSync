const express = require('express');
const router = express.Router();
const { getClassAnalytics } = require('../controllers/analyticsController');

router.get('/class/:class_id', getClassAnalytics);

module.exports = router;
