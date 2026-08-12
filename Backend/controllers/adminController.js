const sql = require('../config/db');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

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
  const { name, email, role, class_id, roll_no, password, windows_username } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ message: 'Email is required' });
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email.trim())) {
    return res.status(400).json({ message: 'Please enter a valid email address (e.g. name@domain.com)' });
  }
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
    const targetWindowsUser = windows_username && windows_username.trim() !== '' ? windows_username.trim() : null;

    const [newUser] = await sql`
      INSERT INTO users (name, email, password_hash, role, class_id, roll_no, windows_username, created_at)
      VALUES (${name.trim()}, ${email.trim()}, ${passwordHash}, ${role}, ${targetClassId}, ${targetRollNo}, ${targetWindowsUser}, NOW())
      RETURNING id, name, email, role, class_id, roll_no, windows_username, created_at;
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
  if (!email || !email.trim()) return res.status(400).json({ message: 'Email is required' });
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email.trim())) {
    return res.status(400).json({ message: 'Please enter a valid email address (e.g. name@domain.com)' });
  }

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

// Bulk Import Users via Excel upload (.xlsx)
const bulkImportUsers = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'Excel file (.xlsx) is required' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ message: 'Uploaded Excel file contains no data rows' });
    }

    const seenEmailsInBatch = new Set();
    const results = [];
    const validRoles = ['admin', 'teacher', 'student'];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // Row 1 is header row in Excel
      const rawRow = rawRows[i];

      // Normalize row keys to lowercase trimmed strings
      const row = {};
      Object.keys(rawRow).forEach((key) => {
        const cleanKey = key.trim().toLowerCase();
        row[cleanKey] = String(rawRow[key]).trim();
      });

      const name = row.name || '';
      const email = row.email || '';
      const role = (row.role || '').toLowerCase();
      const className = row.class || '';
      const rollNo = row.roll_no || '';
      const windowsUsername = row.windows_username || '';
      const password = row.password || '';

      // Skip completely empty rows
      if (!name && !email && !role && !className && !rollNo && !windowsUsername && !password) {
        continue;
      }

      // 1. Validate required fields
      if (!name) {
        results.push({ row: rowNum, status: 'failed', email: email || null, reason: 'Name is required' });
        continue;
      }
      if (!email) {
        results.push({ row: rowNum, status: 'failed', email: null, reason: 'Email is required' });
        continue;
      }
      if (!emailPattern.test(email)) {
        results.push({ row: rowNum, status: 'failed', email, reason: 'Please enter a valid email address (e.g. name@domain.com)' });
        continue;
      }
      if (!role) {
        results.push({ row: rowNum, status: 'failed', email, reason: 'Role is required' });
        continue;
      }
      if (!validRoles.includes(role)) {
        results.push({ row: rowNum, status: 'failed', email, reason: 'Invalid role. Must be admin, teacher, or student' });
        continue;
      }

      // 2. Check for duplicate email within the same file batch
      const emailLower = email.toLowerCase();
      if (seenEmailsInBatch.has(emailLower)) {
        results.push({ row: rowNum, status: 'failed', email, reason: 'Duplicate email in file' });
        continue;
      }

      // 3. Check for duplicate email in database
      const existingDb = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email})`;
      if (existingDb.length > 0) {
        results.push({ row: rowNum, status: 'failed', email, reason: 'Email/Username already exists' });
        continue;
      }

      // 4. Role-specific validation & Class lookup
      let targetClassId = null;
      let targetRollNo = null;
      let classRec = null;

      if (role === 'student') {
        if (!className) {
          results.push({ row: rowNum, status: 'failed', email, reason: 'Class selection is required for students' });
          continue;
        }
        if (!rollNo) {
          results.push({ row: rowNum, status: 'failed', email, reason: 'Roll number is required for students' });
          continue;
        }

        const [cls] = await sql`SELECT id, name FROM classes WHERE LOWER(name) = LOWER(${className})`;
        if (!cls) {
          results.push({ row: rowNum, status: 'failed', email, reason: 'Selected class does not exist' });
          continue;
        }
        targetClassId = cls.id;
        targetRollNo = rollNo;
        classRec = cls;
      }

      // 5. Password generation logic (reusing exact createUser logic)
      let plaintextPassword = '';
      if (password && password !== '') {
        plaintextPassword = password;
      } else {
        if (role === 'student') {
          const paddedRoll = isNaN(Number(rollNo)) 
            ? String(rollNo).trim() 
            : String(Number(rollNo)).padStart(2, '0');
          plaintextPassword = `${classRec.name}${paddedRoll}`;
        } else {
          plaintextPassword = name.toLowerCase().replace(/\s+/g, '');
          if (plaintextPassword.length === 0) {
            plaintextPassword = 'edusync123';
          }
        }
      }

      // 6. Insert new user into database
      try {
        const passwordHash = await bcrypt.hash(plaintextPassword, 10);
        const targetWindowsUser = windowsUsername !== '' ? windowsUsername : null;

        await sql`
          INSERT INTO users (name, email, password_hash, role, class_id, roll_no, windows_username, created_at)
          VALUES (${name}, ${email}, ${passwordHash}, ${role}, ${targetClassId}, ${targetRollNo}, ${targetWindowsUser}, NOW())
        `;

        seenEmailsInBatch.add(emailLower);
        results.push({ row: rowNum, status: 'created', email });
      } catch (err) {
        results.push({ row: rowNum, status: 'failed', email, reason: err.message || 'Database error during insertion' });
      }
    }

    res.json({ message: 'Bulk import complete', results });
  } catch (err) {
    res.status(500).json({ message: 'Failed to process Excel file', error: err.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  bulkImportUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
};
