export const teacherTourSteps = [
  // Dashboard Steps
  {
    target: '[data-tour="teacher-session"]',
    title: "Lab Control Center",
    content: "Welcome to EduSync! This control card displays your active broadcast status, active session timers, and live student connection counts.",
    placement: "bottom",
  },
  {
    target: '[data-tour="teacher-todays-schedule"]',
    title: "Today's Schedule & Quick Launch",
    content: "View your daily recurring lectures. When a lecture time arrives, click 'Start Now' to auto-populate your broadcast session setup.",
    placement: "top",
  },
  // Sidebar Tooltip Steps (Dialog-only, no navigation)
  {
    target: '[data-tour="teacher-broadcast-link"]',
    title: "Live Broadcast Studio",
    content: "Launch live WebRTC screen sharing, multi-language code synchronization, and interactive whiteboard streaming.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-monitor-link"]',
    title: "Real-time Student Monitor",
    content: "View live thumbnails of connected student laboratory screens and track focus-loss metrics.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-task-link"]',
    title: "Task Assignment & Evaluation",
    content: "Push coding challenges live to student screens, inspect submitted code, and review execution results.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-exam-link"]',
    title: "Exam Suite & Anti-Cheat",
    content: "Create timed online exams, manage waiting rooms, and inspect real-time anti-cheat violation logs.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-timetable-link"]',
    title: "Timetable Grid Setup",
    content: "Organize your weekly lecture slots, assign class rooms, and configure global email warning delays.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-attendance-link"]',
    title: "Attendance & Exception Review",
    content: "Inspect automated session attendance records, review focus loss logs, and resolve exception cases.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-analytics-link"]',
    title: "Lab Analytics & Insights",
    content: "Review long-term attendance trends, class engagement scores, and student participation reports.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-recordings-link"]',
    title: "Session Recordings Archive",
    content: "Access, download, and review recorded lab sessions saved directly during live broadcasts.",
    placement: "right",
  },
  {
    target: '[data-tour="teacher-settings-link"]',
    title: "Settings & Tour Replay",
    content: "Manage account security, configure global warning slider delays, or replay this tour anytime.",
    placement: "right",
  },
];
