const express = require('express');
const router = express.Router();
const { getMe, updateName, changePassword } = require('../controllers/usersController');

router.get('/me', getMe);
router.put('/me', updateName);
router.put('/me/password', changePassword);

module.exports = router;
