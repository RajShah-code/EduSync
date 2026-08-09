const sql = require('../config/db');

/**
 * Validates a single timetable entry object.
 * Returns an error string if invalid, or null if valid.
 */
function validateEntry(entry) {
  const { day_of_week, start_time, end_time, subject, class_id, reminder_enabled, reminder_delay_minutes } = entry;

  if (day_of_week === undefined || day_of_week === null || !Number.isInteger(Number(day_of_week)) || day_of_week < 0 || day_of_week > 6) {
    return 'Invalid day_of_week (must be an integer 0-6)';
  }

  if (!start_time || typeof start_time !== 'string' || !start_time.trim()) {
    return 'start_time is required';
  }

  if (!end_time || typeof end_time !== 'string' || !end_time.trim()) {
    return 'end_time is required';
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return 'subject is required';
  }

  if (!class_id || !Number.isInteger(Number(class_id))) {
    return 'class_id is required and must be an integer';
  }

  const isReminderOn = Boolean(reminder_enabled);
  if (isReminderOn) {
    const delayNum = Number(reminder_delay_minutes);
    if (reminder_delay_minutes === undefined || reminder_delay_minutes === null || isNaN(delayNum) || delayNum <= 0) {
      return 'reminder_delay_minutes is required and must be greater than 0 when reminder_enabled is true';
    }
  }

  return null;
}

// GET /timetable/me — list teacher's full timetable ordered by day and start time
const getMyTimetable = async (req, res) => {
  const teacherId = req.user.id;

  try {
    const entries = await sql`
      SELECT 
        t.id,
        t.teacher_id,
        t.day_of_week,
        t.start_time,
        t.end_time,
        t.subject,
        t.class_id,
        c.name AS class_name,
        t.reminder_enabled,
        t.reminder_delay_minutes,
        t.created_at,
        t.updated_at
      FROM timetable_entries t
      JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = ${teacherId}
      ORDER BY t.day_of_week ASC, t.start_time ASC;
    `;

    res.json({ entries });
  } catch (err) {
    console.error('[Timetable Controller] GET /me error:', err);
    res.status(500).json({ message: 'Server error fetching timetable', error: err.message });
  }
};

// POST /timetable/entries — create single entry or bulk insert array of entries
const createTimetableEntries = async (req, res) => {
  const teacherId = req.user.id;
  const payload = req.body;

  try {
    const isArray = Array.isArray(payload);
    const rawEntries = isArray ? payload : [payload];

    if (rawEntries.length === 0) {
      return res.status(400).json({ message: 'No timetable entries provided' });
    }

    // Validate all entries before insertion
    for (let i = 0; i < rawEntries.length; i++) {
      const errMessage = validateEntry(rawEntries[i]);
      if (errMessage) {
        return res.status(400).json({ 
          message: `Validation failed for entry ${i + 1}: ${errMessage}` 
        });
      }
    }

    const created = [];

    for (const item of rawEntries) {
      const {
        day_of_week,
        start_time,
        end_time,
        subject,
        class_id,
        reminder_enabled,
        reminder_delay_minutes
      } = item;

      const isReminderOn = Boolean(reminder_enabled);
      const delay = isReminderOn ? Number(reminder_delay_minutes) : null;

      const [inserted] = await sql`
        INSERT INTO timetable_entries (
          teacher_id,
          day_of_week,
          start_time,
          end_time,
          subject,
          class_id,
          reminder_enabled,
          reminder_delay_minutes
        ) VALUES (
          ${teacherId},
          ${Number(day_of_week)},
          ${start_time.trim()},
          ${end_time.trim()},
          ${subject.trim()},
          ${Number(class_id)},
          ${isReminderOn},
          ${delay}
        )
        RETURNING id, teacher_id, day_of_week, start_time, end_time, subject, class_id, reminder_enabled, reminder_delay_minutes, created_at;
      `;

      created.push(inserted);
    }

    res.status(201).json({ 
      message: `${created.length} entry(ies) created successfully`,
      entries: isArray ? created : created[0]
    });
  } catch (err) {
    console.error('[Timetable Controller] POST /entries error:', err);
    res.status(500).json({ message: 'Server error creating timetable entries', error: err.message });
  }
};

// PUT /timetable/entries/:id — update single entry (scoped to teacher_id)
const updateTimetableEntry = async (req, res) => {
  const teacherId = req.user.id;
  const { id } = req.params;

  try {
    const [existing] = await sql`
      SELECT id, teacher_id FROM timetable_entries WHERE id = ${id};
    `;

    if (!existing) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }

    if (existing.teacher_id !== teacherId) {
      return res.status(403).json({ message: 'Forbidden: You cannot modify another teacher\'s timetable' });
    }

    const errMessage = validateEntry(req.body);
    if (errMessage) {
      return res.status(400).json({ message: errMessage });
    }

    const {
      day_of_week,
      start_time,
      end_time,
      subject,
      class_id,
      reminder_enabled,
      reminder_delay_minutes
    } = req.body;

    const isReminderOn = Boolean(reminder_enabled);
    const delay = isReminderOn ? Number(reminder_delay_minutes) : null;

    const [updated] = await sql`
      UPDATE timetable_entries
      SET
        day_of_week = ${Number(day_of_week)},
        start_time = ${start_time.trim()},
        end_time = ${end_time.trim()},
        subject = ${subject.trim()},
        class_id = ${Number(class_id)},
        reminder_enabled = ${isReminderOn},
        reminder_delay_minutes = ${delay},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND teacher_id = ${teacherId}
      RETURNING id, teacher_id, day_of_week, start_time, end_time, subject, class_id, reminder_enabled, reminder_delay_minutes, updated_at;
    `;

    res.json({ message: 'Timetable entry updated', entry: updated });
  } catch (err) {
    console.error('[Timetable Controller] PUT /entries/:id error:', err);
    res.status(500).json({ message: 'Server error updating timetable entry', error: err.message });
  }
};

// DELETE /timetable/entries/:id — delete entry (scoped to teacher_id)
const deleteTimetableEntry = async (req, res) => {
  const teacherId = req.user.id;
  const { id } = req.params;

  try {
    const [existing] = await sql`
      SELECT id, teacher_id FROM timetable_entries WHERE id = ${id};
    `;

    if (!existing) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }

    if (existing.teacher_id !== teacherId) {
      return res.status(403).json({ message: 'Forbidden: You cannot delete another teacher\'s timetable' });
    }

    await sql`
      DELETE FROM timetable_entries
      WHERE id = ${id} AND teacher_id = ${teacherId};
    `;

    res.json({ message: 'Timetable entry deleted successfully', id: Number(id) });
  } catch (err) {
    console.error('[Timetable Controller] DELETE /entries/:id error:', err);
    res.status(500).json({ message: 'Server error deleting timetable entry', error: err.message });
  }
};

module.exports = {
  getMyTimetable,
  createTimetableEntries,
  updateTimetableEntry,
  deleteTimetableEntry,
};
