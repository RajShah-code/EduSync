const sql = require('../config/db');
const { getISTNow } = require('../utils/istTime');

let cron;
try {
  cron = require('node-cron');
} catch {
  cron = null;
}

let BrevoClient;
try {
  BrevoClient = require('@getbrevo/brevo').BrevoClient;
} catch {
  BrevoClient = null;
}

let runCounter = 0;

/**
 * Parses time string "HH:MM" or "HH:MM:SS" to minutes from midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Executes a single reminder check tick using IST timezone calculations
 */
async function checkLateLectureReminders() {
  runCounter += 1;
  const isHeartbeat = runCounter % 10 === 0 || runCounter === 1;

  try {
    const istNow = getISTNow();
    const currentDayOfWeek = istNow.dayOfWeek; // 0=Monday..6=Sunday
    const currentMinutes = istNow.totalMinutes;
    const todayStr = istNow.dateString; // 'YYYY-MM-DD' in IST

    // Fetch candidate timetable entries for today
    const candidates = await sql`
      SELECT 
        t.id,
        t.teacher_id,
        t.day_of_week,
        t.start_time,
        t.end_time,
        t.subject,
        t.class_id,
        t.reminder_enabled,
        t.reminder_delay_minutes,
        t.last_triggered_date::text AS last_triggered_date,
        t.last_reminder_sent_date::text AS last_reminder_sent_date,
        u.email AS teacher_email,
        u.name AS teacher_name,
        c.name AS class_name
      FROM timetable_entries t
      JOIN users u ON u.id = t.teacher_id
      JOIN classes c ON c.id = t.class_id
      WHERE t.reminder_enabled = true
        AND t.day_of_week = ${currentDayOfWeek};
    `;

    if (isHeartbeat) {
      console.log(`[ReminderCron] Tick #${runCounter} (${istNow.dateString} ${istNow.timeString} IST): Checked ${candidates.length} active entry candidate(s) for day ${currentDayOfWeek}.`);
    }

    let remindersSent = 0;

    for (const entry of candidates) {
      const startMins = timeToMinutes(entry.start_time);
      const endMins = timeToMinutes(entry.end_time);
      const delayMins = Number(entry.reminder_delay_minutes) || 0;
      const reminderThresholdMins = startMins + delayMins;

      // Skip 1: Not late yet
      if (currentMinutes < reminderThresholdMins) {
        continue;
      }

      // Skip 2: Lecture window is over
      if (currentMinutes > endMins) {
        continue;
      }

      // Skip 3: Teacher already started session today (IST date string comparison)
      if (entry.last_triggered_date === todayStr) {
        continue;
      }

      // Skip 4: Reminder already sent once today (IST date string comparison)
      if (entry.last_reminder_sent_date === todayStr) {
        continue;
      }

      // Overdue & unscheduled: Send reminder email via Brevo
      const minutesLate = currentMinutes - startMins;
      const teacherEmail = (entry.teacher_email || '').trim();

      console.log(`[ReminderCron] Overdue lecture detected! Entry #${entry.id} (${entry.subject} - ${entry.class_name}). ${minutesLate} mins late. Recipient: ${teacherEmail}`);

      const brevoApiKey = process.env.BREVO_API_KEY;
      if (!brevoApiKey) {
        console.warn(`[ReminderCron] BREVO_API_KEY is not set. Skipping email send for entry #${entry.id}.`);
      } else if (!BrevoClient) {
        console.warn(`[ReminderCron] Brevo SDK module not found. Skipping email send for entry #${entry.id}.`);
      } else {
        try {
          const brevoClient = new BrevoClient({ apiKey: brevoApiKey });
          const mailBodyText = `Hello ${entry.teacher_name || 'Teacher'},\n\n` +
            `This is a gentle reminder from EduSync.\n\n` +
            `Your scheduled lecture for "${entry.subject}" with class ${entry.class_name} was set to start at ${entry.start_time.slice(0, 5)}.\n` +
            `It is currently ${minutesLate} minute(s) past the start time, and your broadcast session has not been started yet.\n\n` +
            `Please log in to your EduSync Control Center to start your broadcast when ready.\n\n` +
            `Best regards,\nEduSync Platform`;

          await brevoClient.transactionalEmails.sendTransacEmail({
            sender: { name: 'EduSync', email: 'edusync.platform@gmail.com' },
            to: [{ email: teacherEmail }],
            subject: `Reminder: ${entry.subject} for ${entry.class_name} hasn't started yet`,
            textContent: mailBodyText,
          });

          console.log(`[ReminderCron] Brevo email sent successfully to ${teacherEmail} for entry #${entry.id}`);
        } catch (emailErr) {
          console.error(`[ReminderCron] Brevo email send failed for entry #${entry.id}:`, emailErr.message);
        }
      }

      // Mark last_reminder_sent_date to IST date to prevent duplicate reminders
      await sql`
        UPDATE timetable_entries
        SET last_reminder_sent_date = ${todayStr}::date
        WHERE id = ${entry.id};
      `;

      remindersSent += 1;
    }

    if (remindersSent > 0) {
      console.log(`[ReminderCron] Tick #${runCounter} finished: Sent ${remindersSent} late-lecture reminder(s).`);
    }
  } catch (err) {
    console.error(`[ReminderCron] Error in tick #${runCounter}:`, err.message);
  }
}

/**
 * Initializes and starts the 1-minute recurring cron job for timetable reminders
 */
function initReminderCron() {
  if (!cron) {
    console.warn('[ReminderCron] node-cron module not found locally. It will run automatically when deployed on Render.');
    return;
  }

  console.log('[ReminderCron] Initializing 1-minute automated reminder cron job (Asia/Kolkata IST)...');
  cron.schedule('* * * * *', checkLateLectureReminders);
}

module.exports = { initReminderCron, checkLateLectureReminders };
