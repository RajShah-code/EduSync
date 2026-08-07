import { API_BASE_URL } from "../config/api.js";
import { useState, useRef, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Radio,
  Monitor,
  ClipboardList,
  FileText,
  CalendarCheck,
  BarChart3,
  Video,
  Settings,
  LogOut,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../components/ui/utils";
import { initSocket, getSocket, disconnectSocket } from "../store/socket";
import { Toaster } from "sonner";

const navigation = [
  { name: "Dashboard", href: "/teacher", icon: LayoutDashboard },
  { name: "Broadcast", href: "/teacher/broadcast", icon: Radio },
  { name: "Monitor", href: "/teacher/monitor", icon: Monitor },
  { name: "Tasks", href: "/teacher/task/assign", icon: ClipboardList },
  { name: "Exams", href: "/teacher/exam/create", icon: FileText },
  { name: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
  { name: "Analytics", href: "/teacher/analytics", icon: BarChart3 },
  { name: "Recordings", href: "/teacher/recordings", icon: Video },
  { name: "Settings", href: "/teacher/settings", icon: Settings },
];

export function TeacherLayout() {
  const location = useLocation();
  const navigate = useNavigate();

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
        setSessionInfo({
          id: session.id,
          lectureName: session.lecture_name,
          subject: session.subject,
          labRoom: session.lab_room,
          // Password is not stored in plaintext — show placeholder
          password: '(session active — password not shown after refresh)',
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

  return (
    <div className="flex h-screen bg-bg-base">
      {/* Sidebar */}
      <aside
        className="flex flex-col bg-bg-surface"
        style={{
          width: "240px",
          minWidth: "240px",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Brand */}
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="font-semibold text-text-primary"
            style={{ fontSize: "15px", letterSpacing: "-0.01em" }}
          >
            Lab Control
          </div>
          <div
            className="font-mono text-text-muted"
            style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginTop: "2px",
            }}
          >
            Teacher
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 py-3 overflow-y-auto"
          style={{ padding: "12px 8px" }}
        >
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== "/teacher" &&
                location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 py-2 rounded-lg text-sm mb-0.5",
                  isActive ? "nav-active" : "nav-inactive",
                )}
                style={{
                  borderRadius: "8px",
                  fontSize: "13.5px",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div
          className="p-3 space-y-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-text-primary truncate">
              {displayUser.name || "Teacher"}
            </div>
            <div
              className="font-mono text-text-muted truncate"
              style={{ fontSize: "11px" }}
            >
              {displayUser.email || ""}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn-press w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:text-accent-critical transition-std"
            style={{ borderRadius: "8px" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>

        {/* Version */}
        <div
          className="px-5 py-3 font-mono text-text-muted text-center"
          style={{
            fontSize: "11px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          v2.4.1
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

      {/* Attendance Review Modal */}
      {attendanceExceptions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent-warning/10 text-accent-warning">
                  <AlertTriangle className="w-6 h-6" />
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 rounded-lg text-xs font-semibold transition-all"
                  title="Approve all exceptions"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve All
                </button>
                <button
                  onClick={() => handleDecideAll('rejected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-critical/15 hover:bg-accent-critical/25 text-accent-critical border border-accent-critical/30 rounded-lg text-xs font-semibold transition-all"
                  title="Reject all exceptions"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject All
                </button>
                <button
                  onClick={() => { setAttendanceExceptions(null); setExpandedAttendanceId(null); }}
                  className="p-1 hover:bg-bg-base rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
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
                      className="p-3 bg-bg-base border border-border rounded-lg flex flex-col gap-3 cursor-pointer hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 w-full">
                        {/* Left: name + exit count badge */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-text-primary truncate">
                            {exc.student_name}
                          </span>
                          <span className="flex-shrink-0 text-[10px] px-2 py-0.5 bg-accent-warning/10 text-accent-warning rounded-full border border-accent-warning/20 font-mono whitespace-nowrap">
                            {exc.fullscreen_exit_count} exit{exc.fullscreen_exit_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Right: approve / reject buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDecideException(exc.attendance_id, 'approved')}
                            className="p-1.5 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 rounded-lg text-xs font-semibold flex items-center justify-center transition-all"
                            title="Approve Attendance"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDecideException(exc.attendance_id, 'rejected')}
                            className="p-1.5 bg-accent-critical/15 hover:bg-accent-critical/25 text-accent-critical border border-accent-critical/30 rounded-lg text-xs font-semibold flex items-center justify-center transition-all"
                            title="Reject Attendance"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Inline expanded Focus Log History */}
                      {isExpanded && (
                        <div className="border-t border-border/40 pt-3 space-y-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                          {/* Presence + late badges */}
                          <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] px-2 py-0.5 bg-accent-info/10 text-accent-info rounded-full border border-accent-info/20 font-mono">
                              {(exc.presence_percentage * 100).toFixed(0)}% present
                            </span>
                            {exc.minutes_late > 0 && (
                              <span className="text-[10px] px-2 py-0.5 bg-accent-critical/10 text-accent-critical rounded-full border border-accent-critical/20 font-mono">
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
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted/65 flex-shrink-0" />
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
                      "hidden absolute z-20 right-24 top-1/2 -translate-y-1/2 bg-bg-elevated border border-border rounded px-2.5 py-1 text-xs text-text-secondary shadow-lg pointer-events-none whitespace-nowrap",
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
                className="px-4 py-2 bg-bg-base border border-border hover:border-border/80 text-text-primary text-xs font-medium rounded-lg transition-all"
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
