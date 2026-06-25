const sql = require('../config/db');
const bcrypt = require('bcryptjs');

// GET /admin/users — list all users (filterable by role/class, with name/email search)
const getUsers = async (req, res) => {
  const { role, class_id, search } = req.query;

  try {
    const roleFilter = role && role !== 'all' ? sql`AND u.role = ${role}` : sql``;
    const classFilter = class_id && class_id !== 'all' ? sql`AND u.class_id = ${class_id}` : sql``;
    const searchFilter = search && search.trim() !== '' 
      ? sql`AND (u.name ILIKE ${'%' + search.trim() + '%'} OR u.email ILIKE ${'%' + search.trim() + '%'})` 
      : sql``;

    const users = await sql`
      SELECT u.id, u.name, u.email, u.role, u.class_id, u.roll_no, u.created_at, c.name AS class_name
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE 1=1 ${roleFilter} ${classFilter} ${searchFilter}
      ORDER BY u.id DESC;
    `;

    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /admin/users — create a new user (teacher or student)
const createUser = async (req, res) => {
  const { name, email, role, class_id, roll_no, password } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ message: 'Email/Username is required' });
  if (!role) return res.status(400).json({ message: 'Role is required' });

  const validRoles = ['admin', 'teacher', 'student'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role. Must be admin, teacher, or student' });
  }

  try {
    // Check if email already exists
    const existing = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email.trim()})`;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email/Username already exists' });
    }

    let plaintextPassword = '';

    // If explicit password provided, use it
    if (password && password.trim() !== '') {
      plaintextPassword = password.trim();
    } else {
      // Automatic password generation logic
      if (role === 'student') {
        if (!class_id) return res.status(400).json({ message: 'Class selection is required for students' });
        if (!roll_no) return res.status(400).json({ message: 'Roll number is required for students' });

        const [classRec] = await sql`SELECT name FROM classes WHERE id = ${class_id}`;
        if (!classRec) return res.status(400).json({ message: 'Selected class does not exist' });

        const paddedRoll = isNaN(Number(roll_no)) 
          ? String(roll_no).trim() 
          : String(Number(roll_no)).padStart(2, '0');

        plaintextPassword = `${classRec.name}${paddedRoll}`;
      } else {
        // Teacher / Admin default password
        plaintextPassword = name.trim().toLowerCase().replace(/\s+/g, '');
        if (plaintextPassword.length === 0) {
          plaintextPassword = 'edusync123'; // safety fallback
        }
      }
    }

    const passwordHash = await bcrypt.hash(plaintextPassword, 10);
    const targetClassId = role === 'student' ? class_id : null;
    const targetRollNo = role === 'student' ? String(roll_no).trim() : null;

    const [newUser] = await sql`
      INSERT INTO users (name, email, password_hash, role, class_id, roll_no, created_at)
      VALUES (${name.trim()}, ${email.trim()}, ${passwordHash}, ${role}, ${targetClassId}, ${targetRollNo}, NOW())
      RETURNING id, name, email, role, class_id, roll_no, created_at;
    `;

    // Plaintext password is NEVER saved to any database column, printed in server console logs,
    // or persisted in any shape. It is returned purely in the body of this HTTP response.
    res.status(201).json({
      message: 'User created successfully',
      user: newUser,
      generatedPassword: plaintextPassword, // Transient only
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /admin/users/:id — edit user details (non-password details)
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, class_id, roll_no } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ message: 'Email/Username is required' });

  try {
    // Check if target user exists
    const [user] = await sql`SELECT id, role FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify email/username is unique (excluding current user)
    const existing = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email.trim()}) AND id != ${id}`;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email/Username is already in use by another account' });
    }

    const targetRole = role || user.role;
    const targetClassId = targetRole === 'student' ? class_id : null;
    const targetRollNo = targetRole === 'student' ? String(roll_no).trim() : null;

    const [updatedUser] = await sql`
      UPDATE users
      SET name = ${name.trim()}, 
          email = ${email.trim()}, 
          role = ${targetRole}, 
          class_id = ${targetClassId}, 
          roll_no = ${targetRollNo}
      WHERE id = ${id}
      RETURNING id, name, email, role, class_id, roll_no, created_at;
    `;

    res.json({
      message: 'User details updated successfully',
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /admin/users/:id/reset-password — admin-triggered password reset
const resetUserPassword = async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  try {
    const [user] = await sql`SELECT id, name, email, role, class_id, roll_no FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ message: 'User not found' });

    let plaintextPassword = '';

    if (new_password && new_password.trim() !== '') {
      plaintextPassword = new_password.trim();
    } else {
      if (user.role === 'student') {
        const [classRec] = await sql`SELECT name FROM classes WHERE id = ${user.class_id}`;
        const className = classRec ? classRec.name : 'CLASS';
        const paddedRoll = isNaN(Number(user.roll_no)) 
          ? String(user.roll_no || '').trim() 
          : String(Number(user.roll_no)).padStart(2, '0');

        plaintextPassword = `${className}${paddedRoll}`;
      } else {
        plaintextPassword = user.name.toLowerCase().replace(/\s+/g, '');
        if (plaintextPassword.length === 0) {
          plaintextPassword = 'edusync123';
        }
      }
    }

    const passwordHash = await bcrypt.hash(plaintextPassword, 10);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}`;

    // Plaintext password is NEVER saved to any database column, printed in server console logs,
    // or persisted in any shape. It is returned purely in the body of this HTTP response.
    res.json({
      message: 'Password reset successful',
      generatedPassword: plaintextPassword, // Transient only
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /admin/users/:id — delete user (with safety checks to prevent orphan/cascade issues)
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const [user] = await sql`SELECT id, name, role FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Safety check for students (prevent deleting if attendance records exist)
    if (user.role === 'student') {
      const [{ count: attendanceCount }] = await sql`SELECT COUNT(*)::int FROM attendance WHERE student_id = ${id};`;
      if (attendanceCount > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete student: active or past attendance records exist for this student. Clear attendance first to avoid loss of history.' 
        });
      }
    }

    // Safety check for teachers (prevent deleting if sessions exist)
    if (user.role === 'teacher') {
      const [{ count: sessionCount }] = await sql`SELECT COUNT(*)::int FROM sessions WHERE teacher_id = ${id};`;
      if (sessionCount > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete teacher: active or past class sessions exist for this instructor. Clear session logs first to avoid loss of history.' 
        });
      }
    }

    const [deletedUser] = await sql`
      DELETE FROM users WHERE id = ${id} 
      RETURNING id, name, email, role;
    `;

    res.json({
      message: 'User deleted successfully',
      user: deletedUser,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
};
