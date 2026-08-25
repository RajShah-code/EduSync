const sql = require('../config/db');

// GET /subjects — list all subjects (any authenticated user can read)
const getSubjects = async (req, res) => {
  try {
    const subjects = await sql`
      SELECT id, name, code, created_at
      FROM subjects
      ORDER BY name ASC;
    `;
    res.json({ subjects });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /subjects — create a new subject (admin only)
const createSubject = async (req, res) => {
  const { name, code } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Subject name is required' });
  }

  try {
    const existing = await sql`
      SELECT id FROM subjects WHERE LOWER(name) = LOWER(${name.trim()});
    `;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A subject with this name already exists' });
    }

    const targetCode = code && code.trim() ? code.trim() : null;
    const [newSubject] = await sql`
      INSERT INTO subjects (name, code)
      VALUES (${name.trim()}, ${targetCode})
      RETURNING id, name, code, created_at;
    `;
    res.status(201).json({ subject: newSubject });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /subjects/:id — edit subject name/code (admin only)
const updateSubject = async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Subject name is required' });
  }

  try {
    const existing = await sql`
      SELECT id FROM subjects WHERE LOWER(name) = LOWER(${name.trim()}) AND id != ${id};
    `;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Another subject with this name already exists' });
    }

    const targetCode = code && code.trim() ? code.trim() : null;
    const [updatedSubject] = await sql`
      UPDATE subjects
      SET name = ${name.trim()}, code = ${targetCode}
      WHERE id = ${id}
      RETURNING id, name, code, created_at;
    `;

    if (!updatedSubject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json({ subject: updatedSubject });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /subjects/:id — delete a subject (admin only, blocked if still allotted)
const deleteSubject = async (req, res) => {
  const { id } = req.params;

  try {
    const [subject] = await sql`SELECT id, name FROM subjects WHERE id = ${id}`;
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    const [{ count: allotmentCount }] = await sql`
      SELECT COUNT(*)::int FROM subject_allotments WHERE subject_id = ${id};
    `;
    if (allotmentCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete subject: it is still allotted to one or more classes. Remove those allotments first.',
      });
    }

    const [deletedSubject] = await sql`
      DELETE FROM subjects WHERE id = ${id}
      RETURNING id, name;
    `;
    res.json({ message: 'Subject deleted successfully', subject: deletedSubject });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
