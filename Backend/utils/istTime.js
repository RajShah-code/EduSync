/**
 * IST Time Helper Utility
 * 
 * Provides timezone-aware current time calculations for Asia/Kolkata (IST).
 * Standardizes dayOfWeek to EduSync app convention:
 *   0 = Monday, 1 = Tuesday, 2 = Wednesday, 3 = Thursday, 4 = Friday, 5 = Saturday, 6 = Sunday
 */

function getISTNow(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = {};
  formatter.formatToParts(date).forEach(({ type, value }) => {
    parts[type] = value;
  });

  let hours = Number(parts.hour);
  if (hours === 24) hours = 0;

  const minutes = Number(parts.minute);
  const seconds = Number(parts.second);
  const totalMinutes = hours * 60 + minutes;

  // Map weekday ('Mon'..'Sun') to app convention 0=Monday..6=Sunday
  const weekdayMap = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const dayOfWeek = weekdayMap[parts.weekday] !== undefined ? weekdayMap[parts.weekday] : 0;

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const dateString = `${year}-${month}-${day}`;
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    hours,
    minutes,
    seconds,
    totalMinutes,
    dayOfWeek,
    dateString,
    timeString,
  };
}

module.exports = { getISTNow };
