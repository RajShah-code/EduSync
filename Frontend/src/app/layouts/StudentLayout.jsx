import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Home, FolderOpen, CalendarCheck, LogOut, Eye, EyeOff, Radio, Code } from "lucide-react";
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
  { name: "Attendance", href: "/student/attendance", icon: CalendarCheck },
];

export function StudentLayout() {
  const location = useLocation();
  const navigate = useNavigate();

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
        action: {
          label: "Open Task",
          onClick: () => {
            navigate(`/student/task/${task.id}`);
          }
        },
        duration: 15000,
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
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Emit student:join_session based on connection state and joinedSession
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !joinedSession) {
      if (!joinedSession) {
        setSessionStateCache(null); // Clear cache if session is left/ended
      }
      return;
    }

    const emitJoin = () => {
      console.log(`[StudentLayout] Emitting student:join_session for session ${joinedSession.id}`);
      socket.emit("student:join_session", { session_id: joinedSession.id });
    };

    if (socket.connected) {
      emitJoin();
    }

    // Only re-emit on reconnect if we are not already in a pending or denied
    // rejoin state — emitting in those states would increment the rejoin counter
    // against a potentially dead session before the teacher acts.
    const emitJoinOnReconnect = () => {
      if (rejoinStatus === 'waiting' || rejoinStatus === 'denied') return;
      emitJoin();
    };
    socket.on("connect", emitJoinOnReconnect);

    return () => {
      socket.off("connect", emitJoinOnReconnect);
    };
  }, [joinedSession?.id, rejoinStatus]);

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
            <div className="text-sm font-medium text-text-primary">
              {JSON.parse(localStorage.getItem("edusync_user") || "{}").name || ""}
            </div>
            <div
              className="font-mono text-text-muted"
              style={{ fontSize: "11px" }}
            >
              {JSON.parse(localStorage.getItem("edusync_user") || "{}").roll_no || ""}
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