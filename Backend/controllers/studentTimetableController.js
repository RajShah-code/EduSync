const sql = require('../config/db');
const { getISTNow } = require('../utils/istTime');

// GET /student-timetable/schedule — list student's class timetable entries & today's IST day of week
const getStudentTimetable = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { dayOfWeek } = getISTNow();

    const [user] = await sql`SELECT class_id FROM users WHERE id = ${studentId}`;

    if (!user || user.class_id === null || user.class_id === undefined) {
      return res.json({ entries: [], today_day_of_week: dayOfWeek, class_assigned: false });
    }

    const entries = await sql`
      SELECT 
        t.id,
        t.day_of_week,
        t.start_time,
        t.end_time,
        t.subject,
        u.name AS teacher_name,
        t.room,
        COALESCE(t.session_type, 'standard') AS session_type,
        c.name AS class_name
      FROM timetable_entries t
      JOIN users u ON u.id = t.teacher_id
      LEFT JOIN classes c ON c.id = t.class_id
      WHERE t.class_id = ${user.class_id} AND t.day_of_week BETWEEN 0 AND 5
      ORDER BY t.day_of_week ASC, t.start_time ASC;
    `;

    res.json({ entries, today_day_of_week: dayOfWeek, class_assigned: true });
  } catch (err) {
    console.error('[Student Timetable Controller] GET /schedule error:', err);
    res.status(500).json({ message: 'Server error fetching student timetable', error: err.message });
  }
};

module.exports = {
  getStudentTimetable,
};
