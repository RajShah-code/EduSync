import { useState, useRef, useEffect } from "react";
import { useOutletContext } from "react-router";
import Editor from "@monaco-editor/react";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/StatusBadge";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import {
  Pause,
  Play,
  Square,
  Monitor,
  Circle,
  MonitorStop,
  Eye,
  EyeOff,
  Users,
  Copy,
  Check,
  Mic,
  MicOff,
  Code2,
  X,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../components/ui/alert-dialog";
import { Input } from "../../components/ui/input";
import { getSocket } from "../../store/socket";
import { toast } from "sonner";

// ─── ICE / STUN Configuration ─────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ─── Language definitions ──────────────────────────────────────────────────────
const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "plaintext", label: "Plain Text" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

// Wrap CSS code in a minimal HTML shell so styles are visually testable
const wrapCssInHtml = (css) =>
  `<!DOCTYPE html><html><head><style>
body{margin:0;padding:20px;background:#1a1a24;color:#f0f0f5;font-family:system-ui}
${css}
</style></head><body>
  <h1>Heading 1</h1><h2>Heading 2</h2>
  <p>Sample paragraph for CSS preview.</p>
  <button>Button</button>
  <a href="#">Anchor link</a>
  <ul><li>List item one</li><li>List item two</li></ul>
  <div class="container"><div class="box">Box element</div></div>
</body></html>`;

// Build an iframe srcdoc for JS execution.
// Console methods are overridden to postMessage results to the parent window,
// keeping execution sandboxed (no eval in the main page context).
const buildJsSrcdoc = (code) =>
  `<!DOCTYPE html><html><head>
<script>
(function(){
  const logs = [];
  const send=(m,args)=>{
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch{return String(a)}}).join(' ');
    logs.push({method:m,msg});
    window.parent.postMessage({type:'__edusync_console__',method:m,msg},'*');
  };
  ['log','warn','error','info'].forEach(fn=>{console[fn]=(...a)=>send(fn,a);});
  window.onerror=(msg,_,line)=>{send('error',['Line '+line+': '+msg]);return true;};
  window.onunhandledrejection=e=>{send('error',['Unhandled promise: '+e.reason]);};

  window.addEventListener('load', () => {
    setTimeout(() => {
      window.parent.postMessage({type:'__edusync_js_done__', logs}, '*');
    }, 50);
  });
})();
<\/script>
</head>
<body style="margin:0;background:#1a1a24;color:#f0f0f5;font-family:system-ui;padding:12px">
<script>
try{
${code}
}catch(e){window.parent.postMessage({type:'__edusync_console__',method:'error',msg:e.message},'*');}
<\/script>
</body></html>`;

// ─── Pyodide lazy-loader (self-hosted) ─────────────────────────────────────────
//
// Pyodide is served from /pyodide/ — files copied from node_modules/pyodide/ into
// public/pyodide/ at setup time. This keeps Python execution fully offline-safe for
// university lab environments with restricted/no internet access.
//
// The full Pyodide distribution is several MB (WASM + stdlib). We use a module-level
// singleton promise so the runtime is only downloaded once per page session, and only
// when a user first selects Python and clicks Run (not on page load).
let _pyodideLoadPromise = null;

