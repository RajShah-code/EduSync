const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const {
  getUsers,
  createUser,
  bulkImportUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
} = require('../controllers/adminController');

const {
  listAllotments,
  createAllotment,
  updateAllotment,
  deleteAllotment,
} = require('../controllers/subjectAllotmentsController');

const {
  listAllAllowlist,
  createEntry,
  deleteEntry,
} = require('../controllers/appAllowlistController');

// All endpoints registered here are prefix-guarded by /admin and restrict to 'admin' role
// GET /admin/users
router.get('/users', getUsers);

// POST /admin/users
router.post('/users', createUser);

// POST /admin/users/bulk-import
router.post('/users/bulk-import', upload.single('file'), bulkImportUsers);

// PUT /admin/users/:id
router.put('/users/:id', updateUser);

// POST /admin/users/:id/reset-password
router.post('/users/:id/reset-password', resetUserPassword);

// DELETE /admin/users/:id
router.delete('/users/:id', deleteUser);

// GET /admin/subject-allotments
router.get('/subject-allotments', listAllotments);

// POST /admin/subject-allotments
router.post('/subject-allotments', createAllotment);

// PUT /admin/subject-allotments/:id
router.put('/subject-allotments/:id', updateAllotment);

// DELETE /admin/subject-allotments/:id
router.delete('/subject-allotments/:id', deleteAllotment);

// GET /admin/app-allowlist
router.get('/app-allowlist', listAllAllowlist);

// POST /admin/app-allowlist
router.post('/app-allowlist', createEntry);

// DELETE /admin/app-allowlist/:id
router.delete('/app-allowlist/:id', deleteEntry);

module.exports = router;
