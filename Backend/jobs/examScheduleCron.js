const sql = require('../config/db');
const { openExamCore } = require('../controllers/examsController');

// node-cron is a runtime-optional dep here, mirroring reminderCron.js: absent
// locally on some machines, always present on Render.
let cron;
try {
  cron = require('node-cron');
} catch {
  cron = null;
}

let runCounter = 0;

/**
 * One tick: find every draft exam whose scheduled_at has arrived and run the
 * same draft -> waiting_room transition the manual "Open Exam" button does.
 *
 * scheduled_at is TIMESTAMPTZ, so `scheduled_at <= NOW()` is a straight
 * timezone-aware comparison in Postgres — no IST offset math (that approach
 * caused the Phase 21/25 UTC drift bugs and is deliberately avoided here).
 * Option A: status only flips to 'waiting_room'; the teacher still starts the
 * exam manually. No email/notification is sent on auto-open.
 */
async function checkScheduledExams(io) {
  runCounter += 1;
  const isHeartbeat = runCounter % 10 === 0 || runCounter === 1;

  try {
    const dueExams = await sql`
      SELECT id, title, time_limit_minutes
      FROM exams
      WHERE status = 'draft'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
    `;

    if (isHeartbeat || dueExams.length > 0) {
      console.log(`[ExamScheduleCron] Tick #${runCounter}: ${dueExams.length} scheduled exam(s) due to auto-open.`);
    }

    for (const exam of dueExams) {
      try {
        await openExamCore(io, exam);
        console.log(`[ExamScheduleCron] Auto-opened exam #${exam.id} ("${exam.title}") — status -> waiting_room.`);
      } catch (err) {
        console.error(`[ExamScheduleCron] Failed to auto-open exam #${exam.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[ExamScheduleCron] Error in tick #${runCounter}:`, err.message);
  }
}

/**
 * Initializes the 1-minute recurring cron for scheduled-exam auto-open.
 * `io` is passed in from server.js (unlike reminderCron, this job emits sockets).
 */
function initExamScheduleCron(io) {
  if (!cron) {
    console.warn('[ExamScheduleCron] node-cron module not found locally. It will run automatically when deployed on Render.');
    return;
  }

  console.log('[ExamScheduleCron] Initializing 1-minute scheduled-exam auto-open cron job...');
  cron.schedule('* * * * *', () => checkScheduledExams(io));
}

module.exports = { initExamScheduleCron, checkScheduledExams };
