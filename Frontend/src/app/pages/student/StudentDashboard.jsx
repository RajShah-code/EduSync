import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Button } from "../../components/ui/button";
import { IconFileText as FileText, IconClock as Clock, IconCalendar as Calendar, IconWifiOff as WifiOff, IconBook as BookOpen, IconUser as User, IconChalkboard as School } from "@tabler/icons-react";
import { cn } from "../../components/ui/utils";
import { getSocket } from "../../store/socket";
import { toast } from "sonner";
import { AppTour } from "../../components/AppTour";
import { studentTourSteps } from "../../tours/studentTourSteps";
import PageShell from "../../components/PageShell";
import { formatClockString } from "../../utils/timeFormat";

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

/**
 * Formats a "HH:MM:SS" / "HH:MM" clock string for display, following the
 * user's Time format setting — 24-hour "HH:MM" (default) or 12-hour
 * "H:MM AM/PM". Name/signature kept; it no longer hard-forces AM/PM.
 */
function formatTime12h(timeStr) {
  if (!timeStr) return "";
  return formatClockString(timeStr);
}

/**
 * Formats minutes-until as a compact countdown, e.g. "starts in 12m" / "starts in 1h 5m"
 */
function formatStartsIn(startTimeStr) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = parseTimeToMinutes(startTimeStr) - currentMinutes;
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `starts in ${h}h ${m}m` : `starts in ${m}m`;
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setShowJoinModal, hasJoinedSession, activeSessions, joinedSession, wasKicked, setWasKicked } = useOutletContext();

  const [attendance, setAttendance] = useState([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [attendanceError, setAttendanceError] = useState(false);
  const [exams, setExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // Timetable State
  const [timetableData, setTimetableData] = useState({ entries: [], today_day_of_week: 0, class_assigned: true });
  const [loadingTimetable, setLoadingTimetable] = useState(true);

  const [runTour, setRunTour] = useState(false);
  const [isManualReplay, setIsManualReplay] = useState(false);

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

  // Fetch student timetable on mount
  useEffect(() => {
    const fetchTimetable = async () => {
      const token = localStorage.getItem("edusync_token");
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/student-timetable/schedule`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTimetableData({
            entries: data.entries || [],
            today_day_of_week: data.today_day_of_week ?? 0,
            class_assigned: data.class_assigned ?? true,
          });
        }
      } catch (err) {
        console.error("Failed to load student timetable:", err);
      } finally {
        setLoadingTimetable(false);
      }
    };

    fetchTimetable();
  }, []);

  // Fetch available exams on mount & socket triggers
  useEffect(() => {
    const fetchAvailableExams = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/exams/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setExams(data.exams || []);
        }
      } catch (err) {
        console.error("Failed to fetch available exams:", err);
      } finally {
        setLoadingExams(false);
      }
    };
    fetchAvailableExams();

    let socket = getSocket();
    const handleRefresh = () => {
      fetchAvailableExams();
    };

    const setupListener = (s) => {
      s.on("exam:opened", handleRefresh);
      s.on("exam:start", handleRefresh);
      return () => {
        s.off("exam:opened", handleRefresh);
        s.off("exam:start", handleRefresh);
      };
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
  }, []);

  // Fetch student attendance on mount
  useEffect(() => {
    const fetchAttendance = async () => {
      setLoadingAttendance(true);
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) {
          setAttendanceError(true);
          return;
        }

        const payload = JSON.parse(atob(token.split(".")[1]));
        const studentId = payload.id;
        if (!studentId) {
          setAttendanceError(true);
          return;
        }

        const res = await fetch(`${API_BASE_URL}/attendance/student/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAttendance(data.records || []);
          setTotalSessions(data.totalLectures || 0);
          setAttendanceError(false);
        } else {
          setAttendanceError(true);
        }
      } catch (err) {
        console.error(err);
        setAttendanceError(true);
      } finally {
        setLoadingAttendance(false);
      }
    };
    fetchAttendance();

    let socket = getSocket();
    const setupListener = (s) => {
      s.on("session:ended", fetchAttendance);
      return () => s.off("session:ended", fetchAttendance);
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
  }, []);

  const presentCount = attendance.filter((a) => a.status === "present").length;
  const stats = {
    total: totalSessions,
    present: presentCount,
    rate: totalSessions > 0 ? ((presentCount / totalSessions) * 100).toFixed(1) : "0.0",
  };

  const todayDayOfWeek = timetableData.today_day_of_week;
  const todayName = DAY_NAMES[todayDayOfWeek] || "Today";
  const todayLectures = (timetableData.entries || [])
    .filter((e) => Number(e.day_of_week) === todayDayOfWeek)
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  const activeExams = exams.filter((exam) => exam.status === "active");
  const waitingRoomExams = exams.filter((exam) => exam.status === "waiting_room");
  const hasActiveExam = activeExams.length > 0;

  const handleJoinExam = async (examId) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to join exam");
      }
      // Joins the exam_waiting:<id> socket room so the teacher's live
      // waiting-room count (ExamCreation.jsx Step 3) stays accurate.
      const socket = getSocket();
      if (socket) socket.emit("exam:join_waiting_room", { examId });
      navigate(`/student/exam/${examId}`);
    } catch (err) {
      toast.error(err.message);
      try {
        const token = localStorage.getItem("edusync_token");
        const refreshRes = await fetch(`${API_BASE_URL}/exams/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setExams(data.exams || []);
        }
      } catch (refreshErr) {
        console.error("Failed to refresh exams list:", refreshErr);
      }
    }
  };

  return (
    <PageShell>
      {/* Kick banner — shown when instructor ended the session the student was in */}
      {wasKicked && (
        <div className="px-4 py-3 bg-bg-surface border border-accent-critical/40 rounded-[var(--radius-md)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-critical" />
            <span className="text-sm text-text-primary">
              Your session was ended by the instructor.
            </span>
          </div>
          <button
            onClick={() => setWasKicked(false)}
            className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* HERO — Today's Schedule, with live-broadcast status folded into the   */}
      {/* header. This is the page's primary focus.                             */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Card className="bg-bg-surface border-border">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="font-display text-[length:var(--text-lg)] font-semibold text-text-primary flex items-center gap-2">
              <Calendar className="w-[22px] h-[22px] text-accent-500" strokeWidth={1.75} />
              Today's Schedule
              <span className="text-text-muted font-normal">— {todayName}</span>
            </CardTitle>

            {activeSessions.length > 0 ? (
              <button
                onClick={() => navigate('/student/sessions')}
                className="flex items-center gap-2 text-xs cursor-pointer group rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent-live pulse-dot" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-live" />
                </span>
                <span className="font-medium text-text-primary">
                  {activeSessions.length} live {activeSessions.length === 1 ? 'session' : 'sessions'}
                </span>
                <span className="text-accent-500 group-hover:underline">View →</span>
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <WifiOff className="w-4 h-4" strokeWidth={1.75} />
                No live sessions
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingTimetable ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="pl-3 pr-3 py-2.5 border-l-2 border-l-border space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : !timetableData.class_assigned ? (
            <div className="py-6 text-center">
              <p className="text-xs text-text-secondary">
                You're not yet assigned to a class — contact your admin
              </p>
            </div>
          ) : todayLectures.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-text-secondary">
                No lectures scheduled today.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {todayLectures.map((entry) => {
                const status = getLectureStatus(entry.start_time, entry.end_time);
                const startsIn = status === "UPCOMING" ? formatStartsIn(entry.start_time) : "";

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "pl-3 pr-3 py-2.5 border-l-2 flex items-center justify-between gap-4 transition-colors",
                      status === "ACTIVE" && "border-l-accent-live bg-bg-elevated rounded-r-[var(--radius-sm)]",
                      status === "UPCOMING" && "border-l-border",
                      status === "PAST" && "border-l-border opacity-50"
                    )}
                  >
                    {/* Screen reader cue */}
                    <span className="sr-only">
                      {status === "PAST" ? "Past lecture" : status === "ACTIVE" ? "Active lecture" : "Upcoming lecture"}
                    </span>

                    {/* Left: Lecture Details */}
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {status === "ACTIVE" && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-live pulse-dot" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-live" />
                          </span>
                        )}
                        <span className="text-sm font-medium text-text-primary flex items-center gap-2 truncate">
                          <BookOpen className="w-[18px] h-[18px] text-text-muted shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{entry.subject}</span>
                        </span>
                        {entry.session_type === "lab" && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">
                            LAB
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary truncate pl-0">
                        <span className="flex items-center gap-1.5 truncate">
                          <User className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{entry.teacher_name}</span>
                        </span>
                        {entry.room && (
                          <span className="flex items-center gap-1.5 shrink-0">
                            <School className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
                            {entry.room}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Time Range */}
                    <div className="shrink-0 text-right space-y-0.5">
                      <div className="text-xs tnum font-medium text-text-secondary">
                        {formatTime12h(entry.start_time)} – {formatTime12h(entry.end_time)}
                      </div>
                      {startsIn && (
                        <div className="text-[10px] tnum text-text-muted">{startsIn}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECONDARY ROW — Exams, Attendance, Submissions. Calm, equal weight.   */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Dedicated Exams Card */}
        <Card
          data-tour="student-exams"
          className={cn(
            "h-full flex flex-col justify-between",
            hasActiveExam
              ? "bg-accent-success/[0.03] border-accent-success/30"
              : "bg-bg-surface border-border"
          )}
        >
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-text-primary flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-[18px] h-[18px] text-text-secondary" />
                Exams
              </span>
              {hasActiveExam && <Badge variant="success">ACTIVE NOW</Badge>}
              {!hasActiveExam && waitingRoomExams.length > 0 && <Badge variant="warning">WAITING ROOM</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            {loadingExams ? (
              <div className="space-y-2 my-auto">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ) : hasActiveExam ? (
              <div className="space-y-4 my-auto">
                {activeExams.map((exam) => (
                  <div key={exam.id} className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {exam.title}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {exam.time_limit_minutes} minutes duration • Immediate access
                      </p>
                    </div>

                    <Button
                      onClick={() => navigate(`/student/exam/${exam.id}`)}
                      className="bg-accent-700 hover:bg-accent-700/90 text-white font-semibold text-xs"
                    >
                      Enter Exam
                    </Button>
                  </div>
                ))}
              </div>
            ) : waitingRoomExams.length > 0 ? (
              <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)] flex items-center justify-between my-auto">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-text-primary">
                    {waitingRoomExams[0].title}
                  </div>
                  <div className="text-xs text-text-secondary">Waiting room is open</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleJoinExam(waitingRoomExams[0].id)}
                  className="bg-accent-warning hover:bg-accent-warning/90 text-black font-semibold text-xs"
                >
                  Join
                </Button>
              </div>
            ) : (
              <div className="py-6 text-center space-y-2 my-auto">
                <Clock className="w-[22px] h-[22px] text-text-muted mx-auto" strokeWidth={1.75} />
                <p className="text-xs text-text-secondary">No active or upcoming exams.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance Card */}
        <Card data-tour="student-attendance" className="bg-bg-surface border-border h-full flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Calendar className="w-[18px] h-[18px] text-text-secondary" />
              Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            {loadingAttendance ? (
              <div className="grid grid-cols-3 gap-3 p-3 bg-bg-base border border-border rounded-[var(--radius-md)]">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-1.5 flex flex-col items-center">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-6 w-8" />
                  </div>
                ))}
              </div>
            ) : attendanceError ? (
              <div className="p-3 bg-bg-base border border-accent-critical/25 rounded-[var(--radius-md)] text-center">
                <p className="text-xs text-accent-critical">Couldn't load your attendance.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 p-3 bg-bg-base border border-border rounded-[var(--radius-md)] text-center">
                <div>
                  <div className="text-[10px] text-text-secondary mb-1">Present</div>
                  <div className="text-lg tnum font-semibold text-accent-success">
                    {stats.present}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-secondary mb-1">Sessions</div>
                  <div className="text-lg tnum font-semibold text-text-primary">
                    {stats.total}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-secondary mb-1">Rate</div>
                  <div className="text-lg tnum font-semibold text-text-primary">
                    {stats.rate}%
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => navigate("/student/attendance")}
              className="w-full text-xs"
            >
              View History
            </Button>
          </CardContent>
        </Card>

        {/* Recent Submissions Card */}
        <Card className="bg-bg-surface border-border flex flex-col h-full justify-between">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <FileText className="w-[18px] h-[18px] text-text-secondary" />
              Recent Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
              <FileText className="w-9 h-9 text-text-muted" strokeWidth={1.75} />
              <h3 className="text-sm font-medium text-text-primary">
                No recent submissions
              </h3>
              <p className="text-xs text-text-secondary">
                Your submitted tasks will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AppTour
        steps={studentTourSteps}
        run={runTour}
        isManualReplay={isManualReplay}
        onFinish={() => setRunTour(false)}
      />
    </PageShell>
  );
}
