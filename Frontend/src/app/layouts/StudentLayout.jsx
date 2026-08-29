import { API_BASE_URL } from "../config/api.js";
import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { IconHome as Home, IconCalendarCheck as CalendarCheck, IconLogout as LogOut, IconEye as Eye, IconEyeOff as EyeOff, IconBroadcast as Radio, IconCode as Code, IconFileText as FileText, IconMail as Mail, IconSettings as Settings, IconSchool as GraduationCap } from "@tabler/icons-react";
import { cn } from "../components/ui/utils";
import { sessionStore } from "../store/sessionStore"; // kept in place but no longer source of truth
import { initSocket, getSocket, disconnectSocket } from "../store/socket";
import { StatusBadge } from "../components/StatusBadge";
import { ElapsedTimer } from "../components/Timer";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Toaster } from "../components/ui/sonner";

const navigation = [
  { name: "Dashboard", href: "/student", icon: Home, dataTour: "student-dashboard-link" },
  { name: "Live Sessions", href: "/student/sessions", icon: Radio, dataTour: "student-sessions-link" },
  { name: "Email Me", href: "/student/email-folder", icon: Mail, dataTour: "student-email-folder-link" },
  { name: "Attendance", href: "/student/attendance", icon: CalendarCheck, dataTour: "student-attendance-link" },
  { name: "Settings", href: "/student/settings", icon: Settings, dataTour: "student-settings-link" },
];


