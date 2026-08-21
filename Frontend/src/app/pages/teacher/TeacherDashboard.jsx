import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router";
import { Button } from "../../components/ui/button";
import {
  Play,
  Square,
  Calendar,
  BookOpen,
  School,
  Loader2,
  Bell,
  Sparkles,
  Plus,
  Monitor,
  ClipboardList,
  FileText,
  CalendarCheck,
  BarChart3,
  Video,
} from "lucide-react";
import { AppTour } from "../../components/AppTour";
import { teacherTourSteps } from "../../tours/teacherTourSteps";
import { getSocket } from "../../store/socket";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import { ElapsedTimer } from "../../components/Timer";

// Direct-navigation shortcuts to the rest of the teacher workflow — a calmer,
// genuinely useful replacement for the old "Recent Activity" panel, which had
// no backend source and always rendered an empty state.
const QUICK_ACTIONS = [
  { name: "Assign Task", href: "/teacher/task/assign", icon: ClipboardList },
  { name: "Create Exam", href: "/teacher/exam/create", icon: FileText },
  { name: "Timetable", href: "/teacher/timetable", icon: Calendar },
  { name: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
  { name: "Analytics", href: "/teacher/analytics", icon: BarChart3 },
  { name: "Recordings", href: "/teacher/recordings", icon: Video },
];

// Days name helper for header
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Helper to parse time string "HH:MM" or "HH:MM:SS" into total minutes from midnight.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculates entry status relative to current time:
 * - 'ACTIVE' : start_time - 15min <= now <= end_time
 * - 'UPCOMING' : now < start_time - 15min
 * - 'PAST' : now > end_time
 */
function getLectureStatus(startTimeStr, endTimeStr) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const startMinutes = parseTimeToMinutes(startTimeStr);
  const endMinutes = parseTimeToMinutes(endTimeStr);

  const activeWindowStart = startMinutes - 15;

  if (currentMinutes >= activeWindowStart && currentMinutes <= endMinutes) {
    return "ACTIVE";
  } else if (currentMinutes < activeWindowStart) {
    return "UPCOMING";
  } else {
    return "PAST";
  }
}

