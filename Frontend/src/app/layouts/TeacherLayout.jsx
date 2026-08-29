import { API_BASE_URL } from "../config/api.js";
import { useState, useRef, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { IconLayoutDashboard as LayoutDashboard, IconChalkboardTeacher as ChalkboardTeacher, IconBinoculars as Binoculars, IconClipboard as Clipboard, IconFileCertificate as FileCertificate, IconCalendarCheck as CalendarCheck, IconChartBar as BarChart3, IconVideo as Video, IconCalendarWeek as CalendarWeek, IconSettings as Settings, IconLogout as LogOut, IconCheck as Check, IconX as X, IconAlertTriangle as AlertTriangle, IconSchool as GraduationCap, IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { cn } from "../components/ui/utils";
import { initSocket, getSocket, disconnectSocket } from "../store/socket";
import { Toaster } from "../components/ui/sonner";

const navigation = [
  { name: "Dashboard", href: "/teacher", icon: LayoutDashboard, dataTour: "teacher-dashboard-link" },
  { name: "Live Lecture", href: "/teacher/broadcast", icon: ChalkboardTeacher, dataTour: "teacher-broadcast-link" },
  { name: "Monitor", href: "/teacher/monitor", icon: Binoculars, dataTour: "teacher-monitor-link" },
  { name: "Tasks", href: "/teacher/task/assign", icon: Clipboard, dataTour: "teacher-task-link" },
  { name: "Exams", href: "/teacher/exam/create", icon: FileCertificate, dataTour: "teacher-exam-link" },
  { name: "Timetable", href: "/teacher/timetable", icon: CalendarWeek, dataTour: "teacher-timetable-link" },
  { name: "Attendance", href: "/teacher/attendance", icon: CalendarCheck, dataTour: "teacher-attendance-link" },
  { name: "Analytics", href: "/teacher/analytics", icon: BarChart3, dataTour: "teacher-analytics-link" },
  { name: "Recordings", href: "/teacher/recordings", icon: Video, dataTour: "teacher-recordings-link" },
  { name: "Settings", href: "/teacher/settings", icon: Settings, dataTour: "teacher-settings-link" },
];

export function TeacherLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Marks the document as "inside a dashboard shell" so html/body suppress
  // their own scroll (see theme.css's html.app-shell-active rule) — every
  // scroll region in here is one of this layout's own internal containers.
  // Must be scoped to this class, not a bare html/body rule, since routes
  // outside this layout (LandingPage, Login) rely on normal document scroll.
  useEffect(() => {
    document.documentElement.classList.add("app-shell-active");
    return () => document.documentElement.classList.remove("app-shell-active");
  }, []);

  // Mirrors the [data-role] scope onto <body> so role-accent CSS variables
  // (--accent-500, --ring, --primary, ...) still resolve correctly inside
  // Radix Dialog/AlertDialog content, which portals to document.body and
  // would otherwise sit outside the [data-role="teacher"] wrapper div and
  // fall back to :root's default (student orange).
  useEffect(() => {
    document.body.setAttribute("data-role", "teacher");
    return () => document.body.removeAttribute("data-role");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("edusync_token");
    localStorage.removeItem("edusync_user");
    disconnectSocket();
    navigate("/");
  };

  const [displayUser, setDisplayUser] = useState(() =>
    JSON.parse(localStorage.getItem("edusync_user") || "{}")
  );

  useEffect(() => {
    const refresh = () => setDisplayUser(JSON.parse(localStorage.getItem("edusync_user") || "{}"));
    window.addEventListener("edusync:user-updated", refresh);
    return () => window.removeEventListener("edusync:user-updated", refresh);
  }, []);

  // ── Lifted Broadcast State ──────────────────────────────────────────────────
  const [broadcastState, setBroadcastState] = useState("idle");
  const [recordingState, setRecordingState] = useState("off");
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [attendanceExceptions, setAttendanceExceptions] = useState(null);
  const [expandedAttendanceId, setExpandedAttendanceId] = useState(null);

  // Sidebar sub-nav (Monitor + Tasks) — only surfaced while a lecture is
  // live. Auto-expands each time a session goes live; the chevron on the
  // "Live Lecture" row lets the teacher collapse/expand it mid-session.
  const [subNavExpanded, setSubNavExpanded] = useState(true);
  useEffect(() => {
    if (broadcastState === "live") setSubNavExpanded(true);
  }, [broadcastState]);

  // Client-side authentication guard & Socket initialization
  useEffect(() => {
    const token = localStorage.getItem("edusync_token");
    const userStr = localStorage.getItem("edusync_user");
    if (!token || !userStr) {
      localStorage.removeItem("edusync_token");
      localStorage.removeItem("edusync_user");
      navigate("/login");
      return;
    }
    try {
      const user = JSON.parse(userStr);
      if (user.role !== "teacher") {
        localStorage.removeItem("edusync_token");
        localStorage.removeItem("edusync_user");
        navigate("/login");
        return;
      }
      initSocket(token);
    } catch {
      localStorage.removeItem("edusync_token");
      localStorage.removeItem("edusync_user");
      navigate("/login");
      return;
    }
  }, [navigate]);

  // Listen for attendance exceptions at session end
  useEffect(() => {
    let socket = getSocket();
    let cleanup = null;

    const setupListener = (s) => {
      const handleExceptions = (payload) => {
        console.log("[Socket] Received attendance exceptions:", payload);
        setAttendanceExceptions(payload);
      };
      s.on("teacher:attendance_exceptions", handleExceptions);
      return () => {
        s.off("teacher:attendance_exceptions", handleExceptions);
      };
    };

    if (socket) {
      cleanup = setupListener(socket);
    } else {
      const interval = setInterval(() => {
        const s = getSocket();
        if (s) {
          clearInterval(interval);
          cleanup = setupListener(s);
        }
      }, 500);
      return () => {
        clearInterval(interval);
        if (cleanup) cleanup();
      };
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Active broadcast content mode:
  //   'screen'  — students see the teacher's WebRTC screen share
  //   'editor'  — students see the live code editor synced via editor:sync
  // Default is 'editor' — teacher can switch to screen share at any time.
  const [activeMode, setActiveMode] = useState('editor');
  // Editor live-sync status — independent of broadcastState.
  //   'live'   — every keystroke is synced to students (200ms debounce)
  //   'paused' — teacher edits privately; students frozen on last synced state
  const [editorLiveStatus, setEditorLiveStatus] = useState('live');

  const sessionIntervalRef = useRef(null);
  const recordingIntervalRef = useRef(null);



  // BUG 4 FIX: On mount, check if this teacher already has an active session in
  // the database (ended_at IS NULL). If so, rehydrate broadcastState to 'live'
  // and restore sessionInfo + elapsed time so the teacher's UI correctly reflects
  // the running session instead of showing "no active session" after a refresh.
  // Note: peerConnectionsRef is in-memory and is lost on refresh — the teacher
  // will need to resume screen sharing manually (a WebRTC reconnect-after-refresh
  // flow is a separate future task). This fix only ensures the UI is correct.
  useEffect(() => {
    const token = localStorage.getItem("edusync_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/sessions/my-active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(({ session }) => {
        if (!session) return; // No active session — proceed with idle state
        // Rehydrate: compute elapsed seconds from started_at to now
        const elapsedSeconds = Math.floor(
          (Date.now() - new Date(session.started_at).getTime()) / 1000
        );
        // Password is never returned by the API (not stored in plaintext server-side).
        // The only way to recover it after a refresh is a client-side cache written
        // at creation time in LiveBroadcast.jsx's handleStartBroadcast — this
        // survives a page reload (sessionStorage) but not a closed tab or a
        // different device, where the placeholder is the best we can do.
        const cachedPassword = sessionStorage.getItem(`edusync_session_password_${session.id}`);
        setSessionInfo({
          id: session.id,
          lectureName: session.lecture_name,
          subject: session.subject,
          labRoom: session.lab_room,
          password: cachedPassword || '(session active — password not shown after refresh)',
          started_at: session.started_at,
          class_ids: session.class_ids,
        });
        setSessionSeconds(elapsedSeconds);
        setBroadcastState('live');
      })
      .catch(() => {
        // Silently ignore — rehydration is best-effort. If this fails,
        // the teacher sees idle state (which is wrong but safe).
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timers
  useEffect(() => {
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }

    if (broadcastState === "live") {
      sessionIntervalRef.current = setInterval(() => {
        setSessionSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current);
        sessionIntervalRef.current = null;
      }
    };
  }, [broadcastState]);

  useEffect(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (recordingState === "recording") {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    };
  }, [recordingState]);

  useEffect(() => {
    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  const handleDecideException = async (attendanceId, decision) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/attendance/${attendanceId}/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setAttendanceExceptions((prev) => {
          if (!prev) return null;
          const updated = prev.exceptions.filter((e) => e.attendance_id !== attendanceId);
          if (updated.length === 0) return null;
          return { ...prev, exceptions: updated };
        });
        if (expandedAttendanceId === attendanceId) {
          setExpandedAttendanceId(null);
        }
      }
    } catch (err) {
      console.error("[TeacherLayout] Decision submission failed:", err);
    }
  };

  const handleDecideAll = async (decision) => {
    if (!attendanceExceptions?.exceptions?.length) return;
    const ids = attendanceExceptions.exceptions.map((e) => e.attendance_id);
    await Promise.all(ids.map((id) => handleDecideException(id, decision)));
  };

  const formatDuration = (secs) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  };

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const teacherInitials = (displayUser.name || "Teacher")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-bg-base" data-role="teacher">
      {/* Sidebar — 3 distinct rounded blocks (brand / nav / user), tight gap
          between them, rather than one continuous panel with dividers. */}
      <aside className="w-16 min-w-16 md:w-[230px] md:min-w-[230px] flex flex-col gap-2 p-2 bg-bg-base transition-all duration-200">
        {/* Brand */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface px-3 md:px-4 py-3.5 flex items-center gap-2.5 justify-center md:justify-start shrink-0">
          <div
            className="w-[26px] h-[26px] rounded-lg shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(155deg, var(--accent-700), color-mix(in srgb, var(--accent-700) 55%, var(--bg-base)))" }}
          >
            <GraduationCap className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <span className="font-display font-semibold text-text-primary text-[14.5px] tracking-tight hidden md:inline">
            EduSync
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 rounded-[var(--radius-lg)] border border-border bg-bg-surface p-2 md:p-2.5 space-y-0.5 overflow-y-auto">
          {(() => {
            const isSub = (name) => name === "Monitor" || name === "Tasks";
            const subNavShown = broadcastState === "live" && subNavExpanded;

            const renderLink = (item) => {
              const isActive =
                location.pathname === item.href ||
                (item.href !== "/teacher" &&
                  location.pathname.startsWith(item.href));

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  data-tour={item.dataTour}
                  title={item.name}
                  className={cn(
                    "flex items-center gap-2.5 pr-3 py-2 text-[13px] rounded-[var(--radius-md)] justify-center md:justify-start",
                    isActive ? "nav-active" : "nav-inactive"
                  )}
                >
                  <item.icon className="nav-icon w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              );
            };

            return navigation.map((item) => {
              // Monitor + Tasks render inside the collapsible group that follows
              // the "Live Lecture" row — skip them in the flat pass. They stay
              // mounted (kept in the DOM so the Phase 27 tour's data-tour targets
              // survive) but collapse to zero height when no session is live or
              // the teacher collapses them via the chevron.
              if (isSub(item.name)) return null;

              if (item.name === "Live Lecture") {
                return (
                  <div key={item.name}>
                    <div className="relative">
                      {renderLink(item)}
                      {broadcastState === "live" && (
                        <button
                          type="button"
                          onClick={() => setSubNavExpanded((v) => !v)}
                          aria-expanded={subNavExpanded}
                          aria-label={
                            subNavExpanded
                              ? "Collapse live session links"
                              : "Expand live session links"
                          }
                          className="btn-press hidden md:flex absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:bg-bg-surface-3 transition-std"
                        >
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 transition-transform duration-200",
                              !subNavExpanded && "-rotate-90"
                            )}
                          />
                        </button>
                      )}
                    </div>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        subNavShown
                          ? "max-h-24 opacity-100"
                          : "max-h-0 opacity-0 pointer-events-none"
                      )}
                    >
                      <div className="space-y-0.5 pt-0.5 md:pl-3">
                        {navigation.filter((n) => isSub(n.name)).map(renderLink)}
                      </div>
                    </div>
                  </div>
                );
              }

              return renderLink(item);
            });
          })()}
        </nav>

        {/* User info & Actions */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-2 md:p-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2.5 px-1 py-1">
            <div className="w-7 h-7 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-[10.5px] font-semibold text-text-secondary shrink-0">
              {teacherInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary truncate">
                {displayUser.name || "Teacher"}
              </div>
              <div className="text-[10.5px] text-text-muted truncate">
                {displayUser.email || "Teacher"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="btn-press w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 transition-std shrink-0"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* Collapsed (mobile) — icon-only logout, name/avatar hidden */}
          <button
            onClick={handleLogout}
            title="Logout"
            className="btn-press md:hidden w-full flex items-center justify-center py-2 text-text-secondary hover:text-accent-critical hover:bg-accent-critical/10 rounded-lg transition-std"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page content */}
        <main className="flex-1 overflow-auto page-enter">
          <Outlet context={{
            broadcastState,
            setBroadcastState,
            recordingState,
            setRecordingState,
            sessionInfo,
            setSessionInfo,
            sessionSeconds,
            setSessionSeconds,
            recordingSeconds,
            setRecordingSeconds,
            activeMode,
            setActiveMode,
            editorLiveStatus,
            setEditorLiveStatus,
          }} />
        </main>
        <Toaster position="top-right" richColors />
      </div>

      {/* Attendance Review Modal — the post-session prompt for exceptions */}
      {attendanceExceptions && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-modal)] max-w-2xl w-full max-h-[85vh] flex flex-col p-6 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-[var(--radius-md)] bg-accent-warning/10 text-accent-warning">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Attendance Review Required
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {attendanceExceptions.exceptions.length} student{attendanceExceptions.exceptions.length !== 1 ? 's' : ''} need review — hover a row for details.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Bulk action buttons */}
                <button
                  onClick={() => handleDecideAll('approved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  title="Approve all exceptions"
                >
                  <Check className="w-4 h-4" />
                  Approve All
                </button>
                <button
                  onClick={() => handleDecideAll('rejected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-critical/15 hover:bg-accent-critical/25 text-accent-critical border border-accent-critical/30 rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  title="Reject all exceptions"
                >
                  <X className="w-4 h-4" />
                  Reject All
                </button>
                <button
                  onClick={() => { setAttendanceExceptions(null); setExpandedAttendanceId(null); }}
                  className="p-1 hover:bg-bg-base rounded-[var(--radius-md)] text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-[22px] h-[22px]" />
                </button>
              </div>
            </div>

            {/* List — collapsed rows with hover-to-reveal detail */}
            <div className="flex-1 overflow-y-auto my-4 space-y-2 pr-1">
              {attendanceExceptions.exceptions.map((exc) => {
                const isExpanded = expandedAttendanceId === exc.attendance_id;
                return (
                  <div
                    key={exc.attendance_id}
                    className="group relative"
                  >
                    {/* Default collapsed/expandable row */}
                    <div
                      onClick={() => setExpandedAttendanceId(isExpanded ? null : exc.attendance_id)}
                      className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)] flex flex-col gap-3 cursor-pointer hover:border-border-hover transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 w-full">
                        {/* Left: name + exit count badge */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-text-primary truncate">
                            {exc.student_name}
                          </span>
                          <span className="flex-shrink-0 text-[10px] px-2 py-0.5 bg-accent-warning/10 text-accent-warning rounded-[var(--radius-pill)] border border-accent-warning/20 font-mono whitespace-nowrap">
                            {exc.fullscreen_exit_count} exit{exc.fullscreen_exit_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Right: approve / reject buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDecideException(exc.attendance_id, 'approved')}
                            className="p-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 rounded-[var(--radius-md)] text-xs font-semibold flex items-center justify-center transition-colors"
                            title="Approve Attendance"
                          >
                            <Check className="w-[18px] h-[18px]" />
                          </button>
                          <button
                            onClick={() => handleDecideException(exc.attendance_id, 'rejected')}
                            className="p-1.5 bg-accent-critical/15 hover:bg-accent-critical/25 text-accent-critical border border-accent-critical/30 rounded-[var(--radius-md)] text-xs font-semibold flex items-center justify-center transition-colors"
                            title="Reject Attendance"
                          >
                            <X className="w-[18px] h-[18px]" />
                          </button>
                        </div>
                      </div>

                      {/* Inline expanded Focus Log History */}
                      {isExpanded && (
                        <div className="border-t border-border pt-3 space-y-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                          {/* Presence + late badges */}
                          <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] px-2 py-0.5 bg-accent-info/10 text-accent-info rounded-[var(--radius-pill)] border border-accent-info/20 font-mono">
                              {(exc.presence_percentage * 100).toFixed(0)}% present
                            </span>
                            {exc.minutes_late > 0 && (
                              <span className="text-[10px] px-2 py-0.5 bg-accent-critical/10 text-accent-critical rounded-[var(--radius-pill)] border border-accent-critical/20 font-mono">
                                {exc.minutes_late} min late
                              </span>
                            )}
                          </div>

                          <div>
                            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                              Focus Log History
                            </span>
                            {exc.fullscreen_exit_log && exc.fullscreen_exit_log.length > 0 ? (
                              <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                {(exc.fullscreen_exit_log || []).map((log, index) => (
                                  <li key={index} className="text-xs text-text-muted font-mono flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted flex-shrink-0" />
                                    Left at {formatTime(log.exited_at)} for {formatDuration(log.duration_seconds || 0)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-xs text-text-muted italic">No fullscreen exits logged.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Hover-reveal compact tooltip — absolutely positioned relative to row container */}
                    <div className={cn(
                      "hidden absolute z-20 right-24 top-1/2 -translate-y-1/2 bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-2.5 py-1 text-xs text-text-secondary pointer-events-none whitespace-nowrap",
                      isExpanded ? "hidden" : "group-hover:block"
                    )}>
                      {(exc.presence_percentage * 100).toFixed(0)}% present • {exc.fullscreen_exit_count} exit{exc.fullscreen_exit_count !== 1 ? 's' : ''}
                      {exc.minutes_late > 0 && ` • ${exc.minutes_late}m late`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-border pt-4 flex justify-end">
              <button
                onClick={() => { setAttendanceExceptions(null); setExpandedAttendanceId(null); }}
                className="px-4 py-2 bg-bg-base border border-border hover:border-border-hover text-text-primary text-xs font-medium rounded-[var(--radius-md)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
