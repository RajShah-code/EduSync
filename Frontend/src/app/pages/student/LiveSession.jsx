import { useState, useEffect, useRef } from "react";
import { Monitor, MonitorStop, Loader2, Play, Mic, Maximize2, AlertTriangle } from "lucide-react";
import { useLocation, useOutletContext, useNavigate } from "react-router";
import Editor from "@monaco-editor/react";
import { sessionStore } from "../../store/sessionStore";
import { getSocket } from "../../store/socket";
import { useFocusGuard } from "../../hooks/useFocusGuard";

// ─── ICE / STUN Configuration ─────────────────────────────────────────────────
// Must match LiveBroadcast.jsx exactly.
// NOTE: A TURN server will be required for students behind restrictive NAT/firewalls.
const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ─── Language definitions (mirrors LiveBroadcast.jsx) ─────────────────────────
const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "plaintext", label: "Plain Text" },
];

// ─── Helpers (identical to LiveBroadcast.jsx — each side runs independently) ──

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

const buildJsSrcdoc = (code) =>
  `<!DOCTYPE html><html><head>
<script>
(function(){
  const send=(m,args)=>{
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch{return String(a)}}).join(' ');
    window.parent.postMessage({type:'__edusync_student_console__',method:m,msg},'*');
  };
  ['log','warn','error','info'].forEach(fn=>{console[fn]=(...a)=>send(fn,a);});
  window.onerror=(msg,_,line)=>{send('error',['Line '+line+': '+msg]);return true;};
  window.onunhandledrejection=e=>{send('error',['Unhandled promise: '+e.reason]);};
})();
<\/script>
</head>
<body style="margin:0;background:#1a1a24;color:#f0f0f5;font-family:system-ui;padding:12px">
<script>
try{
${code}
}catch(e){window.parent.postMessage({type:'__edusync_student_console__',method:'error',msg:e.message},'*');}
<\/script>
</body></html>`;

// ─── Pyodide lazy-loader (self-hosted) ─────────────────────────────────────────
//
// Student-side Pyodide uses the same self-hosted files at /pyodide/ as the teacher.
// Module-level singleton prevents re-loading when the component re-mounts.
// Only triggers when student selects Python and clicks Run for the first time.
let _studentPyodideLoadPromise = null;