export function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [runTour, setRunTour] = useState(false);
  const [isManualReplay, setIsManualReplay] = useState(false);

  // Timetable State
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [loadingTimetable, setLoadingTimetable] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem("edusync_user");
    const user = userStr ? JSON.parse(userStr) : {};

    if (location.state?.startTour) {
      setIsManualReplay(true);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    } else if (user.has_seen_tour !== true) {
      setIsManualReplay(false);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // Fetch timetable on mount
  useEffect(() => {
    const fetchTimetable = async () => {
      const token = localStorage.getItem("edusync_token");
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/timetable/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTimetableEntries(data.entries || []);
        }
      } catch (err) {
        console.error("Failed to load timetable on dashboard:", err);
      } finally {
        setLoadingTimetable(false);
      }
    };

    fetchTimetable();
  }, []);

  const {
    broadcastState,
    setBroadcastState,
    recordingState,
    setRecordingState,
    sessionInfo,
    setSessionInfo,
    setSessionSeconds,
    setRecordingSeconds,
  } = useOutletContext();

  const sessionActive = broadcastState !== "idle";

  const handleEndSession = () => {
    setBroadcastState("idle");
    setRecordingState("off");
    setSessionSeconds(0);
    setRecordingSeconds(0);
    setSessionInfo(null);
  };

  // ── Live student roster for the active session ─────────────────────────────
  // Same fetch + socket pattern as StudentMonitor.jsx (the proven real-time
  // source for this data) — reused here so the session card shows genuine
  // counts instead of the static placeholder zeros it used to.
  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (!sessionInfo) {
      setStudents([]);
      return;
    }

    const fetchStudents = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/sessions/${sessionInfo.id}/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStudents(data.students || []);
        }
      } catch (err) {
        console.error("Failed to fetch students:", err);
      }
    };
    fetchStudents();

    let socket = getSocket();
    const setupListener = (s) => {
      const handleUpdate = (payload) => {
        if (payload.session_id === sessionInfo.id) {
          setStudents(payload.students || []);
        }
      };
      s.on("teacher:student_status_update", handleUpdate);
      return () => s.off("teacher:student_status_update", handleUpdate);
    };

    let cleanup = null;
    if (socket) {
      cleanup = setupListener(socket);
    } else {
      const interval = setInterval(() => {
        const s = getSocket();
        if (s) {
          clearInterval(interval);
          cleanup = setupListener(s);
        }
      }, 200);
      return () => {
        clearInterval(interval);
        if (cleanup) cleanup();
      };
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [sessionInfo]);

  const liveStats = {
    connected: students.length,
    active: students.filter((s) => deriveConnectionStatus(s, { useActive: true }) === "active").length,
    idle: students.filter((s) => deriveConnectionStatus(s, { useActive: true }) === "idle").length,
  };

  // Determine current day index (0=Monday, ..., 6=Sunday)
  const jsDay = new Date().getDay();
  const currentDayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const todayName = DAY_NAMES[currentDayOfWeek];

  // Filter & sort today's lectures
  const todayLectures = timetableEntries
    .filter((e) => Number(e.day_of_week) === currentDayOfWeek)
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  const hasAnyTimetable = timetableEntries.length > 0;

  // Handle "Start Now" button click on an active lecture entry
  const handleStartActiveLecture = (entry) => {
    navigate("/teacher/broadcast", {
      state: {
        autoOpenModal: true,
        prefillSubject: entry.subject,
        prefillClassIds: [entry.class_id],
      },
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Control Center
        </h1>
        <p className="text-text-secondary">
          Manage your lab session, daily schedule, and monitor students
        </p>
      </div>

      {/* Session Control — the page's primary focus, hero-weighted */}
      <div data-tour="teacher-session" className="bg-bg-surface border border-border rounded-[var(--radius-lg)]">
        <div className="p-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {sessionActive && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent-live pulse-dot" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-live" />
              </span>
            )}
            <div>
              <h2 className="font-display text-lg font-semibold text-text-primary">
                {sessionActive ? (sessionInfo?.lectureName || "Active Broadcast Session") : "Lab Session"}
              </h2>
              <p className="text-sm text-text-secondary flex items-center gap-2">
                {sessionActive ? (sessionInfo?.subject || "Broadcasting") : "No active session"}
                {sessionActive && sessionInfo?.started_at && (
                  <>
                    <span className="text-text-muted">·</span>
                    <ElapsedTimer startTime={sessionInfo.started_at} size="sm" className="text-text-secondary" />
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sessionActive && (
              <Button
                onClick={() => navigate("/teacher/monitor")}
                variant="outline"
                className="cursor-pointer"
              >
                <Monitor className="w-4 h-4 mr-2" />
                Monitor Students
              </Button>
            )}
            {sessionActive ? (
              <Button
                onClick={handleEndSession}
                variant="outline"
                className="border-accent-critical text-accent-critical hover:bg-accent-critical/10 cursor-pointer"
              >
                <Square className="w-4 h-4 mr-2" />
                End Session
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/teacher/broadcast")}
                className="bg-accent-success hover:bg-accent-success/90 text-white cursor-pointer"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Session
              </Button>
            )}
          </div>
        </div>

        {/* Live student roster — real counts, only shown once a session exists */}
        {sessionActive && (
          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <div className="text-center py-4 px-4">
              <div className="text-2xl font-mono font-semibold text-text-primary tabular-nums">
                {liveStats.connected}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-1">
                Connected
              </div>
            </div>
            <div className="text-center py-4 px-4">
              <div className="text-2xl font-mono font-semibold text-accent-success tabular-nums">
                {liveStats.active}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-1">Active</div>
            </div>
            <div className="text-center py-4 px-4">
              <div className="text-2xl font-mono font-semibold text-accent-warning tabular-nums">
                {liveStats.idle}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-1">Not Viewing</div>
            </div>
          </div>
        )}
      </div>

      {/* TODAY'S SCHEDULE WIDGET (Replaces Quick Actions) */}
      <div data-tour="teacher-todays-schedule" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent-success" />
            Today's Schedule ({todayName})
          </h2>
          {hasAnyTimetable && (
            <Button
              variant="outline"
              onClick={() => navigate("/teacher/timetable")}
              className="text-xs border-border text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Manage Timetable
            </Button>
          )}
        </div>

        {loadingTimetable ? (
          <div className="p-8 bg-bg-surface border border-border rounded-[var(--radius-lg)] flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin text-accent-success" />
            <span className="text-sm">Loading today's schedule...</span>
          </div>
        ) : !hasAnyTimetable ? (
          /* EMPTY STATE 1: No Timetable Configured At All */
          <div className="p-8 bg-bg-surface border border-border rounded-[var(--radius-lg)] text-center space-y-3">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-accent-success/10 border border-accent-success/20 text-accent-success flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">No Timetable Configured</h3>
              <p className="text-xs text-text-secondary max-w-md mx-auto mt-1">
                Set up your recurring weekly timetable using our interactive setup wizard to view your daily schedule and automated reminders here.
              </p>
            </div>
            <Button
              onClick={() => navigate("/teacher/timetable")}
              className="bg-accent-success hover:bg-accent-success/90 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Set Up Timetable
            </Button>
          </div>
        ) : todayLectures.length === 0 ? (
          /* EMPTY STATE 2: Timetable exists, but zero lectures today */
          <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)] text-center space-y-1">
            <p className="text-sm font-medium text-text-primary">No lectures scheduled today ({todayName})</p>
            <p className="text-xs text-text-muted">Enjoy your break or review upcoming classes for tomorrow.</p>
          </div>
        ) : (
          /* LECTURE SCHEDULE LIST — left border-rail signals status, no
             filled-background wash or glow (matches the student dashboard's
             hero card language). */
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] divide-y divide-border overflow-hidden">
            {todayLectures.map((entry) => {
              const status = getLectureStatus(entry.start_time, entry.end_time);

              return (
                <div
                  key={entry.id}
                  className={`pl-4 pr-4 py-3.5 border-l-2 transition-colors flex items-center justify-between gap-4 ${
                    status === "ACTIVE"
                      ? "border-l-accent-live bg-bg-elevated"
                      : status === "UPCOMING"
                      ? "border-l-border"
                      : "border-l-border opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Time Badge */}
                    <div className="flex flex-col items-center justify-center px-3 py-2 rounded-[var(--radius-md)] bg-bg-base border border-border min-w-[100px] shrink-0">
                      <span className="text-xs font-mono font-semibold text-text-primary">
                        {entry.start_time.slice(0, 5)}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono mt-0.5">
                        to {entry.end_time.slice(0, 5)}
                      </span>
                    </div>

                    {/* Entry Info */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {status === "ACTIVE" && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-live pulse-dot" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-live" />
                          </span>
                        )}
                        <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5 truncate">
                          <BookOpen className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <span className="truncate">{entry.subject}</span>
                        </span>
                        {status === "UPCOMING" && (
                          <span className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg-base border border-border text-text-muted shrink-0">
                            UPCOMING
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span className="flex items-center gap-1 truncate">
                          <School className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <span className="truncate">{entry.class_name || "Class #" + entry.class_id}</span>
                        </span>
                        {entry.reminder_enabled && (
                          <span className="flex items-center gap-1 text-accent-warning text-[11px] shrink-0">
                            <Bell className="w-3 h-3" /> {entry.reminder_delay_minutes}m alert
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button Column */}
                  <div className="shrink-0">
                    {status === "ACTIVE" ? (
                      <Button
                        onClick={() => handleStartActiveLecture(entry)}
                        className="bg-accent-success hover:bg-accent-success/90 text-white font-medium text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Start Now
                      </Button>
                    ) : status === "UPCOMING" ? (
                      <Button
                        disabled
                        variant="outline"
                        className="text-xs border-border text-text-muted opacity-60 cursor-not-allowed"
                      >
                        Not yet time
                      </Button>
                    ) : (
                      <span className="text-xs text-text-muted italic px-2">Completed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.href}
              onClick={() => navigate(action.href)}
              className="flex items-center gap-3 p-4 bg-bg-surface border border-border rounded-[var(--radius-md)] text-left hover:border-border-hover transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-bg-base border border-border flex items-center justify-center shrink-0">
                <action.icon className="w-4 h-4 text-accent-info" />
              </div>
              <span className="text-sm font-medium text-text-primary">{action.name}</span>
            </button>
          ))}
        </div>
      </div>

      <AppTour
        steps={teacherTourSteps}
        run={runTour}
        isManualReplay={isManualReplay}
        onFinish={() => setRunTour(false)}
      />
    </div>
  );
}
