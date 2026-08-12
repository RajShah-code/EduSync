const sql = require('../config/db');
const XLSX = require('xlsx');

/**
 * Validates a single timetable entry object.
 * Returns an error string if invalid, or null if valid.
 */
function validateEntry(entry) {
  const { day_of_week, start_time, end_time, subject, class_id, session_type } = entry;

  if (day_of_week === undefined || day_of_week === null || !Number.isInteger(Number(day_of_week)) || day_of_week < 0 || day_of_week > 5) {
    return 'Invalid day_of_week (must be an integer 0-5 for Monday through Saturday)';
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

  if (session_type && !['standard', 'lab'].includes(session_type)) {
    return 'session_type must be either standard or lab';
  }

  return null;
}

// GET /timetable/me — list teacher's full timetable entries & global reminder delay setting
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
        t.room,
        COALESCE(t.session_type, 'standard') AS session_type,
        t.reminder_enabled,
        t.created_at,
        t.updated_at
      FROM timetable_entries t
      JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = ${teacherId} AND t.day_of_week BETWEEN 0 AND 5
      ORDER BY t.day_of_week ASC, t.start_time ASC;
    `;

    const [userRec] = await sql`
      SELECT default_reminder_delay_minutes FROM users WHERE id = ${teacherId};
    `;

    const default_reminder_delay_minutes = userRec ? (userRec.default_reminder_delay_minutes ?? 5) : 5;

    res.json({ entries, default_reminder_delay_minutes });
  } catch (err) {
    console.error('[Timetable Controller] GET /me error:', err);
    res.status(500).json({ message: 'Server error fetching timetable', error: err.message });
  }
};

// PUT /timetable/settings — update teacher's global reminder delay setting
const updateTimetableSettings = async (req, res) => {
  const teacherId = req.user.id;
  const { default_reminder_delay_minutes } = req.body;

  const delayNum = Number(default_reminder_delay_minutes);
  if (default_reminder_delay_minutes === undefined || default_reminder_delay_minutes === null || isNaN(delayNum) || delayNum < 0) {
    return res.status(400).json({ message: 'default_reminder_delay_minutes must be an integer 0 or greater' });
  }

  try {
    const [updatedUser] = await sql`
      UPDATE users
      SET default_reminder_delay_minutes = ${delayNum}
      WHERE id = ${teacherId}
      RETURNING id, default_reminder_delay_minutes;
    `;

    res.json({
      message: 'Global timetable options updated',
      default_reminder_delay_minutes: updatedUser.default_reminder_delay_minutes,
    });
  } catch (err) {
    console.error('[Timetable Controller] PUT /settings error:', err);
    res.status(500).json({ message: 'Server error updating settings', error: err.message });
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
        room,
        session_type,
        reminder_enabled
      } = item;

      const isReminderOn = Boolean(reminder_enabled);
      const finalRoom = room && typeof room === 'string' ? room.trim() : null;
      const finalSessionType = session_type === 'lab' ? 'lab' : 'standard';

      const [inserted] = await sql`
        INSERT INTO timetable_entries (
          teacher_id,
          day_of_week,
          start_time,
          end_time,
          subject,
          class_id,
          room,
          session_type,
          reminder_enabled
        ) VALUES (
          ${teacherId},
          ${Number(day_of_week)},
          ${start_time.trim()},
          ${end_time.trim()},
          ${subject.trim()},
          ${Number(class_id)},
          ${finalRoom},
          ${finalSessionType},
          ${isReminderOn}
        )
        RETURNING id, teacher_id, day_of_week, start_time, end_time, subject, class_id, room, session_type, reminder_enabled, created_at;
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
      room,
      session_type,
      reminder_enabled
    } = req.body;

    const isReminderOn = Boolean(reminder_enabled);
    const finalRoom = room && typeof room === 'string' ? room.trim() : null;
    const finalSessionType = session_type === 'lab' ? 'lab' : 'standard';

    const [updated] = await sql`
      UPDATE timetable_entries
      SET
        day_of_week = ${Number(day_of_week)},
        start_time = ${start_time.trim()},
        end_time = ${end_time.trim()},
        subject = ${subject.trim()},
        class_id = ${Number(class_id)},
        room = ${finalRoom},
        session_type = ${finalSessionType},
        reminder_enabled = ${isReminderOn},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND teacher_id = ${teacherId}
      RETURNING id, teacher_id, day_of_week, start_time, end_time, subject, class_id, room, session_type, reminder_enabled, updated_at;
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

// GET /timetable/template — download Excel template for timetable import
const downloadTimetableTemplate = async (req, res) => {
  try {
    const headers = [
      'Day',
      'Start Time',
      'End Time',
      'Subject',
      'Class',
      'Room',
      'Session Type',
      'Reminder Enabled',
    ];

    const sampleRow = [
      'Monday',
      '09:00 AM',
      '10:00 AM',
      'Data Structures & Algorithms',
      'TYBCA',
      'Lab 3',
      'lab',
      'Yes',
    ];

    const worksheetData = [headers, sampleRow];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timetable Template');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.status(200)
       .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
       .setHeader('Content-Disposition', 'attachment; filename="timetable_template.xlsx"')
       .send(buffer);
  } catch (err) {
    console.error('[Timetable Controller] GET /template error:', err);
    res.status(500).json({ message: 'Failed to generate timetable template', error: err.message });
  }
};

// Map day name string or integer to day_of_week integer (0=Monday..5=Saturday)
function parseDayOfWeek(rawDay) {
  if (rawDay === undefined || rawDay === null) return null;
  const str = String(rawDay).trim().toLowerCase();
  const dayMap = {
    monday: 0,
    mon: 0,
    tuesday: 1,
    tue: 1,
    wednesday: 2,
    wed: 2,
    thursday: 3,
    thu: 3,
    friday: 4,
    fri: 4,
    saturday: 5,
    sat: 5,
  };
  if (str in dayMap) return dayMap[str];
  const num = Number(str);
  if (!isNaN(num) && num >= 0 && num <= 5) return num;
  return null;
}

/**
 * Normalizes 12-hour (09:00 AM / 1:30 PM) or 24-hour (14:00 / 09:00) time strings
 * to a clean 24-hour "HH:MM" string. Returns null if invalid.
 */
function normalizeTimeString(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const str = rawStr.trim();
  if (!str) return null;

  // 1. Try matching 12-hour format with AM/PM (e.g. "9:00 AM", "09:00:00 AM", "1:30 PM", "12:15 PM")
  const twelverMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
  if (twelverMatch) {
    let hours = parseInt(twelverMatch[1], 10);
    const minutes = parseInt(twelverMatch[2], 10);
    const ampm = twelverMatch[3].toLowerCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // 2. Try matching 24-hour format (e.g. "09:00", "14:30", "9:00", "14:30:00")
  const twentyFourMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourMatch) {
    const hours = parseInt(twentyFourMatch[1], 10);
    const minutes = parseInt(twentyFourMatch[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return null;
}

// POST /timetable/import — bulk import timetable entries via Excel file upload
const importTimetable = async (req, res) => {
  const teacherId = req.user.id;

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'Excel file (.xlsx) is required' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ message: 'Uploaded Excel file contains no data rows' });
    }

    const seenInBatch = new Set();
    const results = [];

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // Row 1 is header
      const rawRow = rawRows[i];

      // Normalize keys
      const row = {};
      Object.keys(rawRow).forEach((k) => {
        row[k.trim().toLowerCase()] = String(rawRow[k]).trim();
      });

      const dayVal = row['day'] || '';
      const rawStartTime = row['start time'] || row['start_time'] || '';
      const rawEndTime = row['end time'] || row['end_time'] || '';
      const subject = row['subject'] || '';
      const className = row['class'] || row['class_name'] || '';
      const room = row['room'] || '';
      const sessionTypeRaw = (row['session type'] || row['session_type'] || 'standard').toLowerCase();
      const reminderEnabledRaw = (row['reminder enabled'] || row['reminder_enabled'] || '').toLowerCase();

      // Skip empty row
      if (!dayVal && !rawStartTime && !rawEndTime && !subject && !className) {
        continue;
      }

      // 1. Day validation (0=MON to 5=SAT)
      const dayOfWeek = parseDayOfWeek(dayVal);
      if (dayOfWeek === null) {
        results.push({ row: rowNum, status: 'failed', subject: subject || null, reason: `Invalid day '${dayVal}'. Must be Monday–Saturday (0–5).` });
        continue;
      }

      // 2. Time validation & normalization (accepts 12-hr "09:00 AM" and 24-hr "14:00")
      const startTime = normalizeTimeString(rawStartTime);
      if (!startTime) {
        results.push({ row: rowNum, status: 'failed', subject: subject || null, reason: `Invalid or missing Start Time '${rawStartTime}' (expected format HH:MM or HH:MM AM/PM)` });
        continue;
      }

      const endTime = normalizeTimeString(rawEndTime);
      if (!endTime) {
        results.push({ row: rowNum, status: 'failed', subject: subject || null, reason: `Invalid or missing End Time '${rawEndTime}' (expected format HH:MM or HH:MM AM/PM)` });
        continue;
      }

      if (startTime >= endTime) {
        results.push({ row: rowNum, status: 'failed', subject, reason: `End time (${endTime}) must be later than start time (${startTime})` });
        continue;
      }

      // 3. Subject validation
      if (!subject) {
        results.push({ row: rowNum, status: 'failed', subject: null, reason: 'Subject is required' });
        continue;
      }

      // 4. Class lookup (System-wide class lookup by name)
      if (!className) {
        results.push({ row: rowNum, status: 'failed', subject, reason: 'Class name is required' });
        continue;
      }

      const [cls] = await sql`
        SELECT id, name FROM classes WHERE LOWER(name) = LOWER(${className});
      `;
      if (!cls) {
        results.push({ row: rowNum, status: 'failed', subject, reason: `Class '${className}' does not exist in system` });
        continue;
      }

      // 5. Session type validation (lab/practical -> lab, theory/standard -> standard)
      const sessionType = (sessionTypeRaw === 'lab' || sessionTypeRaw === 'practical') ? 'lab' : 'standard';

      // 6. Reminder settings (per-lecture boolean flag)
      const isReminderOn = ['yes', 'true', '1'].includes(reminderEnabledRaw);

      // 7. In-file duplicate check
      const batchKey = `${dayOfWeek}_${startTime}`;
      if (seenInBatch.has(batchKey)) {
        results.push({ row: rowNum, status: 'failed', subject, reason: `Duplicate entry in file for day ${dayOfWeek} at ${startTime}` });
        continue;
      }

      // 8. DB duplicate check (exact same teacher + day_of_week + start_time)
      const existingExact = await sql`
        SELECT id FROM timetable_entries 
        WHERE teacher_id = ${teacherId} AND day_of_week = ${dayOfWeek} AND start_time = ${startTime}::time;
      `;
      if (existingExact.length > 0) {
        results.push({ row: rowNum, status: 'failed', subject, reason: 'Exact timetable entry already exists for this day and start time' });
        continue;
      }

      // Overlap warning check (informational flag in response report)
      const overlapping = await sql`
        SELECT id, subject, start_time, end_time FROM timetable_entries
        WHERE teacher_id = ${teacherId} 
          AND day_of_week = ${dayOfWeek} 
          AND start_time < ${endTime}::time 
          AND end_time > ${startTime}::time;
      `;
      let note = undefined;
      if (overlapping.length > 0) {
        note = `Warning: Time overlaps with existing entry '${overlapping[0].subject}' (${overlapping[0].start_time} - ${overlapping[0].end_time})`;
      }

      // 9. Insert timetable entry into DB
      try {
        await sql`
          INSERT INTO timetable_entries (
            teacher_id,
            day_of_week,
            start_time,
            end_time,
            subject,
            class_id,
            room,
            session_type,
            reminder_enabled
          ) VALUES (
            ${teacherId},
            ${dayOfWeek},
            ${startTime}::time,
            ${endTime}::time,
            ${subject},
            ${cls.id},
            ${room ? room : null},
            ${sessionType},
            ${isReminderOn}
          )
        `;

        seenInBatch.add(batchKey);
        results.push({ row: rowNum, status: 'created', subject, day: dayOfWeek, startTime, note });
      } catch (err) {
        results.push({ row: rowNum, status: 'failed', subject, reason: err.message || 'Database error during insertion' });
      }
    }

    res.json({ message: 'Timetable import complete', results });
  } catch (err) {
    console.error('[Timetable Controller] POST /import error:', err);
    res.status(500).json({ message: 'Failed to process Excel file', error: err.message });
  }
};

// ── TIMETABLE EXCEPTIONS (REMINDER SUPPRESSION DATES) ───────────────────────

// GET /timetable/exceptions — list teacher's exception dates
const getTimetableExceptions = async (req, res) => {
  const teacherId = req.user.id;
  try {
    const exceptions = await sql`
      SELECT id, teacher_id, exception_date::text AS exception_date, created_at
      FROM timetable_exceptions
      WHERE teacher_id = ${teacherId}
      ORDER BY exception_date ASC;
    `;
    res.json({ exceptions });
  } catch (err) {
    console.error('[Timetable Controller] GET /exceptions error:', err);
    res.status(500).json({ message: 'Server error fetching exception dates', error: err.message });
  }
};

// POST /timetable/exceptions — add a date exception for teacher
const createTimetableException = async (req, res) => {
  const teacherId = req.user.id;
  const { exception_date } = req.body;

  if (!exception_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(exception_date).trim())) {
    return res.status(400).json({ message: 'Valid exception_date (YYYY-MM-DD) is required' });
  }

  try {
    const dateStr = String(exception_date).trim();
    const [inserted] = await sql`
      INSERT INTO timetable_exceptions (teacher_id, exception_date)
      VALUES (${teacherId}, ${dateStr}::date)
      ON CONFLICT (teacher_id, exception_date) DO NOTHING
      RETURNING id, teacher_id, exception_date::text AS exception_date, created_at;
    `;

    if (!inserted) {
      return res.status(400).json({ message: 'Exception date already marked' });
    }

    res.status(201).json({ message: 'Reminder suppression date added', exception: inserted });
  } catch (err) {
    console.error('[Timetable Controller] POST /exceptions error:', err);
    res.status(500).json({ message: 'Server error creating date exception', error: err.message });
  }
};

// DELETE /timetable/exceptions/:id — remove date exception
const deleteTimetableException = async (req, res) => {
  const teacherId = req.user.id;
  const { id } = req.params;

  try {
    const [deleted] = await sql`
      DELETE FROM timetable_exceptions
      WHERE id = ${id} AND teacher_id = ${teacherId}
      RETURNING id;
    `;

    if (!deleted) {
      return res.status(404).json({ message: 'Exception date not found' });
    }

    res.json({ message: 'Reminder suppression date removed', id: Number(id) });
  } catch (err) {
    console.error('[Timetable Controller] DELETE /exceptions/:id error:', err);
    res.status(500).json({ message: 'Server error deleting date exception', error: err.message });
  }
};

module.exports = {
  getMyTimetable,
  updateTimetableSettings,
  createTimetableEntries,
  updateTimetableEntry,
  deleteTimetableEntry,
  downloadTimetableTemplate,
  importTimetable,
  getTimetableExceptions,
  createTimetableException,
  deleteTimetableException,
};
