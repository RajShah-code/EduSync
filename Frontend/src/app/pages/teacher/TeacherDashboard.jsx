import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router";
import { Button } from "../../components/ui/button";
import {
  Play,
  Square,
  LayoutDashboard,
  Calendar,
  Clock,
  BookOpen,
  School,
  ArrowRight,
  Loader2,
  Bell,
  Sparkles,
  Plus,
} from "lucide-react";
import { AppTour } from "../../components/AppTour";
import { teacherTourSteps } from "../../tours/teacherTourSteps";

// Empty — will be populated from real sessions
const mockStats = {
  connectedStudents: 0,
  activeStudents: 0,
  idleStudents: 0,
  offlineStudents: 0,
};

const mockRecentActivity = [];

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

      {/* Session Control */}
      <div data-tour="teacher-session" className="p-6 bg-bg-surface border border-border rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {sessionActive ? (sessionInfo?.lectureName || "Active Broadcast Session") : "Lab Session"}
            </h2>
            <p className="text-sm text-text-secondary">
              {sessionActive ? (sessionInfo?.subject || "Broadcasting") : "No active session"}
            </p>
          </div>
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

        {/* Student Overview */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-bg-base rounded border border-border">
            <div className="text-2xl font-mono font-semibold text-text-primary">
              {mockStats.connectedStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              TOTAL CONNECTED
            </div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-accent-success/20">
            <div className="text-2xl font-mono font-semibold text-accent-success">
              {mockStats.activeStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">ACTIVE</div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-accent-warning/20">
            <div className="text-2xl font-mono font-semibold text-accent-warning">
              {mockStats.idleStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">NOT VIEWING</div>
          </div>
          <div className="p-4 bg-bg-base rounded border border-border">
            <div className="text-2xl font-mono font-semibold text-text-muted">
              {mockStats.offlineStudents}
            </div>
            <div className="text-xs text-text-secondary mt-1">OFFLINE</div>
          </div>
        </div>
      </div>

      {/* TODAY'S SCHEDULE WIDGET (Replaces Quick Actions) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
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
          <div className="p-8 bg-bg-surface border border-border rounded-lg flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span className="text-sm">Loading today's schedule...</span>
          </div>
        ) : !hasAnyTimetable ? (
          /* EMPTY STATE 1: No Timetable Configured At All */
          <div className="p-8 bg-bg-surface border border-border rounded-lg text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Set Up Timetable
            </Button>
          </div>
        ) : todayLectures.length === 0 ? (
          /* EMPTY STATE 2: Timetable exists, but zero lectures today */
          <div className="p-6 bg-bg-surface border border-border rounded-lg text-center space-y-1">
            <p className="text-sm font-medium text-text-primary">No lectures scheduled today ({todayName})</p>
            <p className="text-xs text-text-muted">Enjoy your break or review upcoming classes for tomorrow.</p>
          </div>
        ) : (
          /* LECTURE SCHEDULE LIST */
          <div className="space-y-3">
            {todayLectures.map((entry) => {
              const status = getLectureStatus(entry.start_time, entry.end_time);

              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    status === "ACTIVE"
                      ? "bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30"
                      : status === "UPCOMING"
                      ? "bg-bg-surface border-border hover:border-border/80"
                      : "bg-bg-base/60 border-border/50 opacity-65"
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* Time Badge */}
                    <div className="flex flex-col items-center justify-center px-3 py-2 rounded-lg bg-bg-base border border-border min-w-[110px]">
                      <span className="text-xs font-mono font-bold text-text-primary flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        {entry.start_time.slice(0, 5)}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono mt-0.5">
                        to {entry.end_time.slice(0, 5)}
                      </span>
                    </div>

                    {/* Entry Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-text-primary flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-emerald-400" />
                          {entry.subject}
                        </span>

                        {/* Status Badge */}
                        {status === "ACTIVE" && (
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 animate-pulse">
                            ACTIVE NOW
                          </span>
                        )}
                        {status === "UPCOMING" && (
                          <span className="text-[10px] font-medium font-mono px-2 py-0.5 rounded bg-bg-base border border-border text-text-muted">
                            UPCOMING
                          </span>
                        )}
                        {status === "PAST" && (
                          <span className="text-[10px] font-medium font-mono px-2 py-0.5 rounded bg-bg-base border border-border/60 text-text-muted">
                            PAST
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span className="flex items-center gap-1">
                          <School className="w-3.5 h-3.5 text-text-muted" />
                          {entry.class_name || "Class #" + entry.class_id}
                        </span>
                        {entry.reminder_enabled && (
                          <span className="flex items-center gap-1 text-amber-400 text-[11px]">
                            <Bell className="w-3 h-3" /> {entry.reminder_delay_minutes}m alert
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button Column */}
                  <div>
                    {status === "ACTIVE" ? (
                      <Button
                        onClick={() => handleStartActiveLecture(entry)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-950/50 cursor-pointer flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Start Now
                      </Button>
                    ) : status === "UPCOMING" ? (
                      <Button
                        disabled
                        variant="outline"
                        className="text-xs border-border/60 text-text-muted opacity-60 cursor-not-allowed"
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

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Recent Activity
        </h2>
        {mockRecentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-bg-surface border border-border rounded-lg">
            <LayoutDashboard className="w-12 h-12 text-text-muted" />
            <p className="text-base font-medium text-text-primary">
              No activity yet
            </p>
            <p className="text-sm text-text-muted">
              Actions taken during sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            {mockRecentActivity.map((activity, index) => (
              <div
                key={activity.id}
                className={`p-4 flex items-start justify-between ${
                  index !== mockRecentActivity.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {activity.event}
                  </div>
                  <div className="text-sm text-text-secondary mt-0.5">
                    {activity.details}
                  </div>
                </div>
                <div className="text-xs text-text-muted font-mono">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        )}
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
