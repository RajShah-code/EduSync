const express = require('express');
const router = express.Router();
const { getClassAllowlist } = require('../controllers/appAllowlistController');

// Mounted on /app-allowlist. Any authenticated role can read a class's
// allow-list (a student's own Electron/web client needs this at session
// join time) — admin CRUD lives under /admin/app-allowlist instead.
router.get('/class/:classId', getClassAllowlist);

module.exports = router;
