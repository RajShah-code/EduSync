const sql = require('../config/db');

// GET /classes — list all classes (any authenticated user can read)
const getClasses = async (req, res) => {
  try {
    const classes = await sql`
      SELECT id, name, created_at 
      FROM classes 
      ORDER BY name ASC;
    `;
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /classes — create a new class (admin only)
const createClass = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Class name is required' });
  }

  try {
    const existing = await sql`
      SELECT id FROM classes WHERE LOWER(name) = LOWER(${name.trim()});
    `;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Class already exists' });
    }

    const [newClass] = await sql`
      INSERT INTO classes (name) 
      VALUES (${name.trim()}) 
      RETURNING id, name, created_at;
    `;
    res.status(201).json({ class: newClass });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /classes/:id — edit class name (admin only)
const updateClass = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Class name is required' });
  }

  try {
    const existing = await sql`
      SELECT id FROM classes WHERE LOWER(name) = LOWER(${name.trim()}) AND id != ${id};
    `;
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Another class with this name already exists' });
    }

    const [updatedClass] = await sql`
      UPDATE classes 
      SET name = ${name.trim()} 
      WHERE id = ${id} 
      RETURNING id, name, created_at;
    `;

    if (!updatedClass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json({ class: updatedClass });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getClasses,
  createClass,
  updateClass,
};
