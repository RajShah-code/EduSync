import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Home, FolderOpen, CalendarCheck, LogOut, Eye, EyeOff, Radio, Code, FileText, Mail, Settings } from "lucide-react";
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
import { Toaster, toast } from "sonner";

const navigation = [
  { name: "Dashboard", href: "/student", icon: Home },
  { name: "Live Sessions", href: "/student/sessions", icon: Radio },
  { name: "My Files", href: "/student/files", icon: FolderOpen },
  { name: "Email My Folder", href: "/student/email-folder", icon: Mail },
  { name: "Attendance", href: "/student/attendance", icon: CalendarCheck },
  { name: "Settings", href: "/student/settings", icon: Settings },
];


export function StudentLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeExam, setActiveExam] = useState(null); // { examId, title } | null

  // Check for currently active exam on mount
  useEffect(() => {
    const checkActiveExam = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        const res = await fetch("http://localhost:3000/exams/available", {
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
  // The specific session this student has joined
  const [joinedSession, setJoinedSession] = useState(null);
  // The session the student clicked "Join" on — passed to modal
  const [selectedSession, setSelectedSession] = useState(null);

  const [hasJoinedSession, setHasJoinedSession] = useState(false);
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
        const res = await fetch("http://localhost:3000/sessions/active", {
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

  // Ref: tracks the last session ID for which we emitted student:join_session.
  // Prevents the session-join effect from re-emitting when unrelated state
  // (e.g. rejoinStatus) changes cause a re-render, even if joinedSession?.id
  // hasn't changed.
  const lastEmittedSessionIdRef = useRef(null);

  // Ref: set to true when the socket fires a real 'disconnect' event.
  // The reconnect handler reads this flag and only re-emits if a genuine
  // disconnect actually occurred — never as a side-effect of rejoinStatus.
  const hadRealDisconnectRef = useRef(false);

  // ── Effect 1: Emit student:join_session exactly once per new session ──────
  // Keyed ONLY on joinedSession?.id. rejoinStatus is intentionally absent from
  // the dependency array — it is only read for UI display, never to re-trigger
  // the join emit.
  useEffect(() => {
    const socket = getSocket();

    // If the student left/was kicked, clear cache and reset the emit guard.
    if (!joinedSession) {
      setSessionStateCache(null);
      lastEmittedSessionIdRef.current = null;
      return;
    }

    if (!socket) return;

    // Guard: only emit once per session ID, not on every re-render.
    if (lastEmittedSessionIdRef.current === joinedSession.id) return;

    if (socket.connected) {
      console.log(`[StudentLayout] Emitting student:join_session for session ${joinedSession.id}`);
      socket.emit("student:join_session", { session_id: joinedSession.id });
      lastEmittedSessionIdRef.current = joinedSession.id;
    }
    // If not yet connected, Effect 2's connect handler will emit once the
    // socket connects and hadRealDisconnectRef is NOT set (first connect).
    // We set hadRealDisconnectRef = false here so the reconnect effect knows
    // the next 'connect' is a fresh initial connection, not a re-connect.
    hadRealDisconnectRef.current = false;
  }, [joinedSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: Re-emit ONLY on a genuine socket-level reconnect ────────────
  // Mount-once (empty dep array). Uses refs to read latest values without
  // needing them in the dependency array, so this effect is never re-run due
  // to state changes. rejoinStatus is not referenced here at all.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onDisconnect = () => {
      // Record that a real transport-level disconnect happened.
      hadRealDisconnectRef.current = true;
      console.log("[StudentLayout] Socket disconnected — will re-emit join on reconnect");
    };

    const onConnect = () => {
      // Only re-emit if we had a real prior disconnect AND are in an active session.
      if (!hadRealDisconnectRef.current) return;
      hadRealDisconnectRef.current = false;

      const currentSession = joinedSessionRef.current;
      if (!currentSession) return;

      console.log(`[StudentLayout] Emitting student:join_session for session ${currentSession.id} (reconnect)`);
      socket.emit("student:join_session", { session_id: currentSession.id });
      // Update the guard so Effect 1 doesn't double-emit on the next render.
      lastEmittedSessionIdRef.current = currentSession.id;
    };

    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);

    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const res = await fetch("http://localhost:3000/sessions/join", {
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
          <span className="text-xs font-mono text-accent-success">
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
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    "bg-accent-info hover:bg-accent-info/90 text-white font-medium",
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
      <div className="h-screen flex flex-col bg-bg-base overflow-hidden">
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
            Lab System
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
            Student
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1" style={{ padding: "12px 8px" }}>
          {[
            ...navigation,
            ...(activeExam ? [{ name: "Exam", href: `/student/exam/${activeExam.examId}`, icon: FileText }] : []),
            ...(joinedSession ? [{ name: "Tasks", href: "/student/tasks", icon: Code }] : [])
          ].map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== "/student" &&
                location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 py-2 mb-0.5",
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
              {displayUser.name || ""}
            </div>
            <div
              className="font-mono text-text-muted truncate"
              style={{ fontSize: "11px" }}
            >
              {displayUser.roll_no || ""}
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
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="flex-1 overflow-auto page-enter">
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
    </div>
  );
}