export function StudentLayout() {
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
  // would otherwise sit outside the [data-role="student"] wrapper div and
  // fall back to :root's default.
  useEffect(() => {
    document.body.setAttribute("data-role", "student");
    return () => document.body.removeAttribute("data-role");
  }, []);

  const [activeExam, setActiveExam] = useState(null); // { examId, title } | null

  // Check for currently active exam on mount
  useEffect(() => {
    const checkActiveExam = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/exams/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const active = (data.exams || []).find((e) => e.status === "active");
          if (active) {
            setActiveExam({ examId: active.id, title: active.title });
          }
        }
      } catch (err) {
        console.error("Error fetching available exams:", err);
      }
    };
    checkActiveExam();
  }, []);

  // All running sessions (global)
  const [activeSessions, setActiveSessions] = useState([]);
  // The specific session this student has joined — persisted in sessionStorage
  const [joinedSession, setJoinedSessionState] = useState(() => {
    try {
      const stored = sessionStorage.getItem("edusync_joined_session");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setJoinedSession = (session) => {
    if (session) {
      sessionStorage.setItem("edusync_joined_session", JSON.stringify(session));
    } else {
      sessionStorage.removeItem("edusync_joined_session");
    }
    setJoinedSessionState(session);
  };

  // The session the student clicked "Join" on — passed to modal
  const [selectedSession, setSelectedSession] = useState(null);

  const [hasJoinedSession, setHasJoinedSession] = useState(() => {
    try {
      return !!sessionStorage.getItem("edusync_joined_session");
    } catch {
      return false;
    }
  });
  const [wasKicked, setWasKicked] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // ── Rejoin approval state ───────────────────────────────────────────────────
  // 'idle'     — not in a rejoin flow
  // 'waiting'  — student:rejoin_pending received; teacher has been notified
  // 'approved' — teacher:approve_rejoin; proceed into session normally
  // 'denied'   — teacher:deny_rejoin; show denial message
  const [rejoinStatus, setRejoinStatus] = useState("idle");
  // rejoinCount: current attempt number sent by server (2 = 2nd join, 3 = 3rd, etc.)
  // Used to show "Waiting for instructor to approve your rejoin (attempt #N)" to the student.
  const [rejoinCount, setRejoinCount] = useState(0);

  // Cached one-time join-response snapshot (mode, code, language, output)
  const [sessionStateCache, setSessionStateCache] = useState(null);

  const [displayUser, setDisplayUser] = useState(() =>
    JSON.parse(localStorage.getItem("edusync_user") || "{}")
  );

  useEffect(() => {
    const refresh = () => setDisplayUser(JSON.parse(localStorage.getItem("edusync_user") || "{}"));
    window.addEventListener("edusync:user-updated", refresh);
    return () => window.removeEventListener("edusync:user-updated", refresh);
  }, []);

  // Keep a ref to joinedSession so the socket handler always has the latest value
  // without needing to re-register listeners on every render
  const joinedSessionRef = useRef(joinedSession);
  useEffect(() => {
    joinedSessionRef.current = joinedSession;
  }, [joinedSession]);

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
      if (user.role !== "student") {
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

  // Initial fetch + real-time socket listeners
  useEffect(() => {
    const fetchOnce = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/sessions/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setActiveSessions(data.sessions || []);
      } catch {}
    };
    fetchOnce();

    const socket = getSocket();
    if (!socket) return;

    socket.on("session:started", ({ session }) => {
      setActiveSessions((prev) => {
        const exists = prev.find((s) => s.id === session.id);
        if (exists) return prev;
        return [session, ...prev];
      });
    });

    // Single session:ended handler — combines activeSessions update + kick check
    socket.on("session:ended", ({ session_id }) => {
      setActiveSessions((prev) => prev.filter((s) => s.id !== session_id));
      // Check if the ended session is the one this student joined
      if (joinedSessionRef.current && joinedSessionRef.current.id === session_id) {
        setJoinedSession(null);
        setHasJoinedSession(false);
        setWasKicked(true);
        navigate("/student");
      }
    });

    // ── Rejoin approval socket listeners ────────────────────────────────────
    // student:rejoin_pending — server held the join; teacher must approve.
    // Show the waiting overlay in LiveSession.jsx via context.
    socket.on("student:rejoin_pending", ({ rejoin_count }) => {
      setRejoinStatus("waiting");
      setRejoinCount(rejoin_count ?? 0);
    });

    // student:rejoin_approved — teacher allowed the student back.
    // LiveSession.jsx sees rejoinStatus === 'approved' and proceeds normally
    // (requests fullscreen, shows session UI, etc.).
    socket.on("student:rejoin_approved", () => {
      setRejoinStatus("approved");
    });

    // student:rejoin_denied — teacher rejected the rejoin.
    // LiveSession.jsx shows a denial message with a "Return to dashboard" button.
    // Reset join state so the student is back to the pre-join baseline.
    socket.on("student:rejoin_denied", () => {
      setRejoinStatus("denied");
      setRejoinCount(0);
    });

    socket.on("student:session_state", (payload) => {
      console.log("[StudentLayout] Caching student:session_state:", payload);
      setSessionStateCache(payload);
    });

     socket.on("task:assigned", ({ task }) => {
      console.log("[StudentLayout] task:assigned received:", task);
      toast.info(`New Task Assigned: ${task.title}`, {
        description: task.description || "A new task has been assigned by the instructor.",
        duration: 5000,
      });
      // Switch view state / redirect automatically to task page
      navigate(`/student/task/${task.id}`);
    });

    socket.on("task:closed", ({ task_id }) => {
      console.log("[StudentLayout] task:closed received for task:", task_id);
      toast.info("Task submissions locked. Returning to broadcast.");
      // Navigate back to the live-session page. Pass the session object in location.state
      // so LiveSession.jsx can read it via location.state?.session on remount.
      // Without this, location.state is null, sessionStore.getSession() returns null
      // (startSession is never called), and joinedSession is null — showing the
      // "No active session" fallback instead of the video/editor view.
      //
      // NOTE: student:request_session_state is intentionally NOT emitted here.
      // Emitting it from StudentLayout was a race condition: navigate() schedules a
      // route transition asynchronously, so the emit fired before LiveSession.jsx
      // had mounted and registered its webrtc:offer listener. The offer arrived
      // at the socket and was silently dropped. The request is now emitted by
      // LiveSession.jsx itself, from inside the same useEffect that registers
      // webrtc:offer — guaranteeing the listener exists before the request is sent.
      navigate("/student/live-session", {
        state: { session: joinedSessionRef.current },
      });
    });

    socket.on("exam:opened", (data) => {
      console.log("[StudentLayout] exam:opened received:", data);
      toast.info(`New exam available: ${data.title}`, {
        action: {
          label: 'View',
          onClick: () => navigate(`/student/exam/${data.examId}`),
        },
        duration: 8000,
      });
    });

    socket.on("exam:start", (payload) => {
      console.log("[StudentLayout] exam:start received:", payload);
      setActiveExam({ examId: payload.examId, title: payload.title });
    });

    socket.on("exam:force_lock", (payload) => {
      setActiveExam((prev) => {
        if (prev && parseInt(prev.examId) === parseInt(payload.examId)) {
          return null;
        }
        return prev;
      });
    });

    return () => {
      socket.off("session:started");
      socket.off("session:ended");
      socket.off("student:rejoin_pending");
      socket.off("student:rejoin_approved");
      socket.off("student:rejoin_denied");
      socket.off("student:session_state");
      socket.off("task:assigned");
      socket.off("task:closed");
      socket.off("exam:opened");
      socket.off("exam:start");
      socket.off("exam:force_lock");
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync joinedSession from location.state if navigating directly into live session
  useEffect(() => {
    if (location.state?.session && (!joinedSession || joinedSession.id !== location.state.session.id)) {
      setJoinedSession(location.state.session);
      setHasJoinedSession(true);
    }
  }, [location.state?.session]);

  // Ref: tracks socket.id + session.id for which student:join_session was emitted
  const lastEmittedKeyRef = useRef(null);

  // Helper function to reliably emit student:join_session
  const emitJoinSession = (session) => {
    const socket = getSocket();
    if (!socket || !socket.connected || !session?.id) return;
    const key = `${socket.id}:${session.id}`;
    if (lastEmittedKeyRef.current === key) return;

    console.log(`[DEBUG] [student StudentLayout] EMITTING student:join_session — session_id=${session.id} socket.id=${socket.id} ts=${Date.now()}`);
    console.log(`[StudentLayout] Emitting student:join_session for session ${session.id}`);
    socket.emit("student:join_session", { session_id: session.id });
    lastEmittedKeyRef.current = key;
  };

  // ── Emit student:join_session and maintain reconnect listener for active session ──
  useEffect(() => {
    if (!joinedSession) {
      setSessionStateCache(null);
      lastEmittedKeyRef.current = null;
      return;
    }

    const socket = getSocket();

    const handleConnect = () => {
      const s = getSocket();
      console.log(`[DEBUG] [student StudentLayout] socket connect event fired — socket.id=${s?.id} currentSessionId=${joinedSessionRef.current?.id} ts=${Date.now()}`);
      if (joinedSessionRef.current && s) {
        lastEmittedKeyRef.current = null; // Reset cached key so new socket.id re-emits student:join_session
        const key = `${s.id}:${joinedSessionRef.current.id}`;
        console.log(`[DEBUG] [student StudentLayout] RE-EMITTING student:join_session on reconnect — session_id=${joinedSessionRef.current.id} socket.id=${s.id} ts=${Date.now()}`);
        s.emit("student:join_session", { session_id: joinedSessionRef.current.id });
        lastEmittedKeyRef.current = key;
      }
    };

    if (socket) {
      if (socket.connected && joinedSessionRef.current) {
        emitJoinSession(joinedSessionRef.current);
      }
      socket.on("connect", handleConnect);
    }

    return () => {
      const s = getSocket();
      if (s) {
        s.off("connect", handleConnect);
      }
    };
  }, [joinedSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close join modal if selectedSession disappears (e.g. session ended while modal open)
  useEffect(() => {
    if (!selectedSession) {
      setShowJoinModal(false);
      setPassword("");
      setPasswordError("");
    }
  }, [selectedSession]);

  const handleLogout = () => {
    localStorage.removeItem("edusync_token");
    localStorage.removeItem("edusync_user");
    disconnectSocket();
    navigate("/");
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setPasswordError("");

    if (!selectedSession) return;

    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/sessions/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: selectedSession.id, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.message || "Incorrect password. Please try again.");
        return;
      }

      setJoinedSession(data.session);
      setHasJoinedSession(true);
      setShowJoinModal(false);
      setPassword("");
      navigate("/student/live-session", { state: { session: data.session } });
    } catch {
      setPasswordError("Unable to connect to server. Please try again.");
    }
  };

  // /live-session is immersive — no sidebar nav while student is in an active broadcast.
  // This routes through the slim layout (no left sidebar) that shows only the bottom bar.
  const isImmersiveView =
    location.pathname.includes("/exam/") ||
    location.pathname.includes("/session/") ||
    location.pathname.includes("/task/") ||
    location.pathname.includes("/live-session");

  const showBottomBar = joinedSession !== null;

  const bottomBarJSX = showBottomBar && (
    <div className="h-12 px-6 bg-bg-surface/95 backdrop-blur border-t border-border flex items-center justify-between z-50 flex-shrink-0">
      <div className="flex items-center gap-4">
        <StatusBadge status="live" />
        <span className="text-sm text-text-secondary">
          {joinedSession.lab_room} • {joinedSession.lecture_name}
        </span>
        <div className="h-4 w-px bg-border" />
        <ElapsedTimer startTime={joinedSession.started_at} size="sm" />
      </div>

      <div className="flex items-center gap-2">
        {location.pathname !== "/student/live-session" && (
          <Button
            onClick={() =>
              navigate("/student/live-session", { state: { session: joinedSession } })
            }
            variant="outline"
            size="sm"
            className="border-accent-live/30 text-accent-live hover:bg-accent-live/10 text-xs font-semibold py-1 px-3 h-8"
          >
            VIEW BROADCAST
          </Button>
        )}
        <div className="px-2 py-1 bg-accent-success/10 border border-accent-success/20 rounded-sm h-8 flex items-center justify-center">
          <span className="text-xs font-medium text-accent-success">
            ✓ PRESENT
          </span>
        </div>
      </div>
    </div>
  );

  const joinModalJSX = (
    <Dialog open={showJoinModal} onOpenChange={(open) => {
      if (!open) {
        setShowJoinModal(false);
        setPassword("");
        setPasswordError("");
        setShowPassword(false);
      }
    }}>
      <DialogContent className="sm:max-w-md bg-bg-surface border-border text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-text-primary">Join Live Session</DialogTitle>
        </DialogHeader>
        {selectedSession && (
          <div className="space-y-4 my-2">
            <div className="space-y-2 p-3 bg-bg-base border border-border rounded-md text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Lecture:</span>
                <span className="font-medium text-text-primary">{selectedSession.lecture_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Subject:</span>
                <span className="font-medium text-text-primary">{selectedSession.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Lab Room:</span>
                <span className="font-medium text-text-primary">{selectedSession.lab_room}</span>
              </div>
            </div>

            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session-password" className="text-text-secondary text-sm">
                  Session Password
                </Label>
                <div className="relative">
                  <Input
                    id="session-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError("");
                    }}
                    className={cn(
                      "bg-bg-base border-border text-text-primary pr-10",
                      passwordError && "border-accent-critical focus-visible:ring-accent-critical"
                    )}
                    placeholder="Enter the password shared by your instructor"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[50%] -translate-y-[50%] text-text-secondary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-accent-critical mt-1">{passwordError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowJoinModal(false);
                    setPassword("");
                    setPasswordError("");
                  }}
                  className="border-border text-text-secondary hover:text-text-primary hover:bg-bg-base"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!password}
                  className={cn(
                    "bg-accent-700 hover:bg-accent-700/90 text-white font-medium",
                    !password && "opacity-50 pointer-events-none"
                  )}
                >
                  Join Session
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  if (isImmersiveView) {
    return (
      <div className="h-screen flex flex-col bg-bg-base overflow-hidden" data-role="student">
        <div className="flex-1 overflow-auto">
          <Outlet context={{
            hasJoinedSession,
            setHasJoinedSession,
            setShowJoinModal,
            activeSessions,
            joinedSession,
            selectedSession,
            setSelectedSession,
            wasKicked,
            setWasKicked,
            rejoinStatus,
            setRejoinStatus,
            rejoinCount,
            sessionStateCache,
            setSessionStateCache,
          }} />
        </div>
        {bottomBarJSX}
        {joinModalJSX}
        <Toaster position="bottom-right" richColors />
      </div>
    );
  }

  const initials = (displayUser.name || "Student")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-bg-base" data-role="student">
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
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== "/student" &&
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
          })}

          {(activeExam || joinedSession) && (
            <>
              <div className="hidden md:block px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                In Session
              </div>
              <div className="md:hidden my-2 mx-2 border-t border-border" />
              {[
                ...(activeExam ? [{ name: "Exam", href: `/student/exam/${activeExam.examId}`, icon: FileText }] : []),
                ...(joinedSession ? [{ name: "Tasks", href: "/student/tasks", icon: Code }] : []),
              ].map((item) => {
                const isActive =
                  location.pathname === item.href ||
                  location.pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.name}
                    to={item.href}
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
              })}
            </>
          )}
        </nav>

        {/* User info & Actions */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-2 md:p-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2.5 px-1 py-1">
            <div className="w-7 h-7 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-[10.5px] font-semibold text-text-secondary shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary truncate">
                {displayUser.name || "Student"}
              </div>
              <div className="text-[10.5px] text-text-muted truncate">Student</div>
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
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <main className="flex-1 overflow-y-auto page-enter">
          <Outlet context={{
            hasJoinedSession,
            setHasJoinedSession,
            setShowJoinModal,
            activeSessions,
            joinedSession,
            selectedSession,
            setSelectedSession,
            wasKicked,
            setWasKicked,
            rejoinStatus,
            setRejoinStatus,
            rejoinCount,
            sessionStateCache,
            setSessionStateCache,
          }} />
        </main>
        {bottomBarJSX}
        {joinModalJSX}
        <Toaster position="bottom-right" richColors />
      </div>
    </div>
  );
}