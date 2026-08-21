export const studentTourSteps = [
  {
    target: '[data-tour="student-dashboard-link"]',
    title: "Student Dashboard",
    content: "Welcome to EduSync Student Portal! Monitor live lab broadcast availability, assigned coding tasks, and attendance stats.",
    placement: "right",
  },
  {
    target: '[data-tour="student-sessions-link"]',
    title: "Live Broadcast Sessions",
    content: "View active live broadcast sessions, enter session passwords, and join synchronized lab streams.",
    placement: "right",
  },
  {
    target: '[data-tour="student-email-folder-link"]',
    title: "Email My Folder",
    content: "Package your entire saved lab code directory into a zip archive and email it directly to yourself or your teacher.",
    placement: "right",
  },
  {
    target: '[data-tour="student-attendance-link"]',
    title: "Attendance & Focus Records",
    content: "Track your personal lecture attendance history, present percentages, and focus exit metrics.",
    placement: "right",
  },
  {
    target: '[data-tour="student-settings-link"]',
    title: "Settings & Tour Replay",
    content: "Update your student profile preferences, manage account credentials, or replay this tour anytime.",
    placement: "right",
  },
];

// ── Per-page tours ──────────────────────────────────────────────────────────
// Shown once, the first time a student lands on that page (tracked in
// localStorage via tours/pageTours.js) — separate from the sidebar
// orientation tour above, which only ever runs from the Dashboard.

export const sessionsPageTourSteps = [
  {
    target: '[data-tour="sessions-header"]',
    title: "Live Sessions",
    content: "Every lab session your instructor is currently broadcasting shows up here in real time — no refresh needed.",
    placement: "bottom",
  },
  {
    target: '[data-tour="sessions-search"]',
    title: "Find a session fast",
    content: "Search by lecture name or lab room if multiple sessions are running at once.",
    placement: "bottom",
  },
];

export const attendancePageTourSteps = [
  {
    target: '[data-tour="attendance-stats"]',
    title: "Your attendance at a glance",
    content: "Total sessions, present count, absences, and your overall rate — all update automatically as new sessions end.",
    placement: "bottom",
  },
  {
    target: '[data-tour="attendance-filters"]',
    title: "Narrow it down",
    content: "Filter your history by subject or teacher to check attendance for a specific class.",
    placement: "bottom",
  },
  {
    target: '[data-tour="attendance-table"]',
    title: "Full record",
    content: "Every session you were marked present or absent for, with date, subject, and teacher.",
    placement: "top",
  },
];

export const settingsPageTourSteps = [
  {
    target: '[data-tour="settings-profile"]',
    title: "Your profile",
    content: "Update your display name here. Your email is tied to your account and can't be changed.",
    placement: "bottom",
  },
  {
    target: '[data-tour="settings-password"]',
    title: "Change your password",
    content: "Update your account password anytime — you'll need your current password to confirm.",
    placement: "bottom",
  },
  {
    target: '[data-tour="settings-tour-replay"]',
    title: "Replay this tour",
    content: "Forgot where something was? Come back here anytime to replay the sidebar orientation tour.",
    placement: "top",
  },
];

export const sendFilesPageTourSteps = [
  {
    target: '[data-tour="sendfiles-select"]',
    title: "Pick what to send",
    content: "Choose a whole folder or individual files from your computer — everything is zipped locally in your browser before sending.",
    placement: "bottom",
  },
  {
    target: '[data-tour="sendfiles-limits"]',
    title: "Know the limits",
    content: "Each zip is capped at 20MB, and you can send up to 5 times per hour.",
    placement: "bottom",
  },
  {
    target: '[data-tour="sendfiles-email"]',
    title: "Send it",
    content: "Enter the recipient's email and send — your zipped package arrives as an attachment.",
    placement: "top",
  },
];
