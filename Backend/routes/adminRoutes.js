const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} = require('../controllers/adminController');

// All endpoints registered here are prefix-guarded by /admin and restrict to 'admin' role
// GET /admin/users
router.get('/users', getUsers);

// POST /admin/users
router.post('/users', createUser);

// PUT /admin/users/:id
router.put('/users/:id', updateUser);

// POST /admin/users/:id/reset-password
router.post('/users/:id/reset-password', resetUserPassword);

// DELETE /admin/users/:id
router.delete('/users/:id', deleteUser);

module.exports = router;
