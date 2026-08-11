const express = require('express');
const router = express.Router();
const { login, windowsLogin } = require('../controllers/authController');

router.post('/login', login);
router.post('/windows-login', windowsLogin);

module.exports = router;