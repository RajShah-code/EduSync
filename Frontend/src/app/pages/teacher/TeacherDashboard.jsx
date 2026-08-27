import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext, Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Play,
  Square,
  Calendar,
  BookOpen,
  School,
  Bell,
  Sparkles,
  Plus,
  Monitor,
} from "lucide-react";
import { AppTour } from "../../components/AppTour";
import { teacherTourSteps } from "../../tours/teacherTourSteps";
import { getSocket } from "../../store/socket";
import { toast } from "sonner";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import { ElapsedTimer } from "../../components/Timer";
import PageShell from "../../components/PageShell";

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
  const [timetableError, setTimetableError] = useState(false);
  const [defaultDelayMinutes, setDefaultDelayMinutes] = useState(5);

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
  const fetchTimetable = async () => {
    setLoadingTimetable(true);
    const token = localStorage.getItem("edusync_token");
    if (!token) {
      setTimetableError(true);
      setLoadingTimetable(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/timetable/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTimetableEntries(data.entries || []);
        setDefaultDelayMinutes(data.default_reminder_delay_minutes ?? 5);
        setTimetableError(false);
      } else {
        setTimetableError(true);
      }
    } catch (err) {
      console.error("Failed to load timetable on dashboard:", err);
      setTimetableError(true);
    } finally {
      setLoadingTimetable(false);
    }
  };

  useEffect(() => {
    fetchTimetable();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [ending, setEnding] = useState(false);

  // End the live lecture for real — not just a local UI reset. Mirrors
  // LiveBroadcast.jsx's handleStopBroadcastNow: hit POST /sessions/end first
  // (writes ended_at + finalizes attendance in the DB), and only tear down the
  // local shell state if that succeeds. Then emit teacher:end_session so the
  // server broadcasts session:ended to the students and clears its in-memory
  // session state. TeacherLayout's socket listener still surfaces any
  // attendance-exception review modal regardless of which page ended it.
  const handleEndSession = async () => {
    if (ending) return;
    setEnding(true);

    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/sessions/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Failed to end the lecture. Please try again.");
        setEnding(false);
        return;
      }
    } catch {
      toast.error("Failed to end the lecture. Check your connection and try again.");
      setEnding(false);
      return;
    }

    const socket = getSocket();
    if (socket && sessionInfo?.id) {
      socket.emit("teacher:end_session", { session_id: sessionInfo.id });
    }
    if (sessionInfo?.id) {
      try {
        sessionStorage.removeItem(`edusync_session_password_${sessionInfo.id}`);
      } catch {}
    }

    setBroadcastState("idle");
    setRecordingState("off");
    setSessionSeconds(0);
    setRecordingSeconds(0);
    setSessionInfo(null);
    setEnding(false);
  };

  // ── Live student roster for the active session ─────────────────────────────
  // Same fetch + socket pattern as StudentMonitor.jsx (the proven real-time
  // source for this data) — reused here so the session card shows genuine
  // counts instead of the static placeholder zeros it used to.
  const [students, setStudents] = useState([]);
  const [studentsError, setStudentsError] = useState(false);

  useEffect(() => {
    if (!sessionInfo) {
      setStudents([]);
      setStudentsError(false);
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
          setStudentsError(false);
        } else {
          setStudentsError(true);
        }
      } catch (err) {
        console.error("Failed to fetch students:", err);
        setStudentsError(true);
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
    <PageShell>
      {/* Page Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
          Dashboard
        </h1>
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
                disabled={ending}
                variant="outline"
                className="border-accent-critical text-accent-critical hover:bg-accent-critical/10 cursor-pointer disabled:cursor-not-allowed"
              >
                <Square className="w-4 h-4 mr-2" />
                {ending ? "Ending…" : "End Lecture"}
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/teacher/broadcast")}
                className="bg-accent-700 hover:bg-accent-700/90 text-white cursor-pointer"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Lecture
              </Button>
            )}
          </div>
        </div>

        {/* Live student roster — real counts, only shown once a session exists.
            Dividers float (inset top/bottom) rather than running edge-to-edge,
            matching the stat-row treatment on the student/teacher dashboards. */}
        {sessionActive && (
          <div className="grid grid-cols-3 border-t border-border">
            <div className="relative text-center py-4 px-4">
              <div className="text-2xl tnum font-semibold text-text-primary">
                {studentsError ? "—" : liveStats.connected}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-1">
                Connected
              </div>
            </div>
            <div className="relative text-center py-4 px-4">
              <span className="absolute left-0 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
              <div className="text-2xl tnum font-semibold text-accent-success">
                {studentsError ? "—" : liveStats.active}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-1">Active</div>
            </div>
            <div className="relative text-center py-4 px-4">
              <span className="absolute left-0 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
              <div className="text-2xl tnum font-semibold text-accent-warning">
                {studentsError ? "—" : liveStats.idle}
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
            <Link
              to="/teacher/timetable"
              className="text-xs font-medium text-text-secondary hover:text-text-primary no-underline hover:no-underline transition-colors cursor-pointer"
            >
              Manage Timetable
            </Link>
          )}
        </div>

        {loadingTimetable ? (
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] divide-y divide-border overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pl-4 pr-4 py-3.5 flex items-center gap-4">
                <Skeleton className="w-[100px] h-11 rounded-[var(--radius-md)] shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : timetableError ? (
          <div className="p-6 bg-bg-surface border border-accent-critical/25 rounded-[var(--radius-lg)] text-center space-y-3">
            <p className="text-sm text-text-secondary">Couldn't load today's schedule.</p>
            <button
              type="button"
              onClick={fetchTimetable}
              className="px-4 py-2 bg-accent-700 hover:bg-accent-700/90 text-white text-xs font-medium rounded-[var(--radius-md)] transition-[transform,background-color] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              Try again
            </button>
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
                      <span className="text-xs tnum font-semibold text-text-primary">
                        {entry.start_time.slice(0, 5)}
                      </span>
                      <span className="text-[10px] text-text-muted tnum mt-0.5">
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
                          <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg-base border border-border text-text-muted shrink-0">
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
                            <Bell className="w-3 h-3" /> {defaultDelayMinutes} min alert
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

      <AppTour
        steps={teacherTourSteps}
        run={runTour}
        isManualReplay={isManualReplay}
        onFinish={() => setRunTour(false)}
      />
    </PageShell>
  );
}