async function loadStudentPyodide() {
  if (_studentPyodideLoadPromise) return _studentPyodideLoadPromise;

  _studentPyodideLoadPromise = (async () => {
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
              "Could not load /pyodide/pyodide.js — ensure Pyodide files are in public/pyodide/"
            )
          );
        document.head.appendChild(el);
      });
    }
    return globalThis.loadPyodide({ indexURL: "/pyodide/" });
  })();

  return _studentPyodideLoadPromise;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasJoinedSession, rejoinStatus, setRejoinStatus, rejoinCount, sessionStateCache } = useOutletContext();

  useEffect(() => {
    if (!hasJoinedSession) navigate("/student");
  }, [hasJoinedSession, navigate]);

  const joinedSession = location.state?.session ?? sessionStore.getSession();
  const isLive = joinedSession !== null;

  // Decode student's own ID from the JWT stored in localStorage.
  // Used by useFocusGuard to emit student:focus_lost / student:focus_regained
  // with the correct student_id payload. No additional fetch needed.
  const studentId = (() => {
    try {
      const token = localStorage.getItem("edusync_token");
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.id ?? null;
    } catch {
      return null;
    }
  })();

  // ── WebRTC broadcast status ─────────────────────────────────────────────────
  // 'waiting'    — in session, waiting for teacher's WebRTC offer
  // 'connecting' — offer received, ICE negotiation in progress
  // 'live'       — stream flowing, video rendering
  // 'ended'      — teacher stopped screen share (webrtc:broadcast_ended)
  const [broadcastStatus, setBroadcastStatus] = useState("waiting");

  // ── Audio state ─────────────────────────────────────────────────────────────
  // isMuted starts true — browsers require user gesture before audio can play.
  // We show a prompt overlay; clicking it unmutes the video element.
  const [isMuted, setIsMuted] = useState(true);

  // ── Broadcast mode (mirrors teacher's activeMode via editor:mode_changed) ───
  const [activeMode, setActiveMode] = useState("screen");

  // ── Mirrored editor state (synced from teacher) ─────────────────────────────
  const [mirroredCode, setMirroredCode] = useState("");
  const [mirroredLanguage, setMirroredLanguage] = useState("javascript");
  const [mirroredOutput, setMirroredOutput] = useState({
    outputMode: "none",
    iframeSrcdoc: "",
    consoleLines: [],
    textOutput: "",
  });

  // ── Student-local editor state (NEVER synced back to teacher or other students) ──
  const [studentCode, setStudentCode] = useState("");
  const [studentLanguage, setStudentLanguage] = useState("javascript");
  const [studentOutputMode, setStudentOutputMode] = useState("none");
  const [studentIframeSrcdoc, setStudentIframeSrcdoc] = useState("");
  const [studentIframeKey, setStudentIframeKey] = useState(0);
  const [studentConsoleLines, setStudentConsoleLines] = useState([]);
  const [studentTextOutput, setStudentTextOutput] = useState("");
  const [studentPyodideLoading, setStudentPyodideLoading] = useState(false);

  // ── View-only editor flag ───────────────────────────────────────────────────
  // editingEnabled will be set true when a Task is assigned to this student (future feature).
  // Do not remove the underlying edit logic — only the readOnly gate and banner visibility
  // are controlled by this flag. All studentCode state, sync logic, and Run functionality
  // remain intact regardless of this flag's value.
  const [editingEnabled] = useState(false); // hardcoded false until Task feature exists

  // ── Sync banner state ───────────────────────────────────────────────────────
  // Only relevant when editingEnabled === true (students can diverge from teacher code).
  // When editingEnabled is false, Monaco is readOnly so divergence is impossible.
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [pendingTeacherCode, setPendingTeacherCode] = useState(null);
  const [pendingTeacherLanguage, setPendingTeacherLanguage] = useState(null);

  // ── WebRTC refs ─────────────────────────────────────────────────────────────
  const peerConnectionRef = useRef(null);
  const videoRef = useRef(null);
  const teacherSocketIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]); // ICE candidates buffered before setRemoteDescription

  // ── Editor refs ─────────────────────────────────────────────────────────────
  const pyodideRef = useRef(null);
  const lastTeacherCodeRef = useRef(""); // last code received from teacher:sync
  const lastTeacherLanguageRef = useRef("javascript");
  const hasDivergedRef = useRef(false);  // true when student has edited away from teacher's code

  // ── Focus Guard ─────────────────────────────────────────────────────────────
  // useFocusGuard is the ONLY hook/component that touches the Fullscreen API
  // and page-visibility events. LiveSession.jsx only reads the clean interface below.
  // See Frontend/src/app/hooks/useFocusGuard.js for the isolation contract.
  const {
    containerRef,
    isFullscreen,
    hasFocus,
    needsGesture,
    requestFullscreen,
  } = useFocusGuard({
    sessionId: joinedSession?.id ?? null,
    studentId,
    enabled: isLive,
  });

  // ── Trigger fullscreen on session join ─────────────────────────────────────
  // Called once when the student first enters a live session. The hook handles
  // the NotAllowedError case (sets needsGesture=true → overlay shown).
  useEffect(() => {
    if (isLive && rejoinStatus !== "waiting" && rejoinStatus !== "denied") {
      requestFullscreen();
    }
  }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also trigger when rejoin is approved
  useEffect(() => {
    if (rejoinStatus === "approved") {
      requestFullscreen();
    }
  }, [rejoinStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync initial state from the layout cache when it arrives
  useEffect(() => {
    if (sessionStateCache) {
      console.log("[LiveSession] Syncing state from layout cache:", sessionStateCache);
      const { mode, code, language, output, currentMode } = sessionStateCache;
      const activeM = currentMode || mode;
      setActiveMode(activeM);
      if (activeM !== 'screen') {
        setBroadcastStatus('ended');
      } else {
        if (videoRef.current?.srcObject) {
          setBroadcastStatus('live');
        } else {
          setBroadcastStatus('waiting');
        }
      }
      setMirroredCode(code ?? "");
      setMirroredLanguage(language ?? "javascript");
      if (output) {
        setMirroredOutput(output);
      }
      if (!editingEnabled) {
        setStudentCode(code ?? "");
        setStudentLanguage(language ?? "javascript");
        lastTeacherCodeRef.current = code ?? "";
        lastTeacherLanguageRef.current = language ?? "javascript";
      }
    }
  }, [sessionStateCache, editingEnabled]);

  // ── WebRTC cleanup ──────────────────────────────────────────────────────────
  const cleanupPeerConnection = () => {
    console.log(`[WEBRTC-DEBUG] student: cleanupPeerConnection called, pcState=${peerConnectionRef.current?.connectionState ?? 'null'} ts=${Date.now()}`);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log(`[WEBRTC-DEBUG] student: peerConnectionRef set to null ts=${Date.now()}`);
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    teacherSocketIdRef.current = null;
    pendingCandidatesRef.current = [];
  };

  // ── Unmute handler ──────────────────────────────────────────────────────────
  const handleUnmute = () => {
    setIsMuted(false);
    // Directly set on the DOM element because React's muted prop
    // is not reliably reflected after initial render in all browsers.
    if (videoRef.current) videoRef.current.muted = false;
  };

  // ── postMessage listener for student's JS iframe console ───────────────────
  // Uses a distinct prefix '__edusync_student_console__' to avoid any
  // cross-contamination with the teacher's iframe in the same browser session.
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type !== "__edusync_student_console__") return;
      const { method, msg } = event.data;
      const prefix =
        method === "error" ? "❌" : method === "warn" ? "⚠️" : method === "info" ? "ℹ️" : "›";
      setStudentConsoleLines((prev) => [...prev, `${prefix} ${msg}`]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Socket.io event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── webrtc:offer ──────────────────────────────────────────────────────────
    // Handles BOTH initial offers and re-offers (e.g., after teacher starts screen
    // share mid-session). Uses Perfect Negotiation rollback so this handler is safe
    // to call in any RTCPeerConnection signaling state.
    const handleOffer = async ({ sdp, session_id, teacher_socket_id }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && session_id !== currentSessionId) return;
      const pcState = peerConnectionRef.current ? peerConnectionRef.current.signalingState : 'stable';
      console.log(`[WEBRTC-DEBUG] student: offer received, teacherId=${teacher_socket_id} signalingState=${pcState} ts=${Date.now()}`);

      try {
        teacherSocketIdRef.current = teacher_socket_id;

        // Reuse existing PC if present; create fresh one only if none exists.
        let pc = peerConnectionRef.current;
        if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          // No usable PC — create a fresh one and wire all handlers.
          if (pc) pc.close();
          if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
            videoRef.current.srcObject = null;
          }
          pendingCandidatesRef.current = [];

          pc = new RTCPeerConnection(ICE_CONFIG);
          peerConnectionRef.current = pc;
          console.log(`[WEBRTC-DEBUG] student: new RTCPeerConnection created, teacherId=${teacher_socket_id} ts=${Date.now()}`);

          pc.ontrack = (event) => {
            console.log(`[WEBRTC-DEBUG] student: ontrack fired, kind=${event.track.kind} teacherId=${teacher_socket_id} ts=${Date.now()}`);
            console.log("[WebRTC Diagnosis] event.streams length:", event.streams.length);
            if (event.streams[0]) {
              console.log("[WebRTC Diagnosis] event.streams[0] tracks:", event.streams[0].getTracks().map(t => ({ id: t.id, kind: t.kind })));
            } else {
              console.log("[WebRTC Diagnosis] event.streams[0] is undefined");
            }
            if (videoRef.current) {
              if (!videoRef.current.srcObject || !(videoRef.current.srcObject instanceof MediaStream)) {
                console.log("[WebRTC Diagnosis] creating new MediaStream for srcObject");
                videoRef.current.srcObject = new MediaStream();
              }
              const existingTracks = videoRef.current.srcObject.getTracks();
              console.log("[WebRTC Diagnosis] existing tracks on video.srcObject:", existingTracks.map(t => ({ id: t.id, kind: t.kind })));
              if (!existingTracks.find(t => t.id === event.track.id)) {
                console.log("[WebRTC Diagnosis] adding track to srcObject:", event.track.id, event.track.kind);
                videoRef.current.srcObject.addTrack(event.track);
              } else {
                console.log("[WebRTC Diagnosis] track already exists on srcObject, skipping addTrack");
              }
              
              if (videoRef.current.paused) {
                console.log("[WebRTC Diagnosis] video is paused, calling play()");
                videoRef.current.play().then(() => {
                  console.log("[WebRTC Diagnosis] video.play() succeeded");
                }).catch((err) => {
                  console.warn("[WebRTC Diagnosis] video.play() failed:", err);
                });
              } else {
                console.log("[WebRTC Diagnosis] video is not paused (already playing)");
              }
              setBroadcastStatus('live');
            } else {
              console.log("[WebRTC Diagnosis] videoRef.current is null! Cannot assign srcObject or play.");
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate && teacherSocketIdRef.current) {
              socket.emit('webrtc:ice-candidate', {
                target_socket_id: teacherSocketIdRef.current,
                candidate: event.candidate,
                session_id,
              });
            }
          };

          pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE state=${pc.iceConnectionState}`);
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') setBroadcastStatus('live');
          };
        }

        // Perfect Negotiation: if not in stable state, rollback local description
        // before applying the incoming remote offer. This prevents glare.
        setBroadcastStatus('connecting');
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(sdp)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }

        // Drain buffered ICE candidates that arrived before setRemoteDescription
        for (const candidate of pendingCandidatesRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
          catch (err) {}
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          teacher_socket_id,
          sdp: pc.localDescription,
          session_id,
        });
        console.log(`[WEBRTC-DEBUG] student: answer sent to teacherId=${teacher_socket_id} ts=${Date.now()}`);
      } catch (err) {
        cleanupPeerConnection();
        setBroadcastStatus('waiting');
      }
    };

    // ── webrtc:ice-candidate ──────────────────────────────────────────────────
    // Buffer if remote description not yet set (race between offer and candidates).
    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (!candidate) return;
        const pc = peerConnectionRef.current;
        if (!pc) return;
        if (pc.remoteDescription?.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`[WEBRTC-DEBUG] student: ICE candidate added directly ts=${Date.now()}`);
        } else {
          pendingCandidatesRef.current.push(candidate);
          console.log(`[WEBRTC-DEBUG] student: ICE candidate buffered, buffer size=${pendingCandidatesRef.current.length} ts=${Date.now()}`);
        }
      } catch (err) {}
    };

    // ── webrtc:broadcast_ended ────────────────────────────────────────────────
    const handleBroadcastEnded = ({ session_id }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && session_id !== currentSessionId) return;
      console.log(`[WEBRTC-DEBUG] student: handleBroadcastEnded invoked, session_id=${session_id} ts=${Date.now()}`);
      // STEP 2 FIX: tear down the stale RTCPeerConnection so the next broadcast
      // cycle starts from a clean state. cleanupPeerConnection() explicitly nulls
      // peerConnectionRef.current, stops video tracks, and clears ICE buffers.
      cleanupPeerConnection();
      setBroadcastStatus('ended');
    };

    // ── teacher:mode_changed ───────────────────────────────────────────────────
    const handleTeacherModeChanged = ({ sessionId, mode }) => {
      console.log(`[WebRTC Diagnosis] teacher:mode_changed received, sessionId=${sessionId}, mode=${mode}`);
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && sessionId !== currentSessionId) return;
      setActiveMode(mode);
      if (mode !== 'screen') {
        setBroadcastStatus('ended');
      } else {
        if (videoRef.current?.srcObject) {
          console.log("[WebRTC Diagnosis] videoRef.current.srcObject is present, setting live");
          setBroadcastStatus('live');
        } else {
          console.log("[WebRTC Diagnosis] videoRef.current.srcObject is missing, setting waiting");
          setBroadcastStatus('waiting');
        }
      }
    };

    // ── teacher:code_changed ───────────────────────────────────────────────────
    const handleTeacherCodeChanged = ({ sessionId, code, language }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && sessionId !== currentSessionId) return;
      setMirroredCode(code);
      setMirroredLanguage(language);

      if (!editingEnabled) {
        setStudentCode(code);
        setStudentLanguage(language);
        lastTeacherCodeRef.current = code;
        lastTeacherLanguageRef.current = language;
      }
    };

    // ── teacher:code_output ────────────────────────────────────────────────────
    const handleTeacherCodeOutput = ({ sessionId, output }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && sessionId !== currentSessionId) return;
      setMirroredOutput(output);
    };

    // ── student:session_state ─────────────────────────────────────────────────
    // Sent by server immediately after join or rejoin-approval so the student
    // sees the current mode and code without waiting for the next editor:sync.
    const handleSessionState = (payload) => {
      console.log("[WebRTC Diagnosis] student:session_state received, payload:", JSON.stringify(payload));
      const { session_id, mode, code, language, output, currentMode } = payload;
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && session_id !== currentSessionId) return;

      const activeM = currentMode || mode;
      console.log(`[WebRTC Diagnosis] student:session_state setting activeMode to: ${activeM}`);
      setActiveMode(activeM);
      if (activeM !== 'screen') {
        setBroadcastStatus('ended');
      }

      setMirroredCode(code ?? "");
      setMirroredLanguage(language ?? "javascript");
      if (output) {
        setMirroredOutput(output);
      } else {
        setMirroredOutput({ outputMode: "none", iframeSrcdoc: "", consoleLines: [], textOutput: "" });
      }

      if (!editingEnabled) {
        setStudentCode(code ?? "");
        setStudentLanguage(language ?? "javascript");
        lastTeacherCodeRef.current = code ?? "";
        lastTeacherLanguageRef.current = language ?? "javascript";
      }
    };

    socket.on('webrtc:offer', handleOffer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:broadcast_ended", handleBroadcastEnded);
    socket.on("teacher:mode_changed", handleTeacherModeChanged);
    socket.on('teacher:code_changed', handleTeacherCodeChanged);
    socket.on('teacher:code_output', handleTeacherCodeOutput);

    return () => {
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('webrtc:broadcast_ended', handleBroadcastEnded);
      socket.off('teacher:mode_changed', handleTeacherModeChanged);
      socket.off('teacher:code_changed', handleTeacherCodeChanged);
      socket.off('teacher:code_output', handleTeacherCodeOutput);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupPeerConnection();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Student editor handlers ─────────────────────────────────────────────────

  // Student changes their local code — never emits any socket event.
  // Only relevant when editingEnabled === true (Monaco has readOnly: false).
  const handleStudentEditorChange = (value) => {
    if (!editingEnabled) return; // defensive guard — Monaco is readOnly anyway
    const v = value ?? "";
    setStudentCode(v);
    if (v !== lastTeacherCodeRef.current) {
      hasDivergedRef.current = true;
    }
  };

  const handleStudentLanguageChange = (lang) => {
    setStudentLanguage(lang);
    setStudentOutputMode("none"); // reset output when language changes
  };

  // Load latest: apply teacher's pending code, clear diverged flag
  const handleLoadLatest = () => {
    if (pendingTeacherCode !== null) {
      setStudentCode(pendingTeacherCode);
      setStudentLanguage(pendingTeacherLanguage ?? studentLanguage);
      lastTeacherCodeRef.current = pendingTeacherCode;
      lastTeacherLanguageRef.current = pendingTeacherLanguage ?? studentLanguage;
    }
    hasDivergedRef.current = false;
    setPendingTeacherCode(null);
    setPendingTeacherLanguage(null);
    setShowSyncBanner(false);
  };

  // Keep mine: dismiss banner but keep diverged flag so future syncs still show banner
  const handleKeepMine = () => {
    setShowSyncBanner(false);
    setPendingTeacherCode(null);
    setPendingTeacherLanguage(null);
    // hasDivergedRef stays true — next editor:sync will re-show the banner
  };

  // ── Student Run code ────────────────────────────────────────────────────────
  // 100% local execution — completely independent of teacher and other students.
  // Running code is never sent over any network connection.
  const handleStudentRunCode = async () => {
    const lang = studentLanguage;
    const code = studentCode;

    if (lang === "plaintext") return;

    if (lang === "html") {
      setStudentConsoleLines([]);
      setStudentOutputMode("iframe");
      setStudentIframeSrcdoc(code);
      setStudentIframeKey((k) => k + 1);
    } else if (lang === "css") {
      setStudentConsoleLines([]);
      setStudentOutputMode("iframe");
      setStudentIframeSrcdoc(wrapCssInHtml(code));
      setStudentIframeKey((k) => k + 1);
    } else if (lang === "javascript") {
      setStudentConsoleLines([]);
      setStudentOutputMode("console");
      setStudentIframeSrcdoc(buildJsSrcdoc(code));
      setStudentIframeKey((k) => k + 1);
    } else if (lang === "python") {
      setStudentOutputMode("text");
      setStudentTextOutput("⏳ Loading Python runtime…");
      setStudentPyodideLoading(true);

      let pyodide;
      try {
        pyodide = await loadStudentPyodide();
        pyodideRef.current = pyodide;
      } catch (loadErr) {
        setStudentPyodideLoading(false);
        setStudentTextOutput(
          `❌ Python runtime unavailable:\n${loadErr.message}\n\n` +
            `Ensure public/pyodide/ contains the Pyodide distribution files.`
        );
        return;
      }

      setStudentPyodideLoading(false);
      setStudentTextOutput("");

      try {
        pyodide.runPython(
          `import sys, io\n_out=io.StringIO()\n_err=io.StringIO()\nsys.stdout=_out\nsys.stderr=_err`
        );
        await pyodide.runPythonAsync(code);
        const stdout = pyodide.runPython("_out.getvalue()");
        const stderr = pyodide.runPython("_err.getvalue()");
        const combined = [stdout, stderr ? `[stderr]\n${stderr}` : ""]
          .filter(Boolean)
          .join("\n");
        setStudentTextOutput(combined || "(no output)");
      } catch (runErr) {
        let errText = runErr.message || String(runErr);
        try {
          const stderr = pyodide.runPython("_err.getvalue()");
          if (stderr) errText = stderr;
        } catch {
          // ignore
        }
        setStudentTextOutput(`❌ ${errText}`);
      }
    }
  };

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    // containerRef is provided by useFocusGuard — requestFullscreen() targets this element.
    // Do NOT add any intervening wrapper between this div and the fullscreen trigger.
    <div ref={containerRef} className="h-screen flex flex-col bg-bg-base" style={{ position: "relative" }}>

      {/* ── REJOIN WAITING OVERLAY ─────────────────────────────────────────────
          Shown when the student was previously in this session and disconnected.
          The teacher must explicitly approve before the session UI is shown.
          This overlay sits on top of everything — no session content underneath. */}
      {rejoinStatus === "waiting" && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg-base">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-accent-info/10 border border-accent-info/20 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-accent-info animate-spin" />
            </div>
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Waiting for instructor approval
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              Your instructor has been notified of your rejoin request.
              Please wait — this may take a moment.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border rounded-full text-xs text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-info animate-pulse inline-block" />
            {rejoinCount >= 2
              ? `Waiting for instructor approval (attempt #${rejoinCount})`
              : `Waiting for ${joinedSession?.lecture_name ?? "session"} approval`
            }
          </div>
        </div>
      )}

      {/* ── REJOIN DENIED OVERLAY ──────────────────────────────────────────────
          Shown when the teacher clicked "Deny" on the rejoin toast. */}
      {rejoinStatus === "denied" && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg-base">
          <div className="w-20 h-20 rounded-full bg-accent-critical/10 border border-accent-critical/20 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-accent-critical" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Rejoin request denied
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              The instructor did not approve your request to rejoin this session.
              Please contact your instructor if you believe this is an error.
            </p>
          </div>
          <button
            onClick={() => {
              setRejoinStatus("idle");
              navigate("/student");
            }}
            className="px-6 py-2.5 bg-bg-surface border border-border hover:border-accent-info/40 text-text-primary text-sm font-medium rounded-lg transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* ── FULLSCREEN GESTURE OVERLAY ─────────────────────────────────────────
          Shown when requestFullscreen() was blocked by the browser (needs a
          direct user-gesture click). Non-dismissible — student must click to enter. */}
      {isLive && needsGesture && rejoinStatus !== "waiting" && rejoinStatus !== "denied" && (
        <div
          className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-bg-base/95 backdrop-blur cursor-pointer"
          onClick={requestFullscreen}
        >
          <div className="w-20 h-20 rounded-full bg-accent-info/10 border border-accent-info/20 flex items-center justify-center animate-pulse">
            <Maximize2 className="w-10 h-10 text-accent-info" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Fullscreen required
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              This session must be viewed in fullscreen. Click anywhere to continue.
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); requestFullscreen(); }}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white text-sm font-medium rounded-lg transition-all"
          >
            <Maximize2 className="w-4 h-4" />
            Enter Fullscreen
          </button>
        </div>
      )}

      {/* ── FOCUS LOSS OVERLAY ─────────────────────────────────────────────────
          Shown when the student exits fullscreen or switches tabs during a session.
          Non-dismissible — they must click "Return to Session" which calls
          requestFullscreen() again. Your instructor has already been notified. */}
      {isLive && !hasFocus && isFullscreen === false && !needsGesture
        && rejoinStatus !== "waiting" && rejoinStatus !== "denied" && (
        <div
          className="absolute inset-0 z-[95] flex flex-col items-center justify-center gap-6"
          style={{
            background: "rgba(10, 10, 18, 0.97)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="w-20 h-20 rounded-full bg-accent-warning/10 border border-accent-warning/30 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-accent-warning" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              You've left the lecture view
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              Your instructor has been notified. Return to fullscreen to continue
              attending the session.
            </p>
          </div>
          <button
            onClick={requestFullscreen}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent-warning hover:bg-accent-warning/90 text-white text-sm font-medium rounded-lg transition-all"
          >
            <Maximize2 className="w-4 h-4" />
            Return to Session
          </button>
        </div>
      )}

      {/* ── MAIN SESSION CONTENT ───────────────────────────────────────────────
          Only shown when not in an override overlay state. */}
      <div className="flex-1 bg-gradient-to-br from-bg-base to-bg-elevated flex items-center justify-center p-6 overflow-hidden">
        {isLive ? (
          <div className="w-full h-full max-w-7xl bg-bg-surface border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 pb-4 flex-shrink-0">
              <h1 className="text-2xl font-semibold text-text-primary mb-1">
                {joinedSession.lecture_name ?? joinedSession.lectureName}
              </h1>
              <p className="text-text-secondary text-sm">
                {joinedSession.lab_room ?? joinedSession.labRoom} — Live Session
              </p>
            </div>

            <div className="flex-1 px-6 pb-6 overflow-hidden flex flex-col">

              {/* ── SCREEN SHARE MODE ─────────────────────────────────────── */}
              <div className={`flex-1 relative rounded-lg overflow-hidden border border-border bg-black ${
                activeMode === "screen" ? "" : "hidden"
              }`}>

                  {/* Video — always in DOM so ref persists across status changes */}
                  {/* muted={isMuted} is dynamic; autoplay requires initial mute */}
                  <video
                    ref={videoRef}
                    autoPlay
                    muted={isMuted}
                    playsInline
                    className={`w-full h-full object-contain transition-opacity duration-300 ${
                      broadcastStatus === "live" ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  {/* Waiting — teacher hasn't sent offer yet */}
                  {broadcastStatus === "waiting" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface/80 p-12 text-center border border-border border-dashed rounded-lg">
                      <Monitor className="w-16 h-16 text-text-muted mb-4 animate-pulse" />
                      <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Broadcast is live
                      </h2>
                      <p className="text-text-secondary max-w-md mx-auto">
                        Your instructor's screen will appear here once connected.
                      </p>
                    </div>
                  )}

                  {/* Connecting — ICE negotiation in progress */}
                  {broadcastStatus === "connecting" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface/80 p-12 text-center">
                      <Loader2 className="w-12 h-12 text-accent-info mb-4 animate-spin" />
                      <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Connecting to broadcast…
                      </h2>
                      <p className="text-text-secondary max-w-md mx-auto">
                        Establishing a secure peer connection. This usually takes a few seconds.
                      </p>
                    </div>
                  )}

                  {/* Ended — teacher stopped screen sharing */}
                  {broadcastStatus === "ended" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface/80 p-12 text-center">
                      <MonitorStop className="w-16 h-16 text-text-muted mb-4" />
                      <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Broadcast ended
                      </h2>
                      <p className="text-text-secondary max-w-md mx-auto">
                        The instructor has stopped screen sharing.
                      </p>
                    </div>
                  )}

                  {/* Audio unmute prompt — shown when video is live but audio is muted */}
                  {/* Browsers require a user gesture before audio can play.         */}
                  {broadcastStatus === "live" && isMuted && (
                    <button
                      onClick={handleUnmute}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-bg-surface/90 backdrop-blur border border-border rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent-info/40 transition-all shadow-lg"
                    >
                      <Mic className="w-4 h-4 text-accent-info" />
                      Click to enable sound
                    </button>
                  )}
              </div>

              {/* ── CODE EDITOR MODE ──────────────────────────────────────── */}
              <div className={`flex-1 flex flex-col border border-border rounded-lg overflow-hidden bg-bg-surface ${
                activeMode === "editor" ? "" : "hidden"
              }`}>

                  {/* Sync banner — non-blocking, shown when teacher pushed new code
                      while the student had already edited their local copy.
                      Only rendered when editingEnabled === true (students can diverge). */}
                  {editingEnabled && showSyncBanner && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-accent-info/10 border-b border-accent-info/20 flex-shrink-0">
                      <span className="text-sm text-text-secondary flex-1 min-w-0">
                        📝 Instructor updated the code
                      </span>
                      <button
                        onClick={handleLoadLatest}
                        className="text-xs font-semibold text-accent-info hover:underline flex-shrink-0"
                      >
                        Load latest
                      </button>
                      <span className="text-text-muted text-xs flex-shrink-0">·</span>
                      <button
                        onClick={handleKeepMine}
                        className="text-xs text-text-muted hover:text-text-secondary flex-shrink-0"
                      >
                        Keep mine
                      </button>
                    </div>
                  )}

                  {/* Editor toolbar */}
                  <div
                    className="flex items-center gap-2 px-3 border-b border-border bg-bg-elevated flex-shrink-0"
                    style={{ height: "44px" }}
                  >
                    {/* Language selector */}
                    <select
                      value={editingEnabled ? studentLanguage : mirroredLanguage}
                      onChange={editingEnabled ? (e) => handleStudentLanguageChange(e.target.value) : undefined}
                      disabled={!editingEnabled}
                      className="h-7 px-2 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent-info/50 disabled:opacity-80 disabled:cursor-not-allowed"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>

                    {/* Status hint — changes based on editingEnabled flag */}
                    <span className="text-xs text-text-muted">
                      {editingEnabled
                        ? "Your workspace — edits are local only"
                        : "View only — editing enabled when a task is assigned"}
                    </span>

                    <div className="flex-1" />

                    {/* Clear output — only when editingEnabled */}
                    {editingEnabled && studentOutputMode !== "none" && (
                      <button
                        onClick={() => {
                          setStudentOutputMode("none");
                          setStudentConsoleLines([]);
                          setStudentTextOutput("");
                        }}
                        className="h-7 px-2 text-xs text-text-muted hover:text-text-secondary border border-border rounded transition-colors"
                      >
                        Clear output
                      </button>
                    )}

                    {/* Run button — only when editingEnabled (task mode) */}
                    {editingEnabled && studentLanguage !== "plaintext" && (
                      <button
                        onClick={handleStudentRunCode}
                        disabled={studentPyodideLoading}
                        className="h-7 px-3 text-xs font-medium bg-accent-info hover:bg-accent-info/90 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
                      >
                        {studentPyodideLoading ? (
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

                  {/* Code display area */}
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <Editor
                      height="100%"
                      language={editingEnabled ? studentLanguage : mirroredLanguage}
                      theme="vs-dark"
                      value={editingEnabled ? studentCode : mirroredCode}
                      onChange={editingEnabled ? handleStudentEditorChange : undefined}
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
                        readOnly: !editingEnabled,
                        domReadOnly: !editingEnabled,
                      }}
                    />
                  </div>

                  {/* Output panel — local workspace output (if editingEnabled) */}
                  {editingEnabled && studentOutputMode !== "none" && (
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
                      {(studentOutputMode === "iframe" || studentOutputMode === "console") && (
                        <iframe
                          key={studentIframeKey}
                          srcDoc={studentIframeSrcdoc}
                          sandbox="allow-scripts"
                          title="Student code output"
                          style={{
                            width: "100%",
                            flex: studentOutputMode === "console" ? "0 0 55%" : "1",
                            border: "none",
                            background: "#fff",
                            display: "block",
                          }}
                        />
                      )}
                      {/* Console / text output */}
                      {(studentOutputMode === "console" || studentOutputMode === "text") && (
                        <pre
                          style={{
                            margin: 0,
                            padding: "8px 12px",
                            flex: studentOutputMode === "console" ? "0 0 45%" : "1",
                            overflow: "auto",
                            background: "var(--bg-base)",
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            borderTop:
                              studentOutputMode === "console"
                                ? "1px solid var(--border)"
                                : "none",
                          }}
                        >
                          {studentOutputMode === "console"
                            ? studentConsoleLines.length > 0
                              ? studentConsoleLines.join("\n")
                              : "// No console output"
                            : studentTextOutput || "(no output)"}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Output panel — mirrored output from teacher (if !editingEnabled) */}
                  {!editingEnabled && mirroredOutput.outputMode !== "none" && (
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
                      {(mirroredOutput.outputMode === "iframe" || mirroredOutput.outputMode === "console") && (
                        <iframe
                          key={mirroredOutput.iframeSrcdoc}
                          srcDoc={mirroredOutput.iframeSrcdoc}
                          sandbox="allow-scripts"
                          title="Mirrored code output"
                          style={{
                            width: "100%",
                            flex: mirroredOutput.outputMode === "console" ? "0 0 55%" : "1",
                            border: "none",
                            background: "#fff",
                            display: "block",
                          }}
                        />
                      )}
                      {/* Console / text output */}
                      {(mirroredOutput.outputMode === "console" || mirroredOutput.outputMode === "text") && (
                        <pre
                          style={{
                            margin: 0,
                            padding: "8px 12px",
                            flex: mirroredOutput.outputMode === "console" ? "0 0 45%" : "1",
                            overflow: "auto",
                            background: "var(--bg-base)",
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            borderTop:
                              mirroredOutput.outputMode === "console"
                                ? "1px solid var(--border)"
                                : "none",
                          }}
                        >
                          {mirroredOutput.outputMode === "console"
                            ? mirroredOutput.consoleLines.length > 0
                              ? mirroredOutput.consoleLines.join("\n")
                              : "// No console output"
                            : mirroredOutput.textOutput || "(no output)"}
                        </pre>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        ) : (
          /* No active session */
          <div className="text-center flex flex-col items-center justify-center gap-3">
            <Monitor className="w-12 h-12 text-text-muted" />
            <h3 className="text-base font-medium text-text-primary">No active broadcast</h3>
            <p className="text-sm text-text-secondary">
              Waiting for the instructor to start screen sharing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