async function loadPyodideFromPublic() {
  if (_pyodideLoadPromise) return _pyodideLoadPromise;

  _pyodideLoadPromise = (async () => {
    // Load pyodide.js from our self-hosted path. This script defines
    // globalThis.loadPyodide which we then call with the local indexURL.
    if (!window.__edusync_pyodide_ready) {
      await new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = "/pyodide/pyodide.js";
        el.onload = () => {
          window.__edusync_pyodide_ready = true;
          resolve();
        };
        el.onerror = () =>
          reject(
            new Error(
              "Could not load /pyodide/pyodide.js — ensure Pyodide " +
                "distribution files are in public/pyodide/ " +
                "(run: Copy-Item node_modules\\pyodide\\* public\\pyodide\\ -Force)"
            )
          );
        document.head.appendChild(el);
      });
    }
    // indexURL points to our self-hosted directory, not a CDN.
    return globalThis.loadPyodide({ indexURL: "/pyodide/" });
  })();

  return _pyodideLoadPromise;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveBroadcast() {
  const {
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
  } = useOutletContext();

  // ── Modal / form state ──────────────────────────────────────────────────────
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [formData, setFormData] = useState({
    lectureName: "",
    subject: "",
    password: "",
    labRoom: "LAB 301",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [modalError, setModalError] = useState("");
  const [startLoading, setStartLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedClassIds, setSelectedClassIds] = useState([]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch("http://localhost:3000/classes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setClasses(data.classes || []);
        }
      } catch (err) {
        console.error("Failed to fetch classes:", err);
      }
    };
    fetchClasses();
  }, []);

  // ── Runtime state ───────────────────────────────────────────────────────────
  const [connectedStudents, setConnectedStudents] = useState([]);
  const [copiedField, setCopiedField] = useState(null);
  // isScreenSharing: true while teacher has an active screen capture running.
  // Independent of broadcastState — the session can be 'live' (editor mode)
  // without any screen share active.
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareError, setScreenShareError] = useState("");

  // ── Audio state ─────────────────────────────────────────────────────────────
  const [micMuted, setMicMuted] = useState(false);
  const [micWarning, setMicWarning] = useState(""); // non-empty = mic unavailable

  // ── Code editor state ───────────────────────────────────────────────────────
  const [editorCode, setEditorCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("javascript");
  // outputMode controls what the output panel shows:
  //   'none'    — panel hidden
  //   'iframe'  — rendered iframe only (HTML / CSS)
  //   'console' — iframe (top) + console text (bottom) for JavaScript
  //   'text'    — plain pre text for Python stdout
  const [outputMode, setOutputMode] = useState("none");
  const [iframeSrcdoc, setIframeSrcdoc] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [consoleLines, setConsoleLines] = useState([]);
  const [textOutput, setTextOutput] = useState("");
  const [pyodideLoading, setPyodideLoading] = useState(false);

  // ── WebRTC refs ─────────────────────────────────────────────────────────────
  const screenStreamRef = useRef(null);   // MediaStream from getDisplayMedia
  const screenTrackRef = useRef(null);    // MediaStreamTrack for screen sharing
  const micStreamRef = useRef(null);      // MediaStream from getUserMedia (mic)
  const peerConnectionsRef = useRef(new Map()); // Map<socketId, RTCPeerConnection>
  const previewVideoRef = useRef(null);   // <video> element for teacher preview
  const sessionInfoRef = useRef(null);    // mirrors sessionInfo state (stable in closures)
  const stopNowRef = useRef(null);        // always points to latest handleStopBroadcastNow
  const pyodideRef = useRef(null);        // holds the loaded Pyodide instance

  // leftTimersRef: Map<student_id, timeoutId> for the 5s "LEFT" removal timers.
  // When a student disconnects, we set their tile to LEFT status and start a 5s
  // timer to remove them. If they rejoin before it fires, the timer is cancelled.
  const leftTimersRef = useRef(new Map());

  // ── Editor refs (for use inside once-registered closures / debounce timers) ─
  const editorSyncTimerRef = useRef(null);
  const editorLiveStatusRef = useRef("live");
  const editorCodeRef = useRef("");
  const editorLanguageRef = useRef("javascript");
  const activeModeRef = useRef("editor");

  // Keep all refs in sync with state on every render
  editorLiveStatusRef.current = editorLiveStatus;
  editorCodeRef.current = editorCode;
  editorLanguageRef.current = editorLanguage;
  activeModeRef.current = activeMode;

  // Sync sessionInfoRef whenever sessionInfo state updates
  useEffect(() => {
    sessionInfoRef.current = sessionInfo;
  }, [sessionInfo]);

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === "__edusync_console__") {
        const { method, msg } = event.data;
        const prefix =
          method === "error" ? "❌" : method === "warn" ? "⚠️" : method === "info" ? "ℹ️" : "›";
        setConsoleLines((prev) => [...prev, `${prefix} ${msg}`]);
      } else if (event.data?.type === "__edusync_js_done__") {
        const { logs } = event.data;
        const lines = logs.map(l => {
          const prefix = l.method === "error" ? "❌" : l.method === "warn" ? "⚠️" : l.method === "info" ? "ℹ️" : "›";
          return `${prefix} ${l.msg}`;
        });
        setConsoleLines(lines);
        emitCodeOutput("console", "", buildJsSrcdoc(editorCodeRef.current), lines);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── createPeerConnectionForStudent ─────────────────────────────────────────
  //
  // Creates one RTCPeerConnection for a newly joined student, adds all media
  // tracks (screen video + screen audio if available + mic audio), creates an
  // SDP offer, and sends it via the server relay. Failures are isolated per student.
  const createPeerConnectionForStudent = async (studentSocketId, studentUserId, studentName) => {
    const socket = getSocket();
    if (!socket || !sessionInfoRef.current) return;

    try {
      let pc = peerConnectionsRef.current.get(studentSocketId);

      // STEP 4 FIX: evict any stale closed/failed PC before creating a new one.
      // makingOffer is a property on the PC object itself — destroyed when the
      // object is GC'd. No separate per-student Maps need clearing here.
      if (pc && (pc.connectionState === 'closed' || pc.connectionState === 'failed')) {
        console.log(`[WEBRTC-DEBUG] teacher: stale PC (state=${pc.connectionState}) for ${studentSocketId} in createPeerConnectionForStudent, evicting ts=${Date.now()}`);
        pc.close(); // no-op if already closed
        peerConnectionsRef.current.delete(studentSocketId);
        pc = null;
      }

      if (!pc) {
        pc = new RTCPeerConnection(ICE_CONFIG);
        peerConnectionsRef.current.set(studentSocketId, pc);
        console.log(`[WEBRTC-DEBUG] teacher: new RTCPeerConnection for ${studentSocketId}, Map size=${peerConnectionsRef.current.size} ts=${Date.now()}`);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log(`[WEBRTC-DEBUG] teacher: ICE candidate generated for ${studentSocketId} ts=${Date.now()}`);
            socket.emit("webrtc:ice-candidate", {
              target_socket_id: studentSocketId,
              candidate: event.candidate,
              session_id: sessionInfoRef.current?.id,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          if (state === "failed") {
            pc.close();
            peerConnectionsRef.current.delete(studentSocketId);
            setConnectedStudents((prev) =>
              prev.filter((s) => s.socket_id !== studentSocketId)
            );
          }
        };

        pc.makingOffer = false;

        pc.onnegotiationneeded = async () => {
          try {
            if (pc.makingOffer) return;
            pc.makingOffer = true;
            const offer = await pc.createOffer();
            if (pc.signalingState !== "stable") return;
            await pc.setLocalDescription(offer);
            console.log(`[WEBRTC-DEBUG] teacher: offer created for ${studentSocketId} ts=${Date.now()}`);
            socket.emit("webrtc:offer", {
              target_socket_id: studentSocketId,
              sdp: pc.localDescription,
              session_id: sessionInfoRef.current?.id,
              teacher_socket_id: socket.id,
            });
          } catch (err) {
            console.error(`[WebRTC] Negotiation offer failed for ${studentSocketId}:`, err);
          } finally {
            pc.makingOffer = false;
          }
        };
      }

      // Add screen tracks (video + optional system audio from getDisplayMedia) if active
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, screenStreamRef.current);
        });
      }

      // Add microphone audio tracks if the mic was granted
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, micStreamRef.current);
        });
      }
    } catch (err) {
      console.error(`[WebRTC] Setup failed for ${studentSocketId}:`, err);
      const failedPc = peerConnectionsRef.current.get(studentSocketId);
      if (failedPc) {
        failedPc.close();
        peerConnectionsRef.current.delete(studentSocketId);
      }
    }
  };

  // ── handleStopBroadcastNow ─────────────────────────────────────────────────
  //
  // Shared cleanup called by:
  //   (a) In-app "Stop Broadcast" button (via handleConfirmStop)
  //   (b) Session-level end (teacher clicks Stop Broadcast — ends the API session)
  // Does NOT call handleStopScreenShareInternal because it handles PC/stream
  // cleanup itself and also sends teacher:end_session.
  async function handleStopBroadcastNow() {
    const socket = getSocket();

    // ── End session via API first — must succeed before we tear down socket state ──
    // If the REST call fails, the DB session stays open; abort and let the teacher retry.
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/sessions/end", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Failed to end session. Please try again.");
        return;
      }
    } catch {
      toast.error("Failed to end session. Please check your connection and try again.");
      return;
    }

    // REST call succeeded — now emit socket events and tear down local state.
    if (socket && sessionInfoRef.current) {
      // Only emit broadcast_ended if there was an active screen share
      if (screenStreamRef.current) {
        socket.emit("webrtc:broadcast_ended", { session_id: sessionInfoRef.current.id });
      }
      socket.emit("teacher:end_session", { session_id: sessionInfoRef.current.id });
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // Stop screen capture tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    screenTrackRef.current = null;

    // Stop microphone tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    // Clear preview video
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }

    // Cancel any pending editor:sync debounce
    clearTimeout(editorSyncTimerRef.current);

    // Reset all state
    setBroadcastState("idle");
    setRecordingState("off");
    setSessionSeconds(0);
    setRecordingSeconds(0);
    setSessionInfo(null);
    sessionInfoRef.current = null;
    setConnectedStudents([]);
    setMicMuted(false);
    setMicWarning("");
    setIsScreenSharing(false);
    setScreenShareError("");
    // Reset to editor (new default), not screen
    setActiveMode("editor");
    activeModeRef.current = "editor";
    setEditorLiveStatus("live");
    setOutputMode("none");
    // Cancel any pending LEFT-state removal timers
    leftTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    leftTimersRef.current.clear();
  }

  // Always point stopNowRef to the latest closure so once-wired onended
  // callbacks (screenTrack.onended) call the current function.
  stopNowRef.current = handleStopBroadcastNow;

  // ── Socket.io event listeners ──────────────────────────────────────────────
  //
  // BUG 2 FIX: React runs child effects before parent effects. On a fresh page
  // load, TeacherLayout's initSocket() useEffect hasn't run yet when this child
  // useEffect fires, so getSocket() returns null and a naive `if (!socket) return`
  // would permanently skip listener registration for the lifetime of this mount.
  //
  // Fix: use a helper that registers listeners on the existing socket if available,
  // or waits for the socket module to initialize and then registers on its
  // 'connect' event. This ensures listeners are always registered regardless of
  // initialization order.
  useEffect(() => {
    // registerListeners: attaches all socket.io event listeners for this
    // component's lifetime. Returns a cleanup function to detach them.
    const registerListeners = (socket) => {
      const handleStudentJoined = async ({ socket_id, student_id, session_id, student_name }) => {
        if (!sessionInfoRef.current) return;
        if (sessionInfoRef.current.id !== session_id) return;

        // Cancel any pending LEFT-state removal for this student_id (they rejoined
        // before the 5s timer fired — keep them visible with LIVE/IDLE status).
        if (leftTimersRef.current.has(student_id)) {
          clearTimeout(leftTimersRef.current.get(student_id));
          leftTimersRef.current.delete(student_id);
        }

        // Add student to the connected list immediately (before WebRTC attempt).
        // createPeerConnectionForStudent also tries to add them but deduplicates
        // via the `find` check, so doing it here ensures they appear in the panel
        // even if the WebRTC offer fails (e.g., no screen stream in editor mode).
        setConnectedStudents((prev) => {
          // Remove any stale LEFT-state entry for this student before re-adding
          const without = prev.filter((s) => !(s.student_id === student_id && s.status === 'left'));
          if (without.find((s) => s.socket_id === socket_id)) return without;
          return [
            ...without,
            {
              socket_id,
              student_id,
              student_name: student_name || `Student ${student_id}`,
              outOfFocus: false,
              focusLossCount: 0,
              status: 'live',
            },
          ];
        });

        // Attempt WebRTC peer connection (no-op if no screen stream)
        try {
          await createPeerConnectionForStudent(socket_id, student_id, student_name);
        } catch (err) {
          console.error("[WebRTC] student:joined handler error:", err);
        }
      };

      const handleWebRTCAnswer = async ({ sdp, student_socket_id }) => {
        console.log(`[WebRTC] Answer received from ${student_socket_id}`);
        try {
          const pc = peerConnectionsRef.current.get(student_socket_id);
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error("[WebRTC] setRemoteDescription failed:", err);
        }
      };

      const handleWebRTCIceCandidate = async ({ candidate, from_socket_id }) => {
        console.log(`[WebRTC] ICE candidate received from ${from_socket_id}:`, candidate?.type);
        try {
          const pc = peerConnectionsRef.current.get(from_socket_id);
          if (!pc || !candidate) return;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("[WebRTC] addIceCandidate from student failed:", err);
        }
      };

      const handleStudentLeft = ({ socket_id, student_id }) => {
        // Close and remove the WebRTC peer connection immediately
        const pc = peerConnectionsRef.current.get(socket_id);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(socket_id);
          console.log(`[WEBRTC-DEBUG] teacher: PC closed & deleted for socket_id=${socket_id}, Map size=${peerConnectionsRef.current.size} ts=${Date.now()}`);
        }

        // Mark student tile as LEFT (red) immediately, then schedule removal
        // after 5 seconds. If the student rejoins within that window,
        // handleStudentJoined cancels this timer and restores LIVE/IDLE.
        setConnectedStudents((prev) =>
          prev.map((s) =>
            s.socket_id === socket_id ? { ...s, status: 'left' } : s
          )
        );

        const timerId = setTimeout(() => {
          leftTimersRef.current.delete(student_id);
          setConnectedStudents((prev) =>
            prev.filter((s) => s.socket_id !== socket_id)
          );
        }, 5000);
        leftTimersRef.current.set(student_id, timerId);
      };

      const handleStudentStatusUpdate = ({ session_id, students }) => {
        if (!sessionInfoRef.current || sessionInfoRef.current.id !== session_id) return;
        setConnectedStudents((prev) =>
          prev.map((s) => {
            const match = students.find((st) => st.student_id === s.student_id);
            if (match) {
              const derived = deriveConnectionStatus({
                status: s.status,
                is_fullscreen: match.is_fullscreen,
              });
              return {
                ...s,
                outOfFocus: !match.is_fullscreen,
                focusLossCount: match.fullscreen_exit_count,
                status: derived,
              };
            }
            return s;
          })
        );
      };

      const handleRejoinRequest = ({ session_id, student_id, student_name, rejoin_count }) => {
        toast(`${student_name} wants to rejoin`, {
          description: `Attempt #${rejoin_count ?? '?'} — this student was previously in your session.`,
          duration: Infinity,
          action: {
            label: "Allow",
            onClick: () => {
              const s = getSocket();
              if (s) {
                s.emit("teacher:approve_rejoin", { session_id, student_id });
              }
            },
          },
          cancel: {
            label: "Deny",
            onClick: () => {
              const s = getSocket();
              if (s) {
                s.emit("teacher:deny_rejoin", { session_id, student_id });
              }
            },
          },
        });
      };

      socket.on("student:joined", handleStudentJoined);
      socket.on("webrtc:answer", handleWebRTCAnswer);
      socket.on("webrtc:ice-candidate", handleWebRTCIceCandidate);
      socket.on("student:left", handleStudentLeft);
      socket.on("teacher:student_status_update", handleStudentStatusUpdate);
      socket.on("teacher:rejoin_request", handleRejoinRequest);

      return () => {
        socket.off("student:joined", handleStudentJoined);
        socket.off("webrtc:answer", handleWebRTCAnswer);
        socket.off("webrtc:ice-candidate", handleWebRTCIceCandidate);
        socket.off("student:left", handleStudentLeft);
        socket.off("teacher:student_status_update", handleStudentStatusUpdate);
        socket.off("teacher:rejoin_request", handleRejoinRequest);
      };
    };

    const existingSocket = getSocket();
    if (existingSocket) {
      // Socket already initialized (normal navigation path — teacher came from
      // another teacher page where TeacherLayout had already run initSocket).
      return registerListeners(existingSocket);
    }

    // Socket is null: fresh page load — TeacherLayout's initSocket useEffect
    // hasn't fired yet (child effects run before parent effects in React).
    // Poll briefly for the socket, then register once it's available.
    // Using a short polling interval is safe here because initSocket is called
    // synchronously in TeacherLayout's useEffect which will fire within the same
    // microtask queue flush after this child effect.
    let cleanup = () => {};
    let attempts = 0;
    const maxAttempts = 50; // 50 × 100ms = 5s max wait
    const intervalId = setInterval(() => {
      attempts++;
      const s = getSocket();
      if (s) {
        clearInterval(intervalId);
        cleanup = registerListeners(s);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        console.warn('[LiveBroadcast] Socket never initialized — focus/student events will not be received');
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach the screen stream to the preview <video> when screen sharing starts
  // (screenStreamRef.current is set inside handleStartScreenShare, not on broadcastState).
  // We use isScreenSharing state as the trigger so the effect re-runs at the right time.
  useEffect(() => {
    if (
      isScreenSharing &&
      previewVideoRef.current &&
      screenStreamRef.current
    ) {
      previewVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [isScreenSharing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(editorSyncTimerRef.current);
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      screenTrackRef.current = null;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenSetupModal = () => {
    setFormData({ lectureName: "", subject: "", password: "", labRoom: "LAB 301" });
    setSelectedClassIds([]);
    setShowPassword(false);
    setModalError("");
    setShowSetupModal(true);
  };

  const handleStartBroadcast = async () => {
    if (!isFormValid) return;
    setModalError("");
    setStartLoading(true);

    try {
      // ── Create the session via API ──────────────────────────────────────────
      // NO screen capture here. Screen sharing is triggered separately via the
      // "Start Screen Share" button AFTER the session is live.
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/sessions/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lecture_name: formData.lectureName,
          subject: formData.subject,
          lab_room: formData.labRoom,
          password: formData.password,
          class_ids: selectedClassIds,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setModalError(data.message || "Failed to start session");
        return;
      }

      // ── Wire up state and socket events ────────────────────────────────────
      const newSessionInfo = {
        ...formData,
        id: data.session.id,
        started_at: data.session.started_at,
        class_ids: data.session.class_ids,
      };
      sessionInfoRef.current = newSessionInfo;
      setSessionInfo(newSessionInfo);
      setShowSetupModal(false);
      setSessionSeconds(0);
      setBroadcastState("live");

      const socket = getSocket();
      if (socket) {
        socket.emit("teacher:start_session", {
          session: {
            id: data.session.id,
            lecture_name: data.session.lecture_name,
            subject: data.session.subject,
            lab_room: data.session.lab_room,
            started_at: data.session.started_at,
            class_ids: data.session.class_ids,
          },
        });
        // Emit initial mode so students render the correct view immediately
        // (defaults to 'editor' — teacher switches to screen share manually)
        socket.emit("teacher:mode_changed", {
          sessionId: data.session.id,
          mode: activeModeRef.current,
        });
      }
    } catch {
      setModalError("Unable to connect to server. Please try again.");
    } finally {
      setStartLoading(false);
    }
  };

  const handleTogglePause = () => {
    if (broadcastState === "live") setBroadcastState("paused");
    else if (broadcastState === "paused") setBroadcastState("live");
  };

  const handleToggleRecording = () => {
    if (recordingState === "off") {
      setRecordingSeconds(0);
      setRecordingState("recording");
    } else {
      setRecordingState("off");
      setRecordingSeconds(0);
    }
  };

  const handleConfirmStop = () => {
    setShowStopConfirm(false);
    handleStopBroadcastNow();
  };

  const handleCopy = (field, value) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  // Toggling track.enabled sends silence to all connected students without any
  // WebRTC renegotiation. The same MediaStreamTrack object is shared across all
  // RTCPeerConnections, so one toggle affects all students simultaneously.

  // ── handleStartScreenShare ─────────────────────────────────────────────────
  //
  // Called when teacher clicks "Start Screen Share" during an active session.
  // Prompts Chrome's native screen picker, then:
  //   1. Acquires mic (gracefully — session continues even if denied)
  //   2. For every student already in connectedStudents, creates/replaces a
  //      RTCPeerConnection and sends a new offer (track-before-offer ordering).
  //   3. Students who join AFTER this point are handled by handleStudentJoined →
  //      createPeerConnectionForStudent (which checks screenStreamRef.current).
  const handleStartScreenShare = async () => {
    setScreenShareError("");
    console.log(`[WEBRTC-DEBUG] teacher: handleStartScreenShare called, Map size=${peerConnectionsRef.current.size} ts=${Date.now()}`);

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError(
        "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox."
      );
      return;
    }

    // Request microphone audio (graceful — mic denied does not abort screen share)
    if (!micStreamRef.current) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        setMicWarning("");
      } catch (micErr) {
        setMicWarning(
          micErr.name === "NotAllowedError"
            ? "Microphone access denied — broadcasting video only."
            : "Microphone unavailable — broadcasting video only."
        );
      }
    }

    const isTrackReusable = screenTrackRef.current && screenTrackRef.current.readyState !== 'ended';

    if (isTrackReusable) {
      // Cheap reuse path: same OS-level capture still alive, just re-enable the track.
      // peerConnectionsRef is NOT touched — RTCRtpSenders already hold this track.
      screenTrackRef.current.enabled = true;
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => {
          t.enabled = true;
        });
      }
    } else {
      // Fresh-capture path: track was null or ended (e.g. browser Stop Sharing bar fired).
      // Must call getDisplayMedia and re-add tracks to every student's PC.
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false, // system audio causes issues on some setups; mic is preferred
        });
      } catch (err) {
        // NotAllowedError / AbortError = teacher cancelled the picker — do nothing
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          setScreenShareError(`Screen sharing failed: ${err.message}`);
        }
        return;
      }

      screenStreamRef.current = stream;
      const screenTrack = stream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      if (screenTrack) {
        screenTrack.onended = () => {
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
          }
          screenTrackRef.current = null;
          screenStreamRef.current = null;
          handleStopScreenShareInternal();
        };
      }

      // STEP 3 FIX: health-check every student's PC before adding the new track.
      // Only unhealthy PCs (closed/failed/disconnected) are closed and recreated.
      // Healthy PCs (connected/connecting) receive addTrack directly, preserving
      // the zero-renegotiation path for connections that survived the stop/start.
      // makingOffer lives on the PC object and is destroyed with it — no separate
      // cleanup needed. No other per-student Maps exist on the teacher side.
      const students = connectedStudents;
      for (const student of students) {
        try {
          let pc = peerConnectionsRef.current.get(student.socket_id);

          if (pc && (
            pc.connectionState === 'closed' ||
            pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected'
          )) {
            console.log(`[WEBRTC-DEBUG] teacher: stale PC (state=${pc.connectionState}) for ${student.socket_id} on resume, closing & deleting ts=${Date.now()}`);
            pc.close();
            peerConnectionsRef.current.delete(student.socket_id);
            pc = null; // fall through to createPeerConnectionForStudent below
          }

          if (!pc) {
            console.log(`[WEBRTC-DEBUG] teacher: no healthy PC for ${student.socket_id}, creating fresh ts=${Date.now()}`);
            await createPeerConnectionForStudent(student.socket_id, student.student_id, student.student_name);
          } else {
            // PC is healthy — add the new tracks; onnegotiationneeded fires the offer.
            stream.getTracks().forEach((track) => {
              pc.addTrack(track, stream);
            });
            if (micStreamRef.current) {
              micStreamRef.current.getAudioTracks().forEach((track) => {
                pc.addTrack(track, micStreamRef.current);
              });
            }
          }
        } catch (err) {
          console.error(`[WebRTC] Failed to add track to PC for ${student.socket_id}:`, err);
        }
      }
    }

    setIsScreenSharing(true);

    // Switch teacher UI to screen mode and notify students
    handleModeSwitch("screen");
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("webrtc:broadcast_started", { session_id: sessionInfoRef.current.id });
    }
  };

  // ── handleStopScreenShareInternal ──────────────────────────────────────────
  // Stops tracks and resets screen share state WITHOUT ending the session.
  // Called by the "Stop Screen Share" button and by screenTrack.onended.
  const handleStopScreenShareInternal = () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.enabled = false;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        t.enabled = false;
      });
    }

    if (screenTrackRef.current && screenTrackRef.current.readyState === 'ended') {
      screenTrackRef.current = null;
      screenStreamRef.current = null;
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }

    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("webrtc:broadcast_ended", { session_id: sessionInfoRef.current.id });
    }
    setIsScreenSharing(false);
    // Revert to editor mode so students see the code editor again
    handleModeSwitch("editor");
  };

  const handleMicToggle = () => {
    if (!micStreamRef.current) return;
    const newMuted = !micMuted;
    micStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted; // true = audible, false = muted
    });
    setMicMuted(newMuted);
  };

  const emitCodeOutput = (outMode, txtOut, ifrSrc, conLines) => {
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:code_output", {
        sessionId: sessionInfoRef.current.id,
        output: {
          outputMode: outMode,
          textOutput: txtOut,
          iframeSrcdoc: ifrSrc,
          consoleLines: conLines,
        },
      });
    }
  };

  // ── Mode switching ─────────────────────────────────────────────────────────
  const handleModeSwitch = (mode) => {
    setActiveMode(mode);
    activeModeRef.current = mode;
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:mode_changed", {
        sessionId: sessionInfoRef.current.id,
        mode,
      });
      // If switching TO editor while live, push current code immediately
      if (mode === "editor" && editorLiveStatusRef.current === "live") {
        socket.emit("teacher:code_changed", {
          sessionId: sessionInfoRef.current.id,
          code: editorCodeRef.current,
          language: editorLanguageRef.current,
        });
      }
    }
  };

  // ── Editor live / paused toggle ─────────────────────────────────────────────
  const handleEditorLiveToggle = () => {
    const newStatus = editorLiveStatus === "live" ? "paused" : "live";
    setEditorLiveStatus(newStatus);
    editorLiveStatusRef.current = newStatus;

    if (newStatus === "live") {
      // Resume: immediately push current editor state to students
      const socket = getSocket();
      if (socket && sessionInfoRef.current) {
        socket.emit("teacher:code_changed", {
          sessionId: sessionInfoRef.current.id,
          code: editorCodeRef.current,
          language: editorLanguageRef.current,
        });
      }
    } else {
      // Pausing: cancel any in-flight debounce
      clearTimeout(editorSyncTimerRef.current);
    }
  };

  // ── Monaco editor onChange ─────────────────────────────────────────────────
  // Debounced at 300ms to avoid flooding the socket on every keystroke.
  // Only emits while editorLiveStatus === 'live' AND the teacher is in editor mode.
  const handleEditorChange = (value) => {
    const v = value ?? "";
    setEditorCode(v);
    editorCodeRef.current = v;

    if (editorLiveStatusRef.current === "live") {
      clearTimeout(editorSyncTimerRef.current);
      editorSyncTimerRef.current = setTimeout(() => {
        const socket = getSocket();
        if (socket && sessionInfoRef.current) {
          socket.emit("teacher:code_changed", {
            sessionId: sessionInfoRef.current.id,
            code: v,
            language: editorLanguageRef.current,
          });
        }
      }, 300);
    }
  };

  // ── Language selector change ────────────────────────────────────────────────
  const handleLanguageChange = (lang) => {
    setEditorLanguage(lang);
    editorLanguageRef.current = lang;
    setOutputMode("none"); // Reset output panel on language switch
    emitCodeOutput("none", "", "", []);

    if (editorLiveStatusRef.current === "live") {
      const socket = getSocket();
      if (socket && sessionInfoRef.current) {
        socket.emit("teacher:code_changed", {
          sessionId: sessionInfoRef.current.id,
          code: editorCodeRef.current,
          language: lang,
        });
      }
    }
  };

  // ── Run code ────────────────────────────────────────────────────────────────
  // All execution is entirely client-side. Running code is never synced to
  // anyone — it's completely local to the teacher's browser.
  const handleRunCode = async () => {
    const lang = editorLanguageRef.current;
    const code = editorCodeRef.current;

    if (lang === "plaintext") return;

    // Immediately sync code on Run click
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:code_changed", {
        sessionId: sessionInfoRef.current.id,
        code,
        language: lang,
      });
    }

    if (lang === "html") {
      setConsoleLines([]);
      setOutputMode("iframe");
      setIframeSrcdoc(code);
      setIframeKey((k) => k + 1);
      emitCodeOutput("iframe", "", code, []);
    } else if (lang === "css") {
      setConsoleLines([]);
      setOutputMode("iframe");
      const cssHtml = wrapCssInHtml(code);
      setIframeSrcdoc(cssHtml);
      setIframeKey((k) => k + 1);
      emitCodeOutput("iframe", "", cssHtml, []);
    } else if (lang === "javascript") {
      setConsoleLines([]);
      setOutputMode("console");
      setIframeSrcdoc(buildJsSrcdoc(code));
      setIframeKey((k) => k + 1);
      // output will be emitted asynchronously by message callback when JS iframe load fires done event.
    } else if (lang === "python") {
      setOutputMode("text");
      setTextOutput("⏳ Loading Python runtime…\nFirst load may take a few seconds (WASM + stdlib).");
      setPyodideLoading(true);

      let pyodide;
      try {
        // Lazy-load self-hosted Pyodide (see loadPyodideFromPublic above)
        pyodide = await loadPyodideFromPublic();
        pyodideRef.current = pyodide;
      } catch (loadErr) {
        setPyodideLoading(false);
        const errMsg = `❌ Python runtime unavailable:\n${loadErr.message}\n\nEnsure public/pyodide/ contains the Pyodide distribution files.`;
        setTextOutput(errMsg);
        emitCodeOutput("text", errMsg, "", []);
        return;
      }

      setPyodideLoading(false);
      setTextOutput("");

      try {
        // Redirect stdout/stderr to StringIO buffers before each run.
        // This captures print() and error tracebacks into JS-accessible strings.
        pyodide.runPython(
          `import sys, io\n_out=io.StringIO()\n_err=io.StringIO()\nsys.stdout=_out\nsys.stderr=_err`
        );
        await pyodide.runPythonAsync(code);
        const stdout = pyodide.runPython("_out.getvalue()");
        const stderr = pyodide.runPython("_err.getvalue()");
        const combined = [stdout, stderr ? `[stderr]\n${stderr}` : ""]
          .filter(Boolean)
          .join("\n");
        const finalOut = combined || "(no output)";
        setTextOutput(finalOut);
        emitCodeOutput("text", finalOut, "", []);
      } catch (runErr) {
        // PythonError includes the full traceback in err.message
        let errText = runErr.message || String(runErr);
        try {
          const stderr = pyodide.runPython("_err.getvalue()");
          if (stderr) errText = stderr;
        } catch {
          // ignore — use runErr.message
        }
        const finalErr = `❌ ${errText}`;
        setTextOutput(finalErr);
        emitCodeOutput("text", finalErr, "", []);
      }
    }
  };

  // ─── Derived values ─────────────────────────────────────────────────────────

  const isBroadcasting = broadcastState === "live" || broadcastState === "paused";
  const isPaused = broadcastState === "paused";
  const isRecording = recordingState === "recording";
  const isFormValid =
    formData.lectureName.trim() !== "" &&
    formData.subject.trim() !== "" &&
    formData.password.trim() !== "" &&
    formData.labRoom.trim() !== "" &&
    selectedClassIds.length > 0;
  const viewerCount = connectedStudents.length;
  const hasMic = !!micStreamRef.current;

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-bg-base">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border bg-bg-surface flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {isBroadcasting && !isPaused && <StatusBadge status="live" />}
          {isPaused && (
            <span className="px-2 py-1 text-xs font-mono border border-accent-warning/20 bg-accent-warning/10 text-accent-warning rounded-sm">
              ⏸ PAUSED
            </span>
          )}
          {!isBroadcasting && (
            <span className="px-2 py-1 text-xs font-mono text-text-muted">
              Not Broadcasting
            </span>
          )}
          {isBroadcasting && (
            <span className="font-mono font-medium tabular-nums text-base text-text-primary">
              {formatTime(sessionSeconds)}
            </span>
          )}
          {isBroadcasting && (
            <>
              <div className="h-4 w-px bg-border" />
              <span className="text-sm text-text-secondary">
                {viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Mode pills — only when a session is active */}
          {isBroadcasting && (
            <div className="flex items-center gap-0.5 p-1 bg-bg-elevated rounded-lg border border-border">
              <button
                onClick={() => handleModeSwitch("screen")}
                className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeMode === "screen"
                    ? "bg-bg-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Screen Share
              </button>
              <button
                onClick={() => handleModeSwitch("editor")}
                className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeMode === "editor"
                    ? "bg-bg-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Code Editor
              </button>
            </div>
          )}

          {/* Mic warning */}
          {micWarning && isBroadcasting && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent-warning/10 border border-accent-warning/20 rounded text-xs text-accent-warning">
              <TriangleAlert className="w-3 h-3 flex-shrink-0" />
              <span className="max-w-[200px] truncate">{micWarning}</span>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-critical/10 border border-accent-critical/20 rounded">
              <Circle className="w-3 h-3 text-accent-critical fill-accent-critical" />
              <span className="text-xs font-mono text-accent-critical">
                REC <span className="tabular-nums">{formatTime(recordingSeconds)}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Preview / Editor */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* Content container */}
          <div className="flex-1 bg-bg-surface border-2 border-border rounded-lg flex flex-col relative overflow-hidden">

            {/* ── SCREEN SHARE MODE ────────────────────────────────────────── */}
            {activeMode === "screen" && (
              <>
                {isBroadcasting && !isPaused ? (
                  <>
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    <div className="absolute top-4 left-4 z-10">
                      <StatusBadge status="live" />
                    </div>
                  </>
                ) : isPaused ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Pause className="w-16 h-16 text-accent-warning mx-auto mb-3" />
                      <p className="text-text-secondary">Broadcast Paused</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <MonitorStop className="w-16 h-16 text-text-muted mx-auto mb-3" />
                      <p className="text-text-secondary">Not Broadcasting</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── CODE EDITOR MODE ─────────────────────────────────────────── */}
            {activeMode === "editor" && (
              <div className="flex flex-col h-full">

                {/* Editor toolbar */}
                <div
                  className="flex items-center gap-2 px-3 border-b border-border bg-bg-elevated flex-shrink-0"
                  style={{ height: "44px" }}
                >
                  {/* Language selector */}
                  <select
                    value={editorLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="h-7 px-2 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent-info/50"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>

                  {/* Editor Live / Paused toggle — distinct from broadcast pause */}
                  <button
                    onClick={handleEditorLiveToggle}
                    className={`h-7 px-3 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 ${
                      editorLiveStatus === "live"
                        ? "bg-accent-success/10 border-accent-success/30 text-accent-success hover:bg-accent-success/20"
                        : "bg-accent-warning/10 border-accent-warning/30 text-accent-warning hover:bg-accent-warning/20"
                    }`}
                    title={
                      editorLiveStatus === "live"
                        ? "Students see every keystroke (200ms delay) — click to edit privately"
                        : "Students are frozen on last sync — click to resume live"
                    }
                  >
                    {editorLiveStatus === "live" ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-success inline-block" />
                        Live
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3" />
                        Paused
                      </>
                    )}
                  </button>

                  <div className="flex-1" />

                  {/* Clear output */}
                  {outputMode !== "none" && (
                    <button
                      onClick={() => {
                        setOutputMode("none");
                        setConsoleLines([]);
                        setTextOutput("");
                      }}
                      className="h-7 px-2 text-xs text-text-muted hover:text-text-secondary border border-border rounded transition-colors"
                    >
                      Clear output
                    </button>
                  )}

                  {/* Run button */}
                  {editorLanguage !== "plaintext" && (
                    <button
                      onClick={handleRunCode}
                      disabled={pyodideLoading}
                      className="h-7 px-3 text-xs font-medium bg-accent-info hover:bg-accent-info/90 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
                    >
                      {pyodideLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Run
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Monaco Editor — flex-1 so it fills all remaining height */}
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <Editor
                    height="100%"
                    language={editorLanguage === "plaintext" ? "plaintext" : editorLanguage}
                    theme="vs-dark"
                    value={editorCode}
                    onChange={handleEditorChange}
                    options={{
                      fontSize: 14,
                      fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', monospace",
                      minimap: { enabled: false },
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                      padding: { top: 12, bottom: 12 },
                      lineNumbers: "on",
                      renderLineHighlight: "line",
                      tabSize: 2,
                      automaticLayout: true,
                    }}
                  />
                </div>

                {/* Output panel — shown after Run is clicked */}
                {outputMode !== "none" && (
                  <div
                    style={{
                      height: "220px",
                      flexShrink: 0,
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Rendered iframe (HTML / CSS / JS DOM) */}
                    {(outputMode === "iframe" || outputMode === "console") && (
                      <iframe
                        key={iframeKey}
                        srcDoc={iframeSrcdoc}
                        sandbox="allow-scripts"
                        title="Code output"
                        style={{
                          width: "100%",
                          flex: outputMode === "console" ? "0 0 55%" : "1",
                          border: "none",
                          background: "#fff",
                          display: "block",
                        }}
                      />
                    )}
                    {/* Console / text output */}
                    {(outputMode === "console" || outputMode === "text") && (
                      <pre
                        style={{
                          margin: 0,
                          padding: "8px 12px",
                          flex: outputMode === "console" ? "0 0 45%" : "1",
                          overflow: "auto",
                          background: "var(--bg-base)",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          borderTop: outputMode === "console" ? "1px solid var(--border)" : "none",
                        }}
                      >
                        {outputMode === "console"
                          ? consoleLines.length > 0
                            ? consoleLines.join("\n")
                            : "// No console output"
                          : textOutput || "(no output)"}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Control Bar ────────────────────────────────────────────────── */}
          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            {!isBroadcasting ? (
              <Button
                onClick={handleOpenSetupModal}
                className="bg-accent-success hover:bg-accent-success/90 text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Broadcast
              </Button>
            ) : (
              <>
                {/* Pause / Resume (broadcast-level) */}
                <Button
                  variant="outline"
                  onClick={handleTogglePause}
                  className="border-accent-warning text-accent-warning hover:bg-accent-warning/10"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>

                {/* Record */}
                <Button
                  variant="outline"
                  onClick={handleToggleRecording}
                  className={
                    isRecording
                      ? "border-accent-critical text-accent-critical hover:bg-accent-critical/10"
                      : "border-border"
                  }
                >
                  <Circle className={`w-4 h-4 mr-2 ${isRecording ? "fill-accent-critical" : ""}`} />
                  {isRecording ? "Stop Recording" : "Record"}
                </Button>

                {/* Mic toggle — only if mic was granted */}
                {(hasMic || micWarning === "") && (
                  <Button
                    variant="outline"
                    onClick={handleMicToggle}
                    disabled={!hasMic}
                    className={
                      micMuted
                        ? "border-accent-warning/60 text-accent-warning hover:bg-accent-warning/10"
                        : micWarning
                        ? "border-border text-text-muted opacity-50"
                        : "border-border text-text-secondary hover:bg-bg-elevated"
                    }
                    title={
                      !hasMic
                        ? "Microphone unavailable"
                        : micMuted
                        ? "Unmute microphone"
                        : "Mute microphone"
                    }
                  >
                    {micMuted || !hasMic ? (
                      <MicOff className="w-4 h-4 mr-2" />
                    ) : (
                      <Mic className="w-4 h-4 mr-2" />
                    )}
                    {micMuted ? "Unmute" : "Mute"}
                  </Button>
                )}

                {/* Screen Share toggle — shown when session is active */}
                <Button
                  variant="outline"
                  onClick={isScreenSharing ? handleStopScreenShareInternal : handleStartScreenShare}
                  className={
                    isScreenSharing
                      ? "border-accent-info/60 text-accent-info hover:bg-accent-info/10"
                      : "border-border text-text-secondary hover:bg-bg-elevated"
                  }
                  title={isScreenSharing ? "Stop screen sharing (session stays active)" : "Share your screen with students"}
                >
                  {isScreenSharing ? (
                    <>
                      <MonitorStop className="w-4 h-4 mr-2" />
                      Stop Screen Share
                    </>
                  ) : (
                    <>
                      <Monitor className="w-4 h-4 mr-2" />
                      Start Screen Share
                    </>
                  )}
                </Button>

                {/* Stop broadcast */}
                <Button
                  variant="outline"
                  onClick={() => setShowStopConfirm(true)}
                  className="border-accent-critical text-accent-critical hover:bg-accent-critical/10"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop Broadcast
                </Button>
              </>
            )}
          </div>
          {/* Screen share error — shown below control bar */}
          {screenShareError && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-accent-critical/10 border border-accent-critical/20 rounded text-xs text-accent-critical">
              <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{screenShareError}</span>
              <button onClick={() => setScreenShareError("")} className="ml-auto text-accent-critical/60 hover:text-accent-critical">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* ── Right: Viewer sidebar ─────────────────────────────────────────── */}
        <div className="w-64 border-l border-border bg-bg-surface overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Connected Students</h3>
            <p className="text-xs text-text-secondary mt-0.5">{connectedStudents.length} total</p>
          </div>

          <div className="p-2 space-y-1">
            {connectedStudents.length > 0 ? (
              connectedStudents.map((student, index) => {
                // Derive badge status from the explicit `status` field:
                //   'live' → green LIVE badge (in fullscreen, tab visible)
                //   'idle' → amber NOT VIEWING badge (lost fullscreen or tab hidden)
                //   'left' → red LEFT badge (socket disconnected; tile removed after 5s)
                const tileStatus = deriveConnectionStatus(student);
                return (
                  <div
                    key={student.socket_id}
                    className={`px-3 py-2 rounded transition-colors ${
                      tileStatus === 'left'
                        ? 'bg-accent-critical/5 border border-accent-critical/20'
                        : 'hover:bg-bg-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${
                        tileStatus === 'left' ? 'text-text-muted' : 'text-text-primary'
                      }`}>
                        {student.student_name || `Student ${index + 1}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {tileStatus === 'idle' && (
                          <span className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" title="Out of Focus" />
                        )}
                        {tileStatus === 'left' ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-accent-critical/15 text-accent-critical border border-accent-critical/30">
                            LEFT
                          </span>
                        ) : (
                          <StatusBadge status={tileStatus === 'idle' ? 'idle' : 'live'} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-text-muted font-mono">
                        {student.socket_id.slice(0, 8)}…
                      </span>
                      {student.focusLossCount > 0 && (
                        <span className="text-[10px] text-accent-warning font-semibold">
                          left view {student.focusLossCount}x
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 px-3 gap-3">
                <Users className="w-12 h-12 text-text-muted" />
                <div className="text-center">
                  <p className="text-sm font-medium text-text-primary">No students connected</p>
                  <p className="text-xs text-text-muted mt-1">
                    Share the session password to let students join.
                  </p>
                </div>

                {/* Session info card */}
                {isBroadcasting && sessionInfo && (
                  <div className="w-full mt-2 p-3 bg-bg-elevated border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-text-muted">Lecture</p>
                        <p className="text-xs text-text-primary truncate">{sessionInfo.lectureName}</p>
                      </div>
                      <button
                        onClick={() => handleCopy("lecture", sessionInfo.lectureName)}
                        className="flex-shrink-0 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {copiedField === "lecture" ? (
                          <Check className="w-3.5 h-3.5 text-accent-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="h-px bg-border" />

                    <div className="min-w-0">
                      <p className="text-xs text-text-muted">Target Classes</p>
                      <p className="text-xs text-text-primary truncate">
                        {sessionInfo.class_ids && sessionInfo.class_ids.length > 0
                          ? sessionInfo.class_ids
                              .map((cid) => classes.find((c) => c.id === Number(cid))?.name || `Class ${cid}`)
                              .join(", ")
                          : "None"}
                      </p>
                    </div>

                    <div className="h-px bg-border" />

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-text-muted">Password</p>
                        <p className="text-xs text-text-primary font-mono tracking-widest">
                          {showPassword ? sessionInfo.password : "••••••••"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setShowPassword((p) => !p)}
                          className="text-text-muted hover:text-text-secondary transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleCopy("password", sessionInfo.password)}
                          className="text-text-muted hover:text-text-secondary transition-colors"
                        >
                          {copiedField === "password" ? (
                            <Check className="w-3.5 h-3.5 text-accent-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    <button
                      onClick={() => {
                        const msg =
                          `📚 Live Lab Session is Active!\n\n` +
                          `Lecture: ${sessionInfo.lectureName}\n` +
                          `Subject: ${sessionInfo.subject}\n` +
                          `Lab Room: ${sessionInfo.labRoom}\n` +
                          `Password: ${sessionInfo.password}\n\n` +
                          `Log in to the student portal, enter the password, and click "JOIN NOW".`;
                        handleCopy("invite", msg);
                      }}
                      className="w-full py-1.5 px-2 bg-accent-info/10 hover:bg-accent-info/20 text-accent-info border border-accent-info/30 rounded flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
                    >
                      {copiedField === "invite" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-accent-success" />
                          Invite Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Invite Message
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Session Setup Modal ──────────────────────────────────────────────── */}
      <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
        <DialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Start New Broadcast Session
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Lecture Name
              </label>
              <Input
                type="text"
                placeholder="e.g., Binary Search Trees — Lecture 12"
                value={formData.lectureName}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, lectureName: e.target.value }))
                }
                className="bg-bg-elevated border-border text-text-primary placeholder:text-text-muted"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Subject
              </label>
              <Input
                type="text"
                placeholder="e.g., Data Structures & Algorithms"
                value={formData.subject}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, subject: e.target.value }))
                }
                className="bg-bg-elevated border-border text-text-primary placeholder:text-text-muted"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Session Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Students will need this to join"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, password: e.target.value }))
                  }
                  className="bg-bg-elevated border-border text-text-primary placeholder:text-text-muted pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Lab Room
              </label>
              <Input
                type="text"
                placeholder="LAB 301"
                value={formData.labRoom}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, labRoom: e.target.value }))
                }
                className="bg-bg-elevated border-border text-text-primary placeholder:text-text-muted"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Target Classes
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {classes.map((cls) => {
                  const isSelected = selectedClassIds.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedClassIds(selectedClassIds.filter((id) => id !== cls.id));
                        } else {
                          setSelectedClassIds([...selectedClassIds, cls.id]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-accent-info/20 border-accent-info text-accent-info"
                          : "bg-bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-border/80"
                      }`}
                    >
                      <span>{cls.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {modalError && (
            <p className="text-sm text-accent-critical mt-1">{modalError}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSetupModal(false)}
              className="border-border text-text-secondary hover:bg-bg-elevated"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartBroadcast}
              disabled={!isFormValid || startLoading}
              className="bg-accent-info hover:bg-accent-info/90 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Monitor className="w-4 h-4 mr-2" />
              {startLoading ? "Starting…" : "Start Broadcasting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stop Broadcast Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              End this broadcast session?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This will disconnect all students and stop any recording.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-text-secondary hover:bg-bg-elevated bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStop}
              className="bg-accent-critical hover:bg-accent-critical/90 text-white border-0"
            >
              Stop Broadcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
