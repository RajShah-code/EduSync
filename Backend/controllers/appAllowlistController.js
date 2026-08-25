const sql = require('../config/db');

// GET /app-allowlist/class/:classId — any authenticated role. A student's
// Electron/web client reads this at broadcast-session join time to know
// what's allowed to be running; the teacher-facing admin UI also uses it.
const getClassAllowlist = async (req, res) => {
  const { classId } = req.params;
  try {
    const entries = await sql`
      SELECT id, class_id, process_name, display_name, created_at
      FROM app_allowlist_entries
      WHERE class_id = ${classId}
      ORDER BY process_name ASC;
    `;
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /admin/app-allowlist — admin lists every entry across every class,
// joined with the class name. Optional class_id filter.
const listAllAllowlist = async (req, res) => {
  const { class_id } = req.query;
  try {
    const classFilter = class_id && class_id !== 'all' ? sql`AND a.class_id = ${class_id}` : sql``;
    const entries = await sql`
      SELECT a.id, a.class_id, c.name AS class_name, a.process_name, a.display_name, a.created_at
      FROM app_allowlist_entries a
      JOIN classes c ON c.id = a.class_id
      WHERE 1=1 ${classFilter}
      ORDER BY c.name ASC, a.process_name ASC;
    `;
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /admin/app-allowlist — admin adds one allowed process to a class.
const createEntry = async (req, res) => {
  const { class_id, process_name, display_name } = req.body;

  if (!class_id || !Number.isInteger(Number(class_id))) {
    return res.status(400).json({ message: 'class_id is required and must be an integer' });
  }
  if (!process_name || !process_name.trim()) {
    return res.status(400).json({ message: 'process_name is required (e.g. "chrome.exe")' });
  }

  try {
    const [cls] = await sql`SELECT id FROM classes WHERE id = ${class_id}`;
    if (!cls) return res.status(400).json({ message: 'class_id does not refer to a valid class' });

    const [created] = await sql`
      INSERT INTO app_allowlist_entries (class_id, process_name, display_name)
      VALUES (${class_id}, ${process_name.trim()}, ${display_name && display_name.trim() ? display_name.trim() : null})
      RETURNING id, class_id, process_name, display_name, created_at;
    `;
    res.status(201).json({ entry: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This process is already allow-listed for this class' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /admin/app-allowlist/:id
const deleteEntry = async (req, res) => {
  const { id } = req.params;
  try {
    const [deleted] = await sql`DELETE FROM app_allowlist_entries WHERE id = ${id} RETURNING id`;
    if (!deleted) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Entry deleted', id: deleted.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getClassAllowlist, listAllAllowlist, createEntry, deleteEntry };
