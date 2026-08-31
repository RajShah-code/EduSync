import { useState, useEffect, useRef } from "react";
import { IconDeviceDesktop as Monitor, IconDeviceDesktopOff as MonitorStop, IconLoader2 as Loader2, IconPlayerPlay as Play, IconMicrophone as Mic, IconArrowsMaximize as Maximize2, IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { useLocation, useOutletContext, useNavigate } from "react-router";
import Editor from "@monaco-editor/react";
import { WhiteboardCanvas } from "../../components/WhiteboardCanvas";
import { CodeOutputPanel } from "../../components/CodeOutputPanel";
import { sessionStore } from "../../store/sessionStore";
import { getSocket } from "../../store/socket";
import { useFocusGuard } from "../../hooks/useFocusGuard";
import { useAppGuard } from "../../hooks/useAppGuard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { StatusBadge } from "../../components/StatusBadge";

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
  { id: "plaintext", label: "Plain Text" },
  { id: "whiteboard", label: "Whiteboard" },
];

// ─── Helpers (identical to LiveBroadcast.jsx — each side runs independently) ──

const buildJsSrcdoc = (code) =>
  `<!DOCTYPE html><html><head>
<script>
(function(){
  const logs = [];
  const send=(m,args)=>{
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch{return String(a)}}).join(' ');
    logs.push({method:m,msg});
    window.parent.postMessage({type:'__edusync_student_console__',method:m,msg},'*');
  };
  ['log','warn','error','info'].forEach(fn=>{console[fn]=(...a)=>send(fn,a);});
  window.onerror=(msg,_,line)=>{send('error',['Line '+line+': '+msg]);return true;};
  window.onunhandledrejection=e=>{send('error',['Unhandled promise: '+e.reason]);};

  window.addEventListener('load', () => {
    setTimeout(() => {
      const hasVisibleOutput = document.body.children.length > 1 || (document.body.innerText || '').trim().length > 0;
      window.parent.postMessage({type:'__edusync_student_js_done__', logs, hasVisibleOutput}, '*');
    }, 50);
  });
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
let studentDebugSeq = 0;

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

  // Decode the student's class_id the same way — used by useAppGuard to
  // fetch this class's OS-level app allow-list for the current broadcast.
  const classId = (() => {
    try {
      const token = localStorage.getItem("edusync_token");
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.class_id ?? null;
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
  const [mirroredOutputDockPosition, setMirroredOutputDockPosition] = useState("bottom");
  const [mirroredOutputPanelSize, setMirroredOutputPanelSize] = useState(220);

  // ── Student-local editor state (NEVER synced back to teacher or other students) ──
  const [studentCode, setStudentCode] = useState("");
  const [studentLanguage, setStudentLanguage] = useState("javascript");
  const [studentOutputMode, setStudentOutputMode] = useState("none");
  const [studentOutputDockPosition, setStudentOutputDockPosition] = useState("bottom");
  const [studentOutputPanelSize, setStudentOutputPanelSize] = useState(220);
  const [studentJsHasVisibleOutput, setStudentJsHasVisibleOutput] = useState(false);
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
  const studentWhiteboardRef = useRef(null);
  const studentWhiteboardStrokesRef = useRef([]);
  const studentWhiteboardBgColorRef = useRef("#17171A");
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

  // useAppGuard is the ONLY hook that touches OS-level process enforcement
  // (Electron only — see Frontend/electron/main.cjs). On plain web it just
  // exposes the allow-list for the informational banner below; it never
  // attempts enforcement there, since a browser has no way to see or close
  // other OS processes at all.
  const { allowList } = useAppGuard({
    sessionId: joinedSession?.id ?? null,
    studentId,
    classId,
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
      if (event.data?.type === "__edusync_student_console__") {
        const { method, msg } = event.data;
        const prefix =
          method === "error" ? "❌" : method === "warn" ? "⚠️" : method === "info" ? "ℹ️" : "›";
        setStudentConsoleLines((prev) => [...prev, `${prefix} ${msg}`]);
      } else if (event.data?.type === "__edusync_student_js_done__") {
        const { logs, hasVisibleOutput } = event.data;
        setStudentJsHasVisibleOutput(Boolean(hasVisibleOutput));
        if (logs) {
          const lines = logs.map((l) => {
            const prefix =
              l.method === "error" ? "❌" : l.method === "warn" ? "⚠️" : l.method === "info" ? "ℹ️" : "›";
            return `${prefix} ${l.msg}`;
          });
          setStudentConsoleLines(lines);
        }
      }
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
      const offerSeq = ++studentDebugSeq;
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && session_id !== currentSessionId) return;

      const pcAtMomentOfferProcessed = peerConnectionRef.current
        ? `STALE OBJECT (connState=${peerConnectionRef.current.connectionState}, sigState=${peerConnectionRef.current.signalingState}, iceState=${peerConnectionRef.current.iceConnectionState})`
        : "NULL";

      console.log(
        `[DEBUG] student recv webrtc:offer: seq=#${offerSeq} | session_id=${session_id} | teacher_socket_id=${teacher_socket_id} | peerConnectionRef at moment offer processed=${pcAtMomentOfferProcessed} | ts=${Date.now()}`
      );

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
            console.log(
              `[DEBUG] student ontrack firing: trackKind=${event.track.kind} | trackId=${event.track.id} | trackEnabled=${event.track.enabled} | trackReadyState=${event.track.readyState} | streamsLen=${event.streams.length} | ts=${Date.now()}`
            );
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
              const candSeq = ++studentDebugSeq;
              console.log(
                `[DEBUG] student send webrtc:ice-candidate: seq=#${candSeq} | target=${teacherSocketIdRef.current} | candidateType=${event.candidate.type} | ts=${Date.now()}`
              );
              socket.emit('webrtc:ice-candidate', {
                target_socket_id: teacherSocketIdRef.current,
                candidate: event.candidate,
                session_id,
              });
            }
          };

          pc.oniceconnectionstatechange = () => {
            console.log(
              `[DEBUG] student ICE connection state change: iceConnectionState=${pc.iceConnectionState} | connectionState=${pc.connectionState} | signalingState=${pc.signalingState} | ts=${Date.now()}`
            );
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') setBroadcastStatus('live');
          };
        }

        // Perfect Negotiation: if not in stable state, rollback local description
        // before applying the incoming remote offer. This prevents glare.
        setBroadcastStatus('connecting');
        if (pc.signalingState !== 'stable') {
          console.log(
            `[DEBUG-RACE] student handleOffer: offer arrived when PC signalingState='${pc.signalingState}' (NON-STABLE — triggering rollback path) ts=${Date.now()}`
          );
          try {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(new RTCSessionDescription(sdp)),
            ]);
            console.log(
              `[DEBUG-RACE] student handleOffer: rollback + setRemoteDescription Promise.all RESOLVED successfully ts=${Date.now()}`
            );
          } catch (rollbackErr) {
            console.error(
              `[DEBUG-RACE] student handleOffer: rollback + setRemoteDescription Promise.all THREW ERROR: ${rollbackErr?.message || rollbackErr} ts=${Date.now()}`
            );
            throw rollbackErr;
          }
        } else {
          console.log(
            `[DEBUG-RACE] student handleOffer: offer arrived when PC signalingState='stable' ts=${Date.now()}`
          );
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log(
              `[DEBUG-RACE] student handleOffer: setRemoteDescription RESOLVED successfully ts=${Date.now()}`
            );
          } catch (srdErr) {
            console.error(
              `[DEBUG-RACE] student handleOffer: setRemoteDescription THREW ERROR: ${srdErr?.message || srdErr} ts=${Date.now()}`
            );
            throw srdErr;
          }
        }

        // Drain buffered ICE candidates that arrived before setRemoteDescription
        for (const candidate of pendingCandidatesRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
          catch (err) {}
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const answerSeq = ++studentDebugSeq;
        console.log(
          `[DEBUG] student send webrtc:answer: seq=#${answerSeq} | teacherId=${teacher_socket_id} | sdpType=${pc.localDescription.type} | ts=${Date.now()}`
        );
        socket.emit('webrtc:answer', {
          teacher_socket_id,
          sdp: pc.localDescription,
          session_id,
        });
      } catch (err) {
        console.error(
          `[DEBUG-RACE] student handleOffer: CATCH BLOCK FIRED — err=${err?.message || err} | cleaning up PC and setting status to 'waiting' ts=${Date.now()}`
        );
        cleanupPeerConnection();
        setBroadcastStatus('waiting');
      }
    };

    // ── webrtc:ice-candidate ──────────────────────────────────────────────────
    // Buffer if remote description not yet set (race between offer and candidates).
    const handleIceCandidate = async ({ candidate }) => {
      const iceRecvSeq = ++studentDebugSeq;
      console.log(
        `[DEBUG] student recv webrtc:ice-candidate: seq=#${iceRecvSeq} | candidateType=${candidate?.type} | buffered=${!peerConnectionRef.current?.remoteDescription?.type} | ts=${Date.now()}`
      );
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

      const endSeq = ++studentDebugSeq;
      const pcBefore = peerConnectionRef.current;
      const beforeState = pcBefore
        ? `NOT NULL (connState=${pcBefore.connectionState}, sigState=${pcBefore.signalingState}, iceState=${pcBefore.iceConnectionState})`
        : "NULL";
      console.log(
        `[DEBUG] student recv webrtc:broadcast_ended BEFORE cleanup: seq=#${endSeq} | session_id=${session_id} | peerConnectionRef=${beforeState} | ts=${Date.now()}`
      );

      cleanupPeerConnection();

      const pcAfter = peerConnectionRef.current;
      const afterState = pcAfter ? "NOT NULL" : "NULL";
      console.log(
        `[DEBUG] student recv webrtc:broadcast_ended AFTER cleanup: seq=#${endSeq} | peerConnectionRef=${afterState} | ts=${Date.now()}`
      );

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

    // ── teacher:whiteboard_stroke ──────────────────────────────────────────────
    const handleTeacherWhiteboardStroke = ({ sessionId, stroke, bgColor }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && String(sessionId) !== String(currentSessionId)) return;

      if (stroke && stroke.phase === "end") {
        studentWhiteboardStrokesRef.current.push(stroke);
      }
      if (bgColor) {
        studentWhiteboardBgColorRef.current = bgColor;
      }

      if (studentWhiteboardRef.current) {
        studentWhiteboardRef.current.applyRemoteStroke(stroke);
      }
    };

    // ── teacher:whiteboard_clear ───────────────────────────────────────────────
    const handleTeacherWhiteboardClear = ({ sessionId }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && String(sessionId) !== String(currentSessionId)) return;

      studentWhiteboardStrokesRef.current = [];
      if (studentWhiteboardRef.current) {
        studentWhiteboardRef.current.applyRemoteClear();
      }
    };

    // ── teacher:whiteboard_snapshot ───────────────────────────────────────────
    const handleTeacherWhiteboardSnapshot = ({ sessionId, strokes, bgColor }) => {
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && String(sessionId) !== String(currentSessionId)) return;

      studentWhiteboardStrokesRef.current = [...(strokes || [])];
      if (bgColor) {
        studentWhiteboardBgColorRef.current = bgColor;
      }

      if (studentWhiteboardRef.current) {
        studentWhiteboardRef.current.loadSnapshot(strokes, bgColor);
      }
    };

    // ── student:session_state ─────────────────────────────────────────────────
    // Sent by server immediately after join or rejoin-approval so the student
    // sees the current mode and code without waiting for the next editor:sync.
    const handleSessionState = (payload) => {
      console.log("[WebRTC Diagnosis] student:session_state received, payload:", JSON.stringify(payload));
      const { session_id, mode, code, language, output, currentMode, whiteboardStrokes, whiteboardBgColor } = payload;
      const currentSessionId = joinedSession?.id;
      if (currentSessionId && String(session_id) !== String(currentSessionId)) return;

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

      if (whiteboardStrokes) {
        studentWhiteboardStrokesRef.current = [...whiteboardStrokes];
      }
      if (whiteboardBgColor) {
        studentWhiteboardBgColorRef.current = whiteboardBgColor;
      }

      if (studentWhiteboardRef.current) {
        studentWhiteboardRef.current.loadSnapshot(
          studentWhiteboardStrokesRef.current,
          studentWhiteboardBgColorRef.current
        );
      }

      if (!editingEnabled) {
        setStudentCode(code ?? "");
        setStudentLanguage(language ?? "javascript");
        lastTeacherCodeRef.current = code ?? "";
        lastTeacherLanguageRef.current = language ?? "javascript";
      }
    };

    // DIAG-LOG-4: one-time log confirming the webrtc:offer listener is being attached
    console.log(`[DIAG] student: attaching webrtc:offer listener (mount) — socket.id=${socket.id} ts=${Date.now()}`);
    socket.on('webrtc:offer', handleOffer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:broadcast_ended", handleBroadcastEnded);
    socket.on("teacher:mode_changed", handleTeacherModeChanged);
    socket.on('teacher:code_changed', handleTeacherCodeChanged);
    socket.on('teacher:code_output', handleTeacherCodeOutput);
    socket.on('teacher:whiteboard_stroke', handleTeacherWhiteboardStroke);
    socket.on('teacher:whiteboard_clear', handleTeacherWhiteboardClear);
    socket.on('teacher:whiteboard_snapshot', handleTeacherWhiteboardSnapshot);
    socket.on('teacher:whiteboard_sync', handleTeacherWhiteboardSnapshot);
    socket.on('student:session_state', handleSessionState);

    // ── Request session-state snapshot AFTER all listeners are registered ──────
    // This is the structural fix for the task:closed race condition.
    // Previously, StudentLayout.jsx emitted this request immediately after calling
    // navigate(), before this component had mounted or registered its webrtc:offer
    // listener. The offer triggered by the server's response arrived at the socket
    // before the listener existed and was silently dropped by Socket.io.
    //
    // By emitting here — from within the same useEffect that attaches the listener,
    // synchronously after the socket.on() calls above — we guarantee:
    //   1. webrtc:offer is registered BEFORE the emit leaves the JS call stack.
    //   2. The server response (and any offer it triggers) arrives AFTER the
    //      listener is live. No delay, no poll, no setTimeout — just correct ordering.
    if (joinedSession?.id) {
      console.log(`[DIAG] student: emitting student:request_session_state from LiveSession (listeners live) — session_id=${joinedSession.id} ts=${Date.now()}`);
      socket.emit('student:request_session_state', { session_id: joinedSession.id });
    }

    return () => {
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('webrtc:broadcast_ended', handleBroadcastEnded);
      socket.off('teacher:mode_changed', handleTeacherModeChanged);
      socket.off('teacher:code_changed', handleTeacherCodeChanged);
      socket.off('teacher:code_output', handleTeacherCodeOutput);
      socket.off('teacher:whiteboard_stroke', handleTeacherWhiteboardStroke);
      socket.off('teacher:whiteboard_clear', handleTeacherWhiteboardClear);
      socket.off('teacher:whiteboard_snapshot', handleTeacherWhiteboardSnapshot);
      socket.off('teacher:whiteboard_sync', handleTeacherWhiteboardSnapshot);
      socket.off('student:session_state', handleSessionState);
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
              <Loader2 className="w-11 h-11 text-accent-info animate-spin" strokeWidth={1.75} />
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
            <span className="w-1.5 h-1.5 rounded-full bg-accent-info pulse-dot inline-block" />
            {rejoinCount >= 2
              ? <>Waiting for instructor approval (attempt <span className="tnum">#{rejoinCount}</span>)</>
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
            <AlertTriangle className="w-11 h-11 text-accent-critical" strokeWidth={1.75} />
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
            className="px-6 py-2.5 bg-bg-surface border border-border hover:border-accent-info/40 text-text-primary text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
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
            <Maximize2 className="w-11 h-11 text-accent-info" strokeWidth={1.75} />
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
            className="flex items-center gap-2 px-6 py-2.5 bg-accent-700 hover:bg-accent-700/90 text-white text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <Maximize2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
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
        <div className="absolute inset-0 z-[95] flex flex-col items-center justify-center gap-6 bg-bg-base/95 backdrop-blur">
          <div className="w-20 h-20 rounded-full bg-accent-warning/10 border border-accent-warning/30 flex items-center justify-center">
            <AlertTriangle className="w-11 h-11 text-accent-warning" strokeWidth={1.75} />
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
            className="flex items-center gap-2 px-6 py-2.5 bg-accent-warning hover:bg-accent-warning/90 text-white text-sm font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <Maximize2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
            Return to Session
          </button>
        </div>
      )}

      {/* ── MAIN SESSION CONTENT ───────────────────────────────────────────────
          Only shown when not in an override overlay state. */}
      <div className="flex-1 bg-bg-base flex flex-col w-full h-full overflow-hidden">
        {isLive ? (
          <div className="w-full h-full bg-bg-base overflow-hidden flex flex-col">
            <div className="px-4 py-2 bg-bg-surface border-b border-border flex items-center justify-between flex-shrink-0 h-10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-primary">
                  {joinedSession.lecture_name ?? joinedSession.lectureName}
                </span>
                <span className="text-xs text-text-muted">
                  • {joinedSession.lab_room ?? joinedSession.labRoom} — Live Session
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] text-text-muted max-w-[280px] truncate"
                  title={
                    allowList.length > 0
                      ? `Allowed apps for this session: ${allowList.map((a) => a.display_name || a.process_name).join(", ")}`
                      : "No additional apps allowed for this session"
                  }
                >
                  {allowList.length > 0
                    ? `Allowed apps: ${allowList.map((a) => a.display_name || a.process_name).join(", ")}`
                    : "No additional apps allowed"}
                </span>
                <StatusBadge status="live" />
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">

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
                      <Monitor className="w-[72px] h-[72px] text-text-muted mb-4 animate-pulse" strokeWidth={1.75} />
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
                      <Loader2 className="w-[72px] h-[72px] text-accent-info mb-4 animate-spin" strokeWidth={1.75} />
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
                      <MonitorStop className="w-[72px] h-[72px] text-text-muted mb-4" strokeWidth={1.75} />
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
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-bg-surface/90 backdrop-blur border border-border rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent-info/40 transition-all shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                    >
                      <Mic className="w-[18px] h-[18px] text-accent-info" strokeWidth={1.75} />
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
                        className="text-xs font-semibold text-accent-info hover:underline flex-shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                      >
                        Load latest
                      </button>
                      <span className="text-text-muted text-xs flex-shrink-0">·</span>
                      <button
                        onClick={handleKeepMine}
                        className="text-xs text-text-muted hover:text-text-secondary flex-shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
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
                    <Select
                      value={editingEnabled ? studentLanguage : mirroredLanguage}
                      onValueChange={editingEnabled ? handleStudentLanguageChange : undefined}
                      disabled={!editingEnabled}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

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
                        className="h-7 px-2 text-xs text-text-muted hover:text-text-secondary border border-border rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
                      >
                        Clear output
                      </button>
                    )}

                    {/* Run button — only when editingEnabled (task mode) */}
                    {editingEnabled && studentLanguage !== "plaintext" && (
                      <button
                        onClick={handleStudentRunCode}
                        disabled={studentPyodideLoading}
                        className="h-7 px-3 text-xs font-medium bg-accent-700 hover:bg-accent-700/90 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
                      >
                        {studentPyodideLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                            Loading…
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" strokeWidth={1.75} />
                            Run
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Resizable / Dockable Flex Container */}
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: ["bottom", "top"].includes(editingEnabled ? studentOutputDockPosition : mirroredOutputDockPosition) ? "column" : "row",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {/* Code display area — Whiteboard Canvas and Monaco Editor both permanently mounted */}
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        minWidth: 0,
                        overflow: "hidden",
                        position: "relative",
                        order: ["left", "top"].includes(editingEnabled ? studentOutputDockPosition : mirroredOutputDockPosition) ? 1 : 0,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: "100%",
                          display: (editingEnabled ? studentLanguage : mirroredLanguage) === "whiteboard" ? "block" : "none",
                        }}
                      >
                        <WhiteboardCanvas
                          ref={studentWhiteboardRef}
                          readOnly={true}
                          isActive={(editingEnabled ? studentLanguage : mirroredLanguage) === "whiteboard"}
                          initialStrokes={[...studentWhiteboardStrokesRef.current]}
                          initialBgColor={studentWhiteboardBgColorRef.current}
                        />
                      </div>
                      <div
                        style={{
                          height: "100%",
                          width: "100%",
                          display: (editingEnabled ? studentLanguage : mirroredLanguage) !== "whiteboard" ? "block" : "none",
                        }}
                      >
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
                    </div>

                    {/* Output panel — local workspace output (if editingEnabled) */}
                    {editingEnabled && (
                      <CodeOutputPanel
                        outputMode={studentOutputMode}
                        iframeSrcdoc={studentIframeSrcdoc}
                        iframeKey={studentIframeKey}
                        consoleLines={studentConsoleLines}
                        textOutput={studentTextOutput}
                        dockPosition={studentOutputDockPosition}
                        onDockChange={setStudentOutputDockPosition}
                        size={studentOutputPanelSize}
                        onSizeChange={setStudentOutputPanelSize}
                        resizable={true}
                        showIframe={studentOutputMode !== "console" || studentJsHasVisibleOutput}
                      />
                    )}

                    {/* Output panel — mirrored output from teacher (if !editingEnabled) */}
                    {!editingEnabled && (
                      <CodeOutputPanel
                        outputMode={mirroredOutput.outputMode}
                        iframeSrcdoc={mirroredOutput.iframeSrcdoc}
                        iframeKey={mirroredOutput.iframeSrcdoc}
                        consoleLines={mirroredOutput.consoleLines}
                        textOutput={mirroredOutput.textOutput}
                        dockPosition={mirroredOutputDockPosition}
                        onDockChange={setMirroredOutputDockPosition}
                        size={mirroredOutputPanelSize}
                        onSizeChange={setMirroredOutputPanelSize}
                        resizable={true}
                        showIframe={mirroredOutput.outputMode !== "console" || mirroredOutput.showIframe !== false}
                      />
                    )}
                  </div>
              </div>
            </div>
          </div>
        ) : (
          /* No active session */
          <div className="h-full text-center flex flex-col items-center justify-center gap-3">
            <Monitor className="w-14 h-14 text-text-muted" strokeWidth={1.75} />
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
