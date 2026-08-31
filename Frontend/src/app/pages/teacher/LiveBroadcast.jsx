import { API_BASE_URL } from "../../config/api.js";
import { useState, useRef, useEffect } from "react";
import { useOutletContext, useLocation, useNavigate } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import Editor from "@monaco-editor/react";
import { WhiteboardCanvas } from "../../components/WhiteboardCanvas";
import { CodeOutputPanel } from "../../components/CodeOutputPanel";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import { Skeleton } from "../../components/ui/skeleton";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import { IconPlayerPause as Pause, IconPlayerPlay as Play, IconDeviceDesktop as Monitor, IconDeviceDesktopOff as MonitorStop, IconScreenShare as ScreenShareOn, IconScreenShareOff as ScreenShareOff, IconLivePhoto as LivePhoto, IconLivePhotoOff as LivePhotoOff, IconEye as Eye, IconEyeOff as EyeOff, IconUsers as Users, IconChalkboard as Chalkboard, IconCopy as Copy, IconCheck as Check, IconMicrophone as Mic, IconMicrophoneOff as MicOff, IconCode as Code2, IconX as X, IconLoader2 as Loader2, IconAlertTriangle as TriangleAlert, IconDownload as Download, IconCalendarStats as CalendarStats, IconMaximize as Maximize, IconMinimize as Minimize, IconInfoCircle as Info, IconBooks as Books, IconBook2 as Book2, IconLock as Lock, IconMapPin as MapPin, IconBrandJavascript as BrandJavascript, IconBrandPython as BrandPython, IconBrandHtml5 as BrandHtml5, IconTypography as Typography, IconSketching as Sketching } from "@tabler/icons-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../components/ui/tooltip";
import { getSocket } from "../../store/socket";
import { addRecording } from "../../utils/recordingsStore";
import { saveHandle } from "../../utils/recordingHandles";
import { toast } from "sonner";

// ─── ICE / STUN Configuration ─────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ─── Schedule-pill motion ─────────────────────────────────────────────────────
// ONE spring, shared by every animated property of the idle Start / schedule
// pill (the calendar side's width + opacity, and the container's own resize on
// a loading-text swap). Nothing in that control is allowed to run on a
// different curve. Mirrors the value the old layoutId morph used.
const PILL_TRANSITION = { type: "spring", bounce: 0, duration: 0.45 };

// ─── Language definitions ──────────────────────────────────────────────────────
const LANGUAGES = [
  { id: "javascript", label: "JavaScript", icon: BrandJavascript },
  { id: "python", label: "Python", icon: BrandPython },
  { id: "html", label: "HTML", icon: BrandHtml5 },
  { id: "plaintext", label: "Plain Text", icon: Typography },
  { id: "whiteboard", label: "Whiteboard", icon: Sketching },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

// Trim a "HH:MM:SS" (or already-"HH:MM") clock string down to "HH:MM" —
// timetable rows come back with seconds the teacher never needs to read.
const toHHMM = (t) => (typeof t === "string" ? t.slice(0, 5) : t);

// LiveDot — the "this session is live" indicator that sits in front of the
// timer. Deliberately subtle: a slow dim→glow→dim cycle (opacity + a soft
// box-shadow bloom), never a hard blink, since it sits directly next to text
// the teacher needs to read quickly mid-lecture. Falls back to a static dot
// under prefers-reduced-motion, matching the rest of the app's live-status
// vocabulary (pulse-dot / live-pulse in theme.css).
function LiveDot() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <span className="w-2 h-2 rounded-full bg-accent-live shrink-0" title="Live" aria-hidden="true" />;
  }

  return (
    <motion.span
      className="w-2 h-2 rounded-full bg-accent-live shrink-0"
      title="Live"
      aria-hidden="true"
      animate={{
        opacity: [0.55, 1, 0.55],
        boxShadow: [
          "0 0 0 0 rgba(21,128,61,0)",
          "0 0 6px 1px rgba(21,128,61,0.55)",
          "0 0 0 0 rgba(21,128,61,0)",
        ],
      }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

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
      const hasVisibleOutput = document.body.children.length > 1 || (document.body.innerText || '').trim().length > 0;
      window.parent.postMessage({type:'__edusync_js_done__', logs, hasVisibleOutput}, '*');
    }, 50);
  });
})();
<\/script>
</head>
<body style="margin:0;background:#17171A;color:#F2F2F4;font-family:system-ui;padding:12px">
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
let teacherDebugSeq = 0;

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

  const prefersReducedMotion = useReducedMotion();

  const whiteboardRef = useRef(null);
  const teacherWhiteboardStrokesRef = useRef([]);
  const teacherWhiteboardBgColorRef = useRef("#17171A");

  // ── Modal / form state ──────────────────────────────────────────────────────
  const [showSetupModal, setShowSetupModal] = useState(false);
  // setupModalMode: which flow opened the Session Setup Modal — "instant"
  // (handleOpenSetupModal, blank form) or "scheduled" (prefilled from a
  // timetable entry, or the dashboard's "Start Now" auto-open). Drives the
  // modal's title/icon and the Start Lecture button's icon.
  const [setupModalMode, setSetupModalMode] = useState("instant");
  // Idle Schedule/Instant pill pair (see the Control Bar below). Both pills are
  // always mounted. Exactly one is the "active" (violet, labelled) pill; the
  // other rests as a dim icon-only circle. Which one is active:
  //   active = hovered side  ??  (a lecture is scheduled now ? "schedule" : "instant")
  // …with the click flows (pillTarget / *Loading) pinning it while they run.
  // Nothing moves between the two anchors — the fill + label just cross over as
  // one side expands and the other collapses, all on the ONE PILL_TRANSITION
  // spring.
  //
  // pillTarget: "schedule" while the schedule click flow has parked the bar on
  // the calendar side (settle-then-spin beat, then while the setup modal is
  // open); "start" otherwise.
  const [pillTarget, setPillTarget] = useState("start");
  // scheduleHover / startHover: pointer is over that side's button. They drive
  // `activeSide` (hover wins over the scheduled/idle default) and, when it's the
  // side's own active violet pill, the self-hover label retract.
  const [scheduleHover, setScheduleHover] = useState(false);
  const [startHover, setStartHover] = useState(false);
  // hoveredControlButton: which of the live control-bar buttons (Mic/Screen
  // Share/Record/End) is currently hovered, if any — collapses that one
  // button's label so the icon centers, same width-shrink mechanism as the
  // Schedule/Instant pills above, just triggered by hover instead of state.
  const [hoveredControlButton, setHoveredControlButton] = useState(null);
  // schedTipOpen: controls the recoloured shadcn tooltip on the Schedule pill —
  // the rich "what's on now" card when a lecture is scheduled, or the plain
  // "No lecture scheduled" line when idle. Kept fully controlled (rather than
  // letting Radix flip between controlled/uncontrolled as `scheduledNow`
  // changes): hover still opens it via onOpenChange, and an idle click also
  // pops it with a short auto-dismiss.
  const [schedTipOpen, setSchedTipOpen] = useState(false);
  const [scheduleIconLoading, setScheduleIconLoading] = useState(false);
  // startButtonLoading: a separate, in-place loading beat for a *direct*
  // click on Start Lecture itself (no pill migration — it stays put, its
  // own Play icon/label just swap to a spinner + "Starting…" for a moment).
  const [startButtonLoading, setStartButtonLoading] = useState(false);
  const morphTimersRef = useRef([]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSessionInfoDialog, setShowSessionInfoDialog] = useState(false);
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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenContainerRef = useRef(null);

  const handleToggleFullScreen = () => {
    if (!isFullScreen) {
      setIsFullScreen(true);
      if (fullScreenContainerRef.current?.requestFullscreen) {
        fullScreenContainerRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      setIsFullScreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    const handleFullScreenChange = () => {
      if (!document.fullscreenElement && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, [isFullScreen]);

  // ── Timetable & Schedule Auto-Detection ──────────────────────────────────────
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [loadingTimetable, setLoadingTimetable] = useState(true);

  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/timetable/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTimetableEntries(data.entries || []);
        }
      } catch (err) {
        console.error("Failed to fetch timetable:", err);
      } finally {
        setLoadingTimetable(false);
      }
    };
    fetchTimetable();
  }, []);

  const jsDay = new Date().getDay();
  const currentDayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLecture = timetableEntries.find((e) => {
    if (Number(e.day_of_week) !== currentDayOfWeek) return false;
    const startMin = parseTimeToMinutes(e.start_time);
    const endMin = parseTimeToMinutes(e.end_time);
    return currentMinutes >= startMin - 15 && currentMinutes <= endMin;
  });

  const handlePrefillScheduledLecture = (entry) => {
    if (!entry) return;
    const subName = entry.subject || entry.subject_name || "";
    const roomName = entry.room || entry.room_number || "LAB 301";
    setFormData({
      lectureName: subName ? `${subName} Lecture` : "",
      subject: subName,
      password: "",
      labRoom: roomName,
    });
    setSelectedClassIds(entry.class_id ? [Number(entry.class_id)] : []);
    setShowPassword(false);
    setModalError("");
    setSetupModalMode("scheduled");
    setShowSetupModal(true);
  };

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/classes`, {
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
  const [recordingDownloadUrl, setRecordingDownloadUrl] = useState(null);
  const [recordingError, setRecordingError] = useState("");

  // ── Audio state ─────────────────────────────────────────────────────────────
  const [micMuted, setMicMuted] = useState(true); // muted by default — teacher opts in
  const [micWarning, setMicWarning] = useState(""); // non-empty = mic unavailable

  // ── Code editor state ───────────────────────────────────────────────────────
  const [editorCode, setEditorCode] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("javascript");
  // langMenuOpen: the language <Select> is controlled so it can open on hover
  // (not just click) and close again when the pointer leaves it.
  //
  // We do NOT drive the close off the trigger's mouseleave: Radix Select sets
  // `body { pointer-events: none }` while open, which makes the browser fire a
  // spurious mouseleave on the trigger the instant it opens — that fought the
  // reopen-on-mouseenter and produced a rapid open/close flicker. Instead, while
  // the menu is open we watch pointer *coordinates* on the window and hit-test
  // them against the trigger and list rects (with a few px of slop so the gap
  // between them counts as "inside"). Leave both for >120ms → close. Radix still
  // owns the other close paths — pick an item, Esc, click outside.
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuCloseTimerRef = useRef(null);

  const cancelLangMenuClose = () => {
    if (langMenuCloseTimerRef.current) {
      clearTimeout(langMenuCloseTimerRef.current);
      langMenuCloseTimerRef.current = null;
    }
  };
  const openLangMenu = () => {
    cancelLangMenuClose();
    setLangMenuOpen(true);
  };
  const scheduleLangMenuClose = () => {
    if (langMenuCloseTimerRef.current) return;
    langMenuCloseTimerRef.current = setTimeout(() => {
      langMenuCloseTimerRef.current = null;
      setLangMenuOpen(false);
    }, 120);
  };
  useEffect(() => cancelLangMenuClose, []);

  useEffect(() => {
    if (!langMenuOpen) return;
    const HIT_SLOP = 10;
    const within = (el, x, y) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return (
        x >= r.left - HIT_SLOP &&
        x <= r.right + HIT_SLOP &&
        y >= r.top - HIT_SLOP &&
        y <= r.bottom + HIT_SLOP
      );
    };
    const handlePointerMove = (e) => {
      const trigger = document.querySelector('[data-tour="broadcast-languages"]');
      const content = document.querySelector('[data-slot="select-content"]');
      if (within(trigger, e.clientX, e.clientY) || within(content, e.clientX, e.clientY)) {
        cancelLangMenuClose();
      } else {
        scheduleLangMenuClose();
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelLangMenuClose();
    };
  }, [langMenuOpen]);
  // outputMode controls what the output panel shows:
  //   'none'    — panel hidden
  //   'iframe'  — rendered iframe only (HTML / CSS)
  //   'console' — iframe (top) + console text (bottom) for JavaScript
  //   'text'    — plain pre text for Python stdout
  const [outputMode, setOutputMode] = useState("none");
  const [outputDockPosition, setOutputDockPosition] = useState("bottom"); // 'bottom' | 'right' | 'left'
  const [outputPanelSize, setOutputPanelSize] = useState(220);
  const [jsHasVisibleOutput, setJsHasVisibleOutput] = useState(false);
  const [iframeSrcdoc, setIframeSrcdoc] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [consoleLines, setConsoleLines] = useState([]);
  const [textOutput, setTextOutput] = useState("");
  const [pyodideLoading, setPyodideLoading] = useState(false);

  // ── WebRTC refs ─────────────────────────────────────────────────────────────
  const screenStreamRef = useRef(null);   // MediaStream from getDisplayMedia
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingOwnStreamRef = useRef(null);
  const recordingUsesBroadcastStreamRef = useRef(false);
  const fileWritableRef = useRef(null);
  const recordingFsaHandleRef = useRef(null);    // the FileSystemFileHandle itself (browser path) — persisted to IndexedDB on stop so Session Recordings can re-open it later
  const recordingElectronTokenRef = useRef(null); // open native write-stream token (Electron path)
  const recordingElectronPathRef = useRef(null);  // real filesystem path (Electron path only)
  const recordingFilenameRef = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const recordingBytesWrittenRef = useRef(0);
  const screenTrackRef = useRef(null);    // MediaStreamTrack for screen sharing
  const micStreamRef = useRef(null);      // MediaStream from getUserMedia (mic)
  const peerConnectionsRef = useRef(new Map()); // Map<socketId, RTCPeerConnection>
  const previewVideoRef = useRef(null);   // <video> element for teacher preview
  const sessionInfoRef = useRef(null);    // mirrors sessionInfo state (stable in closures)
  const stopNowRef = useRef(null);        // always points to latest handleStopBroadcastNow
  const pyodideRef = useRef(null);        // holds the loaded Pyodide instance

  // DISCONNECTED_GRACE_MS: Grace period for a PC in 'disconnected' state before evicting
  // and proactively creating a fresh PC + sending a new offer.
  const DISCONNECTED_GRACE_MS = 4000;
  const disconnectGraceTimersRef = useRef(new Map()); // Map<studentSocketId, timeoutId>

  // leftTimersRef: Map<student_id, timeoutId> for the 5s "LEFT" removal timers.
  // When a student disconnects, we set their tile to LEFT status and start a 5s
  // timer to remove them. If they rejoin before it fires, the timer is cancelled.
  const leftTimersRef = useRef(new Map());
  // Mirrors connectedStudents state so that once-registered socket handlers
  // (like handleResendOfferToStudent inside registerListeners) always have a
  // fresh snapshot of the student list without becoming stale closures.
  const connectedStudentsRef = useRef([]);

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
  connectedStudentsRef.current = connectedStudents;

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
        const { logs, hasVisibleOutput } = event.data;
        const visible = Boolean(hasVisibleOutput);
        setJsHasVisibleOutput(visible);
        const lines = logs.map((l) => {
          const prefix =
            l.method === "error" ? "❌" : l.method === "warn" ? "⚠️" : l.method === "info" ? "ℹ️" : "›";
          return `${prefix} ${l.msg}`;
        });
        setConsoleLines(lines);
        emitCodeOutput("console", "", buildJsSrcdoc(editorCodeRef.current), lines, visible);
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
      // Also evict 'new'-state PCs: a PC found in the map that is still 'new'
      // means it was created when no screen stream was active, never had tracks
      // added, and onnegotiationneeded never fired — it will never establish video.
      // NOTE: this check only applies to a PRE-EXISTING entry from the map (above).
      // A brand-new PC created in the `if (!pc)` branch below starts in 'new' and
      // must not be evicted — this block runs before that branch, so it is safe.
      // makingOffer is a property on the PC object itself — destroyed when the
      // object is GC'd. No separate per-student Maps need clearing here.
      if (pc && (
        pc.connectionState === 'closed' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'new'
      )) {
        if (pc.connectionState === 'new') {
          console.log(`[WEBRTC-DEBUG] teacher: evicting idle 'new'-state PC for ${studentSocketId} (never negotiated) ts=${Date.now()}`);
        } else {
          console.log(`[WEBRTC-DEBUG] teacher: stale PC (state=${pc.connectionState}) for ${studentSocketId} in createPeerConnectionForStudent, evicting ts=${Date.now()}`);
        }
        pc.close(); // no-op if already closed
        peerConnectionsRef.current.delete(studentSocketId);
        pc = null;
      }

      if (!pc) {
        const alreadyExists = peerConnectionsRef.current.has(studentSocketId);
        const existingPcState = alreadyExists ? peerConnectionsRef.current.get(studentSocketId)?.connectionState : null;
        console.log(`[DEBUG] teacher stale-entry check before set: targetStudentId=${studentSocketId} | alreadyExists=${alreadyExists} | existingPcState=${existingPcState} | Map size=${peerConnectionsRef.current.size} | Map keys=[${Array.from(peerConnectionsRef.current.keys()).join(', ')}] | ts=${Date.now()}`);

        pc = new RTCPeerConnection(ICE_CONFIG);
        peerConnectionsRef.current.set(studentSocketId, pc);
        console.log(`[WEBRTC-DEBUG] teacher: new RTCPeerConnection for ${studentSocketId}, Map size=${peerConnectionsRef.current.size} ts=${Date.now()}`);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const iceSeq = ++teacherDebugSeq;
            console.log(`[DEBUG] teacher send webrtc:ice-candidate: seq=#${iceSeq} | target=${studentSocketId} | candidateType=${event.candidate.type} | candidate=${event.candidate.candidate} | ts=${Date.now()}`);
            socket.emit("webrtc:ice-candidate", {
              target_socket_id: studentSocketId,
              candidate: event.candidate,
              session_id: sessionInfoRef.current?.id,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          console.log(`[WEBRTC-DEBUG] teacher: PC state → ${state} for ${studentSocketId} ts=${Date.now()}`);
          
          if (state === "connected") {
            if (disconnectGraceTimersRef.current.has(studentSocketId)) {
              clearTimeout(disconnectGraceTimersRef.current.get(studentSocketId));
              disconnectGraceTimersRef.current.delete(studentSocketId);
              console.log(`[DEBUG] teacher grace timer CLEARED due to recovery for student_socket_id=${studentSocketId} ts=${Date.now()}`);
            }
          } else if (state === "disconnected") {
            if (!disconnectGraceTimersRef.current.has(studentSocketId)) {
              console.log(`[DEBUG] teacher grace timer STARTED (DISCONNECTED_GRACE_MS=${DISCONNECTED_GRACE_MS}ms) for student_socket_id=${studentSocketId} ts=${Date.now()}`);
              const timerId = setTimeout(async () => {
                disconnectGraceTimersRef.current.delete(studentSocketId);
                const currentPc = peerConnectionsRef.current.get(studentSocketId);
                if (currentPc && (currentPc.connectionState === 'disconnected' || currentPc.connectionState === 'failed')) {
                  console.log(`[DEBUG] teacher grace timer FIRED for student_socket_id=${studentSocketId} — evicting stale PC (state=${currentPc.connectionState}) and triggering proactive re-offer ts=${Date.now()}`);
                  currentPc.close();
                  peerConnectionsRef.current.delete(studentSocketId);

                  if (screenStreamRef.current) {
                    const student = connectedStudentsRef.current.find(s => s.socket_id === studentSocketId);
                    if (student) {
                      try {
                        console.log(`[DEBUG] teacher proactively calling createPeerConnectionForStudent for ${studentSocketId} ts=${Date.now()}`);
                        await createPeerConnectionForStudent(student.socket_id, student.student_id, student.student_name);
                        console.log(`[DEBUG] teacher proactive fresh PC created & offer sent for ${studentSocketId} ts=${Date.now()}`);
                      } catch (err) {
                        console.error(`[WebRTC] Proactive re-offer failed for ${studentSocketId}:`, err);
                      }
                    }
                  }
                }
              }, DISCONNECTED_GRACE_MS);
              disconnectGraceTimersRef.current.set(studentSocketId, timerId);
            }
          } else if (state === "failed") {
            if (disconnectGraceTimersRef.current.has(studentSocketId)) {
              clearTimeout(disconnectGraceTimersRef.current.get(studentSocketId));
              disconnectGraceTimersRef.current.delete(studentSocketId);
            }
            const rosterBefore = connectedStudentsRef.current.length;
            pc.close();
            peerConnectionsRef.current.delete(studentSocketId);
            const rosterAfter = connectedStudentsRef.current.length;
            console.log(
              `[WEBRTC-DEBUG] teacher: PC 'failed' for ${studentSocketId} — PC closed & removed from Map.` +
              ` Roster intentionally UNCHANGED: rosterBefore=${rosterBefore} rosterAfter=${rosterAfter} ts=${Date.now()}`
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
            const offerSeq = ++teacherDebugSeq;
            console.log(`[DEBUG] teacher offer created: seq=#${offerSeq} | targetStudentId=${studentSocketId} | Map size=${peerConnectionsRef.current.size} | Map keys=[${Array.from(peerConnectionsRef.current.keys()).join(', ')}] | ts=${Date.now()}`);
            console.log(`[DEBUG] teacher send webrtc:offer: seq=#${offerSeq} | target=${studentSocketId} | sdpType=${pc.localDescription.type} | ts=${Date.now()}`);
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
      const res = await fetch(`${API_BASE_URL}/sessions/end`, {
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

    // Clear the cached password now that the session is over.
    if (sessionInfoRef.current) {
      try {
        sessionStorage.removeItem(`edusync_session_password_${sessionInfoRef.current.id}`);
      } catch {}
    }

    // REST call succeeded — now emit socket events and tear down local state.
    if (socket && sessionInfoRef.current) {
      // Only emit broadcast_ended if there was an active screen share
      if (screenStreamRef.current) {
        console.log(`[DEBUG] teacher broadcast_ended emit (handleStopBroadcastNow): student IDs in Map=[${Array.from(peerConnectionsRef.current.keys()).join(', ')}], Map size before=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
        socket.emit("webrtc:broadcast_ended", { session_id: sessionInfoRef.current.id });
      }
      socket.emit("teacher:end_session", { session_id: sessionInfoRef.current.id });
    }

    // Close all peer connections
    const clearedKeys = Array.from(peerConnectionsRef.current.keys());
    console.log(`[DEBUG] teacher clearing peerConnectionsRef (handleStopBroadcastNow): student IDs cleared=[${clearedKeys.join(', ')}], Map size before=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    console.log(`[DEBUG] teacher peerConnectionsRef cleared (handleStopBroadcastNow): Map size after=${peerConnectionsRef.current.size}, ts=${Date.now()}`);

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      console.log(`[DEBUG][RECORDING] full broadcast stop — finalizing active recording`);
      mediaRecorderRef.current.stop();
    }
    recordingUsesBroadcastStreamRef.current = false;

    setBroadcastState("idle");
    setRecordingState("off");
    setStartButtonLoading(false); // clear any stale "Starting…" so the idle pill returns clean
    setScheduleIconLoading(false); // ditto for the calendar side's "Starting…"
    setPillTarget("start"); // exit any parked schedule-click flow
    setScheduleHover(false); // drop any stale calendar-hover state
    setStartHover(false); // drop any stale New-Lecture-hover state
    setSessionSeconds(0);
    setRecordingSeconds(0);
    setSessionInfo(null);
    sessionInfoRef.current = null;
    setConnectedStudents([]);
    setMicMuted(true); // muted by default for the next lecture
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
    // Cancel any pending disconnect grace timers
    disconnectGraceTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    disconnectGraceTimersRef.current.clear();
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
        console.log(`[STUDENT-COUNT-DEBUG] student:joined received — payload session_id=${session_id} (type ${typeof session_id}), sessionInfoRef.current.id=${sessionInfoRef.current?.id} (type ${typeof sessionInfoRef.current?.id}), match=${sessionInfoRef.current?.id === session_id}`);
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
          const next = [
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
          console.log(`[STUDENT-COUNT-DEBUG] connectedStudents: prev=${prev.length} next=${next.length}`);
          return next;
        });

        // Attempt WebRTC peer connection (no-op if no screen stream)
        try {
          await createPeerConnectionForStudent(socket_id, student_id, student_name);
        } catch (err) {
          console.error("[WebRTC] student:joined handler error:", err);
        }
      };

      const handleWebRTCAnswer = async ({ sdp, student_socket_id }) => {
        const ansSeq = ++teacherDebugSeq;
        console.log(`[DEBUG] teacher recv webrtc:answer: seq=#${ansSeq} | from=${student_socket_id} | ts=${Date.now()}`);
        try {
          const pc = peerConnectionsRef.current.get(student_socket_id);
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error("[WebRTC] setRemoteDescription failed:", err);
        }
      };

      const handleWebRTCIceCandidate = async ({ candidate, from_socket_id }) => {
        const iceSeq = ++teacherDebugSeq;
        console.log(`[DEBUG] teacher recv webrtc:ice-candidate: seq=#${iceSeq} | from=${from_socket_id} | candidateType=${candidate?.type} | ts=${Date.now()}`);
        try {
          const pc = peerConnectionsRef.current.get(from_socket_id);
          if (!pc || !candidate) return;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("[WebRTC] addIceCandidate from student failed:", err);
        }
      };

      const handleStudentLeft = ({ socket_id, student_id }) => {
        console.log(`[DEBUG] [teacher handleStudentLeft] RECEIVED student:left — socket_id=${socket_id} student_id=${student_id} ts=${Date.now()}`);
        if (disconnectGraceTimersRef.current.has(socket_id)) {
          clearTimeout(disconnectGraceTimersRef.current.get(socket_id));
          disconnectGraceTimersRef.current.delete(socket_id);
        }
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
        console.log(`[DEBUG] [teacher handleRejoinRequest] FIRED teacher:rejoin_request — session_id=${session_id} student_id=${student_id} student_name=${student_name} rejoin_count=${rejoin_count} ts=${Date.now()}`);
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

      // handler for teacher:app_violation — Electron's app-guard on a
      // student's machine force-closed a process not on this class's
      // allow-list. Live-only notification, not persisted (see
      // app_allowlist_entries's comment in dbSetup.js for why).
      const handleAppViolation = ({ student_id, process_name }) => {
        const student = connectedStudentsRef.current.find((s) => s.student_id === student_id);
        const studentName = student?.student_name || `Student ${student_id}`;
        toast.warning(`${studentName} — ${process_name} was closed automatically`, {
          description: "This app wasn't on the allow-list for this class.",
        });
      };

      // handler for teacher:resend_offer_to_student
      // Fired by the server when a student returns from a task page and the session
      // is in screen-share mode. Calls the identical createPeerConnectionForStudent
      // path used by handleStudentJoined so the teacher re-creates the peer connection
      // and sends a fresh WebRTC offer without a full student:joined cycle.
      const handleResendOfferToStudent = async ({ session_id, student_socket_id }) => {
        if (sessionInfoRef.current?.id !== session_id) return;
        const student = connectedStudentsRef.current.find((s) => s.socket_id === student_socket_id);
        if (!student) {
          console.warn(`[WEBRTC-DEBUG] teacher: teacher:resend_offer_to_student — socket_id=${student_socket_id} not found in connectedStudents, skipping`);
          return;
        }
        console.log(`[WEBRTC-DEBUG] teacher: teacher:resend_offer_to_student for socket=${student_socket_id} id=${student.student_id} ts=${Date.now()}`);
        
        // Forcibly close and remove any existing stale/connected PC for this student's socket_id
        // from peerConnectionsRef.current so that createPeerConnectionForStudent is guaranteed
        // to take the "create fresh PC" branch, wire negotiation needed handlers, and create a fresh offer.
        const existingPc = peerConnectionsRef.current.get(student_socket_id);
        if (existingPc) {
          console.log(`[WEBRTC-DEBUG] teacher: forcibly evicting existing PC (state=${existingPc.connectionState}) for ${student_socket_id} before resend ts=${Date.now()}`);
          try {
            existingPc.close();
          } catch (e) {
            console.error('[WEBRTC-DEBUG] failed closing existing PC:', e);
          }
          peerConnectionsRef.current.delete(student_socket_id);
        }

        try {
          await createPeerConnectionForStudent(student.socket_id, student.student_id, student.student_name);
        } catch (err) {
          console.error('[WebRTC] resend offer failed:', err);
        }
      };

      const emitStartSessionPayload = (s, session) => {
        if (!s || !session?.id) return;
        s.emit("teacher:start_session", {
          session: {
            id: session.id,
            lecture_name: session.lecture_name,
            subject: session.subject,
            lab_room: session.lab_room,
            started_at: session.started_at,
            class_ids: session.class_ids,
          },
          language: editorLanguageRef.current || "javascript",
          code: editorCodeRef.current || "",
          whiteboardStrokes: [...teacherWhiteboardStrokesRef.current],
          whiteboardBgColor: teacherWhiteboardBgColorRef.current || "#17171A",
        });
      };

      const handleTeacherConnect = () => {
        if (sessionInfoRef.current) {
          console.log(`[DEBUG] [teacher LiveBroadcast] socket connect event fired — socket.id=${socket.id} session_id=${sessionInfoRef.current.id} ts=${Date.now()}`);
          emitStartSessionPayload(socket, sessionInfoRef.current);
          socket.emit("teacher:request_roster", { session_id: sessionInfoRef.current.id });
        }
      };

      console.log(`[STUDENT-COUNT-DEBUG] listeners registered on socket id=${socket.id}, connected=${socket.connected}`);
      socket.on("connect", handleTeacherConnect);
      socket.on("student:joined", handleStudentJoined);
      socket.on("webrtc:answer", handleWebRTCAnswer);
      socket.on("webrtc:ice-candidate", handleWebRTCIceCandidate);
      socket.on("student:left", handleStudentLeft);
      socket.on("teacher:student_status_update", handleStudentStatusUpdate);
      socket.on("teacher:rejoin_request", handleRejoinRequest);
      socket.on("teacher:resend_offer_to_student", handleResendOfferToStudent);
      socket.on("teacher:app_violation", handleAppViolation);

      return () => {
        socket.off("connect", handleTeacherConnect);
        socket.off("student:joined", handleStudentJoined);
        socket.off("webrtc:answer", handleWebRTCAnswer);
        socket.off("webrtc:ice-candidate", handleWebRTCIceCandidate);
        socket.off("student:left", handleStudentLeft);
        socket.off("teacher:student_status_update", handleStudentStatusUpdate);
        socket.off("teacher:rejoin_request", handleRejoinRequest);
        socket.off("teacher:resend_offer_to_student", handleResendOfferToStudent);
        socket.off("teacher:app_violation", handleAppViolation);
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
      disconnectGraceTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      disconnectGraceTimersRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Request roster snapshot when sessionInfo?.id is available/changes
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !sessionInfo?.id) return;

    const requestRoster = () => {
      console.log(`[WEBRTC-DEBUG] teacher: requesting roster resync for session=${sessionInfo.id} ts=${Date.now()}`);
      socket.emit('teacher:request_roster', { session_id: sessionInfo.id });
    };

    const handleRosterSnapshot = ({ session_id, students }) => {
      console.log(`[DEBUG] [teacher handleRosterSnapshot] RECEIVED teacher:roster_snapshot — session_id=${session_id} targetSessionId=${sessionInfo?.id} rawStudentsPayload=${JSON.stringify(students)} studentCount=${students?.length} ts=${Date.now()}`);
      if (session_id !== sessionInfo.id) return;
      console.log(`[WEBRTC-DEBUG] teacher: roster_snapshot received, ${students.length} student(s) ts=${Date.now()}`);
      
      const mappedStudents = students.map((s) => ({
        socket_id: s.socket_id,
        student_id: s.student_id,
        student_name: s.student_name,
        outOfFocus: false,
        focusLossCount: 0,
        status: 'live',
      }));
      setConnectedStudents(mappedStudents);
    };

    socket.on('teacher:roster_snapshot', handleRosterSnapshot);

    if (socket.connected) {
      requestRoster();
    } else {
      socket.on('connect', requestRoster);
    }

    return () => {
      socket.off('teacher:roster_snapshot', handleRosterSnapshot);
      socket.off('connect', requestRoster);
    };
  }, [sessionInfo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        console.log(
          `[DEBUG][RECORDING] LiveBroadcast unmounting with active recorder (state=${mediaRecorderRef.current.state}) — stopping to finalize in-progress recording`
        );
        mediaRecorderRef.current.stop();
      }

      clearTimeout(editorSyncTimerRef.current);

      const clearedKeys = Array.from(peerConnectionsRef.current.keys());
      console.log(`[DEBUG] teacher clearing peerConnectionsRef (unmount): student IDs cleared=[${clearedKeys.join(', ')}], Map size before=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      console.log(`[DEBUG] teacher peerConnectionsRef cleared (unmount): Map size after=${peerConnectionsRef.current.size}, ts=${Date.now()}`);

      // Tell students the broadcast ended so their PC is cleanly torn down,
      // rather than left to time out silently — this was previously missing,
      // causing stale student-side PCs after any navigation away from this page.
      const socket = getSocket();
      if (socket && sessionInfoRef.current && screenStreamRef.current) {
        console.log(`[DEBUG] teacher broadcast_ended emit (unmount): student IDs in Map=[${clearedKeys.join(', ')}], Map size=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
        console.log(`[WEBRTC-DEBUG] teacher: LiveBroadcast unmounting with active stream, emitting webrtc:broadcast_ended for session=${sessionInfoRef.current.id}`);
        socket.emit("webrtc:broadcast_ended", { session_id: sessionInfoRef.current.id });
      }

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

  const location = useLocation();
  const navigate = useNavigate();

  // Auto-open and pre-fill broadcast modal when navigated from Today's Schedule "Start Now" button
  useEffect(() => {
    if (location.state?.autoOpenModal) {
      setFormData({
        lectureName: location.state.prefillSubject ? `${location.state.prefillSubject} Lecture` : "",
        subject: location.state.prefillSubject || "",
        password: "",
        labRoom: "LAB 301",
      });
      if (location.state.prefillClassIds) {
        setSelectedClassIds(location.state.prefillClassIds);
      }
      setShowPassword(false);
      setModalError("");
      setSetupModalMode("scheduled");
      setShowSetupModal(true);
    }
  }, [location.state]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // acquireMicStream: idempotent — returns the existing mic stream if one was
  // already granted, otherwise prompts the OS/browser for microphone permission.
  // Called as soon as the lecture goes live (not gated behind screen sharing),
  // so the Mute/Unmute button works immediately rather than only after the
  // teacher starts a screen share. The track always starts DISABLED (muted) —
  // students never hear the teacher's mic until the teacher explicitly unmutes.
  const acquireMicStream = async () => {
    if (micStreamRef.current) return micStreamRef.current;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      micStreamRef.current = micStream;
      setMicMuted(true);
      setMicWarning("");
      return micStream;
    } catch (micErr) {
      setMicWarning(
        micErr.name === "NotAllowedError"
          ? "Microphone permission blocked — turn on the microphone permission for this site (browser/OS settings), then click the mic button again."
          : "Microphone unavailable — broadcasting video only."
      );
      return null;
    }
  };

  const handleOpenSetupModal = () => {
    setFormData({ lectureName: "", subject: "", password: "", labRoom: "LAB 301" });
    setSelectedClassIds([]);
    setShowPassword(false);
    setModalError("");
    setSetupModalMode("instant");
    setShowSetupModal(true);
  };

  // handleScheduleIconClick — parks the idle bar on the calendar side
  // (pillTarget="schedule" → the calendar button expands in place), lets it
  // settle, shows a brief spinner, then opens the setup modal pre-filled from
  // the lecture scheduled right now. With NO lecture scheduled there is nothing
  // to start: just flash the "No lecture scheduled" tooltip and bail.
  const handleScheduleIconClick = () => {
    if (!currentLecture) {
      setSchedTipOpen(true);
      const tHint = setTimeout(() => setSchedTipOpen(false), 2200);
      morphTimersRef.current.push(tHint);
      return;
    }
    if (pillTarget === "schedule") return; // sequence already in flight
    setPillTarget("schedule");
    // The expand spring settles at ~450ms; the spinner + "Starting…" fades in
    // right after. The modal open is held back until ~1.6s total so the beat
    // always reads for a full 1-2s, even though prefilling from currentLecture
    // (if any) is instant with no real loading to wait on.
    const t1 = setTimeout(() => setScheduleIconLoading(true), 450);
    const t2 = setTimeout(() => {
      // scheduleIconLoading is deliberately NOT cleared here — the calendar
      // pill holds its "Starting…" spinner for the whole time the setup modal
      // is open. It's reset only when the modal is dismissed without starting
      // (Dialog onOpenChange / the Cancel button) or when a live session
      // later ends (handleStopBroadcastNow).
      if (currentLecture) {
        handlePrefillScheduledLecture(currentLecture);
      } else {
        handleOpenSetupModal();
      }
    }, 1600);
    morphTimersRef.current.push(t1, t2);
  };

  // handleStartButtonClick — direct click on Start Lecture itself: no pill
  // migration, it stays exactly where it is and just swaps its own Play
  // icon/label for a spinner + "Starting…" for a short beat before the
  // setup modal opens.
  const handleStartButtonClick = () => {
    if (startButtonLoading || pillTarget === "schedule") return;
    setStartButtonLoading(true);
    const t = setTimeout(() => {
      // startButtonLoading is deliberately NOT cleared here — it stays true
      // (spinner + "Starting…") for the whole time the setup modal is open.
      // It's reset only when the modal is dismissed without starting
      // (Dialog onOpenChange / the Cancel button) or when a live session
      // later ends (handleStopBroadcastNow). A successful start swaps the
      // entire idle pill out for the live cluster via setBroadcastState("live").
      handleOpenSetupModal();
    }, 1200);
    morphTimersRef.current.push(t);
  };

  useEffect(() => {
    return () => {
      morphTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleStartBroadcast = async () => {
    if (!isFormValid) return;
    setModalError("");
    setStartLoading(true);

    try {
      // ── Create the session via API ──────────────────────────────────────────
      // NO screen capture here. Screen sharing is triggered separately via the
      // "Start Screen Share" button AFTER the session is live.
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
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
      // Cache the password client-side, keyed by session id, so a page refresh
      // (TeacherLayout's rehydration effect) can still show it in the eye-toggle
      // instead of the placeholder — the API never returns it since it's not
      // stored in plaintext server-side.
      try {
        sessionStorage.setItem(`edusync_session_password_${data.session.id}`, formData.password);
      } catch {}
      setShowSetupModal(false);
      setSessionSeconds(0);
      setBroadcastState("live");

      // Grab mic access as soon as the lecture is live, independent of screen
      // sharing — students already in the room get the audio track once they
      // connect, and the Mute/Unmute button becomes usable right away.
      acquireMicStream();

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
          language: editorLanguageRef.current || "javascript",
          code: editorCodeRef.current || "",
          whiteboardStrokes: [...teacherWhiteboardStrokesRef.current],
          whiteboardBgColor: teacherWhiteboardBgColorRef.current || "#17171A",
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


  const handleToggleRecording = async () => {
    if (recordingState === "off") {
      setRecordingError("");

      // Three save paths, in priority order:
      //  1. Electron desktop app — native save dialog, real filesystem path,
      //     so Session Recordings' "Show in Folder" can actually work.
      //  2. Browser with File System Access API (Chromium) — the existing
      //     showSaveFilePicker flow; the file handle is kept so Session
      //     Recordings can re-open it later, but browsers never expose a
      //     real path to JS, so there's no OS-explorer reveal here.
      //  3. Plain download fallback (Firefox/Safari, or FSA unsupported) —
      //     unchanged; nothing to persist a handle to afterward.
      const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;
      const supportsFileSystemAccess = typeof window.showSaveFilePicker === "function";
      const suggestedName = `session-recording-${Date.now()}.webm`;

      recordingFsaHandleRef.current = null;
      recordingElectronTokenRef.current = null;
      recordingElectronPathRef.current = null;
      recordingBytesWrittenRef.current = 0;
      recordingFilenameRef.current = suggestedName;

      if (isElectron) {
        try {
          const result = await window.electronAPI.startRecordingSave(suggestedName);
          if (result.canceled) return;
          recordingElectronTokenRef.current = result.token;
          recordingElectronPathRef.current = result.filePath;
          recordingFilenameRef.current = result.filePath.split(/[\\/]/).pop() || suggestedName;
          console.log(`[DEBUG][RECORDING-ELECTRON] native write stream opened, target=${result.filePath}`);
        } catch (err) {
          console.error(`[DEBUG][RECORDING-ELECTRON] save dialog failed:`, err);
          setRecordingError(err?.message || "Could not open the save dialog.");
          return;
        }
      } else if (supportsFileSystemAccess) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: "WebM Video", accept: { "video/webm": [".webm"] } }],
          });
          fileWritableRef.current = await fileHandle.createWritable();
          recordingFsaHandleRef.current = fileHandle;
          recordingFilenameRef.current = fileHandle.name;
          console.log(`[DEBUG][RECORDING-FSA] writable stream opened, target=${fileHandle.name}`);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error(`[DEBUG][RECORDING-FSA] picker failed:`, err);
            setRecordingError(err?.message || "Could not open save location picker.");
          }
          return;
        }
      }

      let stream = null;
      const reusedBroadcastStream = !!screenStreamRef.current;
      recordingUsesBroadcastStreamRef.current = reusedBroadcastStream;

      if (reusedBroadcastStream) {
        stream = screenStreamRef.current;
      } else {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          recordingOwnStreamRef.current = stream;
        } catch (err) {
          console.error(`[DEBUG][RECORDING] start failed:`, err);
          if (err.name !== "AbortError") {
            setRecordingError(err?.message || "Permission denied or failed to select screen.");
          }
          if (fileWritableRef.current) {
            try { await fileWritableRef.current.close(); } catch {}
            fileWritableRef.current = null;
          }
          if (recordingElectronTokenRef.current) {
            try { await window.electronAPI.closeRecordingFile(recordingElectronTokenRef.current); } catch {}
            recordingElectronTokenRef.current = null;
          }
          return;
        }
      }

      try {
        const mimeTypes = [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
        ];
        const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";

        recordedChunksRef.current = [];

        const options = mimeType ? { mimeType } : {};
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        recordingStartedAtRef.current = new Date().toISOString();
        const startTimestamp = Date.now();

        recorder.ondataavailable = async (event) => {
          if (!event.data || event.data.size === 0) return;
          if (recordingElectronTokenRef.current) {
            try {
              const buf = await event.data.arrayBuffer();
              const result = await window.electronAPI.writeRecordingChunk(recordingElectronTokenRef.current, buf);
              if (!result.ok) throw new Error(result.error || "write failed");
              recordingBytesWrittenRef.current += buf.byteLength;
              console.log(`[DEBUG][RECORDING-ELECTRON] chunk written to disk, size=${buf.byteLength}`);
            } catch (err) {
              console.error(`[DEBUG][RECORDING-ELECTRON] write failed:`, err);
              setRecordingError("Failed to write to the selected file — recording may be incomplete.");
            }
          } else if (fileWritableRef.current) {
            try {
              await fileWritableRef.current.write(event.data);
              recordingBytesWrittenRef.current += event.data.size;
              console.log(`[DEBUG][RECORDING-FSA] chunk written to disk, size=${event.data.size}`);
            } catch (err) {
              console.error(`[DEBUG][RECORDING-FSA] write failed:`, err);
              setRecordingError("Failed to write to the selected file — recording may be incomplete.");
            }
          } else {
            recordedChunksRef.current.push(event.data);
            console.log(
              `[DEBUG][RECORDING] chunk received, size=${event.data.size} totalChunks=${recordedChunksRef.current.length}`
            );
          }
        };

        recorder.onstop = async () => {
          const durationSeconds = Math.max(0, Math.round((Date.now() - startTimestamp) / 1000));
          const baseEntry = {
            id: `rec-${Date.now()}`,
            filename: recordingFilenameRef.current || suggestedName,
            startedAt: recordingStartedAtRef.current || new Date().toISOString(),
            durationSeconds,
            lectureName: sessionInfoRef.current?.lectureName || null,
            subject: sessionInfoRef.current?.subject || null,
          };

          if (recordingElectronTokenRef.current) {
            try {
              await window.electronAPI.closeRecordingFile(recordingElectronTokenRef.current);
              console.log(`[DEBUG][RECORDING-ELECTRON] file closed and saved successfully`);
              addRecording({
                ...baseEntry,
                sizeBytes: recordingBytesWrittenRef.current || null,
                kind: "electron",
                filePath: recordingElectronPathRef.current,
              });
            } catch (err) {
              console.error(`[DEBUG][RECORDING-ELECTRON] close failed:`, err);
              setRecordingError("Error finalizing the saved file.");
            }
            recordingElectronTokenRef.current = null;
            recordingElectronPathRef.current = null;
          } else if (fileWritableRef.current) {
            try {
              await fileWritableRef.current.close();
              console.log(`[DEBUG][RECORDING-FSA] file closed and saved successfully`);
              addRecording({
                ...baseEntry,
                sizeBytes: recordingBytesWrittenRef.current || null,
                kind: "fsa",
                filePath: null,
              });
              if (recordingFsaHandleRef.current) {
                try {
                  await saveHandle(baseEntry.id, recordingFsaHandleRef.current);
                } catch (err) {
                  console.error("[RECORDING-FSA] failed to persist file handle for later reopening:", err);
                }
              }
            } catch (err) {
              console.error(`[DEBUG][RECORDING-FSA] close failed:`, err);
              setRecordingError("Error finalizing the saved file.");
            }
            fileWritableRef.current = null;
            recordingFsaHandleRef.current = null;
          } else {
            const finalType = recorder.mimeType || mimeType || "video/webm";
            const blob = new Blob(recordedChunksRef.current, { type: finalType });
            const url = URL.createObjectURL(blob);
            setRecordingDownloadUrl(url);
            console.log(`[DEBUG][RECORDING] stopped, finalBlobSizeBytes=${blob.size}`);
            addRecording({
              ...baseEntry,
              sizeBytes: blob.size,
              kind: "download",
              filePath: null,
            });
          }

          if (recordingOwnStreamRef.current) {
            recordingOwnStreamRef.current.getTracks().forEach((track) => track.stop());
            recordingOwnStreamRef.current = null;
          }
          setRecordingState("off");
          setRecordingSeconds(0);
        };

        recorder.start(1000);
        console.log(
          `[DEBUG][RECORDING] started, mimeType=${mimeType}, reusedBroadcastStream=${reusedBroadcastStream}`
        );

        setRecordingSeconds(0);
        setRecordingState("recording");
      } catch (err) {
        console.error(`[DEBUG][RECORDING] start failed:`, err);
        setRecordingError(err?.message || "Failed to initialize MediaRecorder.");
        if (fileWritableRef.current) {
          try { await fileWritableRef.current.close(); } catch {}
          fileWritableRef.current = null;
        }
        if (recordingElectronTokenRef.current) {
          try { await window.electronAPI.closeRecordingFile(recordingElectronTokenRef.current); } catch {}
          recordingElectronTokenRef.current = null;
        }
        if (recordingOwnStreamRef.current) {
          recordingOwnStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingOwnStreamRef.current = null;
        }
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      recordingUsesBroadcastStreamRef.current = false;
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
    console.log(
      `[DEBUG-RACE] teacher handleStartScreenShare ENTER — Map size=${peerConnectionsRef.current.size} | PCs:`,
      Array.from(peerConnectionsRef.current.entries()).map(([sockId, pc]) => ({
        socket_id: sockId,
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
      })),
      `ts=${Date.now()}`
    );
    console.log(`[DEBUG] teacher start/restart toggle (handleStartScreenShare): student IDs in Map=[${Array.from(peerConnectionsRef.current.keys()).join(', ')}], Map size=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
    // DIAG-LOG-1: dump full roster at the very start, before any other logic
    console.log(
      `[DIAG] handleStartScreenShare ENTER — roster (connectedStudentsRef.current):`,
      JSON.stringify(
        (connectedStudentsRef.current || []).map(s => ({
          socket_id: s.socket_id,
          student_id: s.student_id,
          student_name: s.student_name,
        }))
      ),
      `ts=${Date.now()}`
    );
    setScreenShareError("");
    console.log(`[WEBRTC-DEBUG] teacher: handleStartScreenShare called, Map size=${peerConnectionsRef.current.size} ts=${Date.now()}`);

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError(
        "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox."
      );
      return;
    }

    // Request microphone audio (graceful — mic denied does not abort screen share)
    await acquireMicStream();

    const isTrackReusable = screenTrackRef.current && screenTrackRef.current.readyState !== 'ended';

    if (isTrackReusable) {
      // Cheap reuse path: same OS-level capture still alive, just re-enable the track
      // for students whose RTCRtpSenders already hold it.
      screenTrackRef.current.enabled = true;
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => {
          t.enabled = true;
        });
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "paused" &&
        recordingUsesBroadcastStreamRef.current
      ) {
        mediaRecorderRef.current.resume();
        console.log(`[DEBUG][RECORDING] resumed — screen share restarted (in-app), same stream reused`);
      }

      // Per-student health-check: students who joined DURING the pause (between
      // Stop and this Resume) have no PC, or a PC stuck in 'new' that never
      // negotiated. Re-enabling the track above does nothing for them.
      // Evict stale/new PCs and create fresh ones so they get a proper offer.
      // Healthy PCs ('connected'/'connecting') already hold the live sender
      // and must NOT get another createPeerConnectionForStudent call — that
      // would cause a redundant addTrack + renegotiation.
      for (const student of connectedStudentsRef.current) {
        try {
          let pc = peerConnectionsRef.current.get(student.socket_id);

          if (pc && (
            pc.connectionState === 'closed' ||
            pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected' ||
            pc.connectionState === 'new'
          )) {
            console.log(
              `[WEBRTC-DEBUG] teacher: reuse-path — evicting ${pc.connectionState === 'new' ? "idle 'new'-state" : `stale (${pc.connectionState})`} PC for ${student.socket_id}, creating fresh ts=${Date.now()}`
            );
            pc.close();
            peerConnectionsRef.current.delete(student.socket_id);
            pc = null;
          }

          if (!pc) {
            console.log(`[WEBRTC-DEBUG] teacher: reuse-path — student ${student.socket_id} had no usable PC, creating fresh ts=${Date.now()}`);
            await createPeerConnectionForStudent(student.socket_id, student.student_id, student.student_name);
          }
          // else: PC is healthy — re-enabling the track above was sufficient, skip.
        } catch (err) {
          console.error(`[WebRTC] reuse-path: failed to create PC for ${student.socket_id}:`, err);
        }
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
      // Unhealthy PCs (closed/failed/disconnected) and idle 'new'-state PCs are
      // evicted and recreated. A 'new' PC here means the student joined while no
      // screen share was active — it was never given tracks and never negotiated,
      // so addTrack alone will not produce a working stream; a fresh PC is needed.
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
            pc.connectionState === 'disconnected' ||
            pc.connectionState === 'new'
          )) {
            if (pc.connectionState === 'new') {
              console.log(`[WEBRTC-DEBUG] teacher: evicting idle 'new'-state PC for ${student.socket_id} (never negotiated) ts=${Date.now()}`);
            } else {
              console.log(`[WEBRTC-DEBUG] teacher: stale PC (state=${pc.connectionState}) for ${student.socket_id} on resume, closing & deleting ts=${Date.now()}`);
            }
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
    console.log(
      `[DEBUG-RACE] teacher handleStopScreenShareInternal ENTER — Map size=${peerConnectionsRef.current.size} | PCs:`,
      Array.from(peerConnectionsRef.current.entries()).map(([sockId, pc]) => ({
        socket_id: sockId,
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
      })),
      `ts=${Date.now()}`
    );
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

    if (mediaRecorderRef.current && recordingUsesBroadcastStreamRef.current) {
      const recorderState = mediaRecorderRef.current.state;
      if (recorderState === "recording") {
        if (!screenStreamRef.current) {
          // Native "Stop sharing" bar — stream truly ended, can't pause/resume onto a dead stream.
          console.log(`[DEBUG][RECORDING] auto-stopping — broadcast stream ended (native stop-sharing bar), finalizing recording now`);
          mediaRecorderRef.current.stop();
          recordingUsesBroadcastStreamRef.current = false;
          setRecordingState("off");
          setRecordingSeconds(0);
        } else {
          // In-app button — track still alive, just disabled. Pause, can resume.
          console.log(`[DEBUG][RECORDING] pausing recording — screen share stopped (in-app button), stream preserved for resume`);
          mediaRecorderRef.current.pause();
        }
      }
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }

    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      console.log(`[DEBUG] teacher broadcast_ended emit (handleStopScreenShareInternal): student IDs in Map=[${Array.from(peerConnectionsRef.current.keys()).join(', ')}], Map size=${peerConnectionsRef.current.size}, ts=${Date.now()}`);
      socket.emit("webrtc:broadcast_ended", { session_id: sessionInfoRef.current.id });
    }
    setIsScreenSharing(false);
    // Revert to editor mode so students see the code editor again
    handleModeSwitch("editor");
  };

  const handleMicToggle = async () => {
    // No mic stream yet (permission never granted, or was denied) — treat the
    // click as "turn on the microphone": (re)prompt for OS/browser permission,
    // then unmute immediately since the teacher just explicitly asked for it.
    if (!micStreamRef.current) {
      const micStream = await acquireMicStream();
      if (!micStream) return; // still denied/unavailable — micWarning now explains why
      micStream.getAudioTracks().forEach((t) => { t.enabled = true; });
      setMicMuted(false);
      return;
    }

    const newMuted = !micMuted;
    micStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted; // true = audible, false = muted
    });
    setMicMuted(newMuted);
  };

  const emitCodeOutput = (outMode, txtOut, ifrSrc, conLines, showIfr = true) => {
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:code_output", {
        sessionId: sessionInfoRef.current.id,
        output: {
          outputMode: outMode,
          textOutput: txtOut,
          iframeSrcdoc: ifrSrc,
          consoleLines: conLines,
          showIframe: showIfr,
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

  const handleWhiteboardStroke = (stroke) => {
    if (stroke && stroke.phase === "end") {
      teacherWhiteboardStrokesRef.current.push(stroke);
    }
    const currentBg = whiteboardRef.current?.getBgColor?.() || teacherWhiteboardBgColorRef.current;
    teacherWhiteboardBgColorRef.current = currentBg;

    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:whiteboard_stroke", {
        sessionId: sessionInfoRef.current.id,
        stroke,
        bgColor: currentBg,
      });
    }
  };

  const handleWhiteboardClear = () => {
    teacherWhiteboardStrokesRef.current = [];
    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:whiteboard_clear", {
        sessionId: sessionInfoRef.current.id,
      });
    }
  };

  const handleWhiteboardSync = (strokes) => {
    teacherWhiteboardStrokesRef.current = [...(strokes || [])];
    const currentBg = whiteboardRef.current?.getBgColor?.() || teacherWhiteboardBgColorRef.current;
    teacherWhiteboardBgColorRef.current = currentBg;

    const socket = getSocket();
    if (socket && sessionInfoRef.current) {
      socket.emit("teacher:whiteboard_sync", {
        sessionId: sessionInfoRef.current.id,
        strokes,
        bgColor: currentBg,
      });
    }
  };

  const handleSaveWhiteboard = async () => {
    if (!whiteboardRef.current) return;
    try {
      const blob = await whiteboardRef.current.getCanvasBlob();
      if (!blob) {
        toast.error("Whiteboard image data unavailable");
        return;
      }

      const supportsFileSystemAccess = typeof window.showSaveFilePicker === "function";
      const filename = `whiteboard-${Date.now()}.png`;

      if (supportsFileSystemAccess) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "PNG Image", accept: { "image/png": [".png"] } }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success("Whiteboard image saved successfully");
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
          console.warn("showSaveFilePicker failed, falling back to download link", err);
        }
      }

      // Fallback download link for browsers without File System Access API
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Whiteboard image downloaded");
    } catch (err) {
      console.error("Failed to save whiteboard image:", err);
      toast.error("Failed to save whiteboard image: " + err.message);
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

  const isBroadcasting = broadcastState === "live";
  const isRecording = recordingState === "recording";
  // ── Idle Schedule / Instant pill pair ─────────────────────────────────────
  // Both pills are always mounted. `activeSide` is the one violet, labelled
  // pill; the other rests as a dim icon-only circle. Hover wins over the
  // scheduled/idle default; the two click flows pin it while they run.
  const scheduledNow = !!currentLecture;
  const defaultSide = scheduledNow ? "schedule" : "instant";
  let activeSide;
  if (pillTarget === "schedule" || scheduleIconLoading) activeSide = "schedule";
  else if (startButtonLoading) activeSide = "instant";
  else if (scheduleHover) activeSide = "schedule";
  else if (startHover) activeSide = "instant";
  else activeSide = defaultSide;

  const schedActive = activeSide === "schedule";
  const instActive = activeSide === "instant";
  // Schedule side, when it's the active pill: full violet "Scheduled" if a
  // lecture is on now, else a muted grey pill labelled "Idle".
  const schedIdle = schedActive && !scheduledNow;
  const calGlyphHidden = scheduleIconLoading;
  // Self-hover label retract applies ONLY to the side that is the resting
  // default — hovering the *other* side's circle blooms it fully (label and
  // all), which is the whole point of the cross-over.
  const schedIsDefault = defaultSide === "schedule"; // ⟺ scheduledNow
  const instIsDefault = defaultSide === "instant";
  // Label ("Scheduled" / "Idle") shows while active — except a self-hover on the
  // *real* Scheduled default pill retracts it (icon centres, width held). The
  // dim "Idle" pill keeps its label; the loading beat swaps in "Starting…".
  const schedLabelShown =
    schedActive &&
    !scheduleIconLoading &&
    !(scheduleHover && schedIsDefault && scheduledNow);
  // Instant side: label shows while active; a self-hover on the Instant default
  // pill retracts it; the loading beat forces it back ("Starting…").
  const instLabelShown =
    startButtonLoading || (instActive && !(startHover && instIsDefault));
  // Required to start a session: lecture name, subject, session password, and at
  // least one selected class. Lab Room is optional (labelled as such in the
  // setup modal) — it defaults to "LAB 301" but an empty value is allowed.
  const isFormValid =
    (formData?.lectureName || "").trim() !== "" &&
    (formData?.subject || "").trim() !== "" &&
    (formData?.password || "").trim() !== "" &&
    (selectedClassIds || []).length > 0;
  const viewerCount = connectedStudents.length;
  const hasMic = !!micStreamRef.current;

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-bg-base">
      <div className="flex-1 flex overflow-hidden">
        {/* Preview / Editor — the single primary content area; no side panel exists here */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* Content container */}
          <div
            ref={fullScreenContainerRef}
            className={`flex-1 bg-bg-surface flex flex-col relative overflow-hidden transition-[background-color,border-color,border-radius] duration-150 ${
              isFullScreen
                ? "fixed top-0 left-0 right-0 bottom-0 z-[99999] w-full h-full max-w-full max-h-full bg-bg-base border-none rounded-none overflow-hidden"
                : "border border-border rounded-[var(--radius-lg)]"
            }`}
          >
            {/* ── SCREEN SHARE MODE ────────────────────────────────────────── */}
            {activeMode === "screen" && (
              <>
                {isBroadcasting ? (
                  <>
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    <div className="absolute top-4 right-4 z-10">
                      <button
                        type="button"
                        onClick={handleToggleFullScreen}
                        className="p-2 rounded-[var(--radius-md)] bg-bg-surface/80 hover:bg-bg-surface text-text-primary backdrop-blur border border-border transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95"
                        title={isFullScreen ? "Exit Fullscreen (Esc)" : "Full Screen"}
                        aria-label={isFullScreen ? "Exit fullscreen" : "Enter fullscreen"}
                      >
                        {isFullScreen ? <Minimize className="w-[18px] h-[18px]" /> : <Maximize className="w-[18px] h-[18px]" />}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center relative">
                    <div className="absolute top-4 right-4 z-10">
                      <button
                        type="button"
                        onClick={handleToggleFullScreen}
                        className="p-2 rounded-[var(--radius-md)] bg-bg-surface/80 hover:bg-bg-surface text-text-primary backdrop-blur border border-border transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95"
                        title={isFullScreen ? "Exit Fullscreen (Esc)" : "Full Screen"}
                        aria-label={isFullScreen ? "Exit fullscreen" : "Enter fullscreen"}
                      >
                        {isFullScreen ? <Minimize className="w-[18px] h-[18px]" /> : <Maximize className="w-[18px] h-[18px]" />}
                      </button>
                    </div>
                    <div className="text-center">
                      <MonitorStop className="w-[72px] h-[72px] text-text-muted mx-auto mb-3" />
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
                  <Select
                    value={editorLanguage}
                    onValueChange={handleLanguageChange}
                    open={langMenuOpen}
                    onOpenChange={setLangMenuOpen}
                  >
                    <SelectTrigger
                      data-tour="broadcast-languages"
                      size="sm"
                      onMouseEnter={openLangMenu}
                      className="rounded-[var(--radius-md)] bg-bg-elevated hover:bg-bg-surface-3"
                    >
                      {/* Explicit children, not the default value-mirroring —
                          the closed trigger always shows the plain language
                          icon + name, decoupled from the open list's
                          hover/selected checkmark swap below. */}
                      <SelectValue>
                        {(() => {
                          const current = LANGUAGES.find((l) => l.id === editorLanguage);
                          return current ? (
                            <span className="flex items-center gap-1.5">
                              <current.icon className="w-3.5 h-3.5 shrink-0" />
                              {current.label}
                            </span>
                          ) : null;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      className="shadow-[var(--shadow-dropdown)]"
                      container={isFullScreen ? fullScreenContainerRef.current : undefined}
                    >
                      {LANGUAGES.map((l) => {
                        const isSelected = editorLanguage === l.id;
                        return (
                          <SelectItem
                            key={l.id}
                            value={l.id}
                            className="group pr-2 [&>span:first-child]:hidden"
                          >
                            <span
                              className={cn(
                                "flex items-center gap-1.5",
                                isSelected ? "text-accent-info font-bold" : "text-text-primary"
                              )}
                            >
                              <span className="relative w-3.5 h-3.5 shrink-0">
                                <l.icon
                                  className={cn(
                                    "w-3.5 h-3.5 absolute inset-0 transition-opacity duration-150",
                                    isSelected ? "opacity-100" : "opacity-100 group-hover:opacity-0"
                                  )}
                                />
                                <Check
                                  className={cn(
                                    "w-3.5 h-3.5 absolute inset-0 transition-opacity duration-150",
                                    isSelected ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                                  )}
                                />
                              </span>
                              {l.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <div className="flex-1" />

                  {/* Clear output — also synced to students, otherwise the
                      panel stays open on their side after the teacher clears
                      it locally. */}
                  {outputMode !== "none" && (
                    <button
                      onClick={() => {
                        setOutputMode("none");
                        setConsoleLines([]);
                        setTextOutput("");
                        emitCodeOutput("none", "", "", []);
                      }}
                      className="h-7 px-2 text-xs text-text-muted hover:text-text-secondary border border-border rounded-[var(--radius-sm)] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.95]"
                    >
                      Clear output
                    </button>
                  )}

                  {/* Run / Save button — solid primary blue */}
                  {editorLanguage === "whiteboard" ? (
                    <button
                      onClick={handleSaveWhiteboard}
                      className="h-7 px-3 text-xs font-medium bg-accent-success hover:bg-accent-success/90 text-white rounded-[var(--radius-sm)] transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.95] flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Save
                    </button>
                  ) : (
                    editorLanguage !== "plaintext" && (
                      <button
                        onClick={handleRunCode}
                        disabled={pyodideLoading}
                        className="h-7 px-3 text-xs font-medium bg-accent-success hover:bg-accent-success/90 text-white rounded-[var(--radius-sm)] transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.95] disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
                      >
                        {pyodideLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Run
                          </>
                        )}
                      </button>
                    )
                  )}

                  {/* YouTube style Fullscreen toggle button */}
                  <button
                    type="button"
                    onClick={handleToggleFullScreen}
                    className="h-7 px-2.5 text-xs font-medium rounded-[var(--radius-sm)] border border-border bg-bg-surface hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.95] flex items-center gap-1.5 ml-1"
                    title={isFullScreen ? "Exit Fullscreen (Esc)" : "Full Screen"}
                    aria-label={isFullScreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>

                {/* Resizable / Dockable Flex Container — sits flush against editor with no dead gap */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: (outputDockPosition === "bottom" || outputDockPosition === "top") ? "column" : "row",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Main Editor Slot — Whiteboard Canvas and Monaco Editor both permanently mounted */}
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      overflow: "hidden",
                      position: "relative",
                      order: (outputDockPosition === "left" || outputDockPosition === "top") ? 1 : 0,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "100%",
                        display: editorLanguage === "whiteboard" ? "block" : "none",
                      }}
                    >
                      <WhiteboardCanvas
                        ref={whiteboardRef}
                        readOnly={false}
                        isActive={editorLanguage === "whiteboard"}
                        initialStrokes={[...teacherWhiteboardStrokesRef.current]}
                        initialBgColor={teacherWhiteboardBgColorRef.current}
                        onStrokeEmit={handleWhiteboardStroke}
                        onClearEmit={handleWhiteboardClear}
                        onSyncEmit={handleWhiteboardSync}
                      />
                    </div>
                    <div
                      style={{
                        height: "100%",
                        width: "100%",
                        display: editorLanguage !== "whiteboard" ? "block" : "none",
                      }}
                    >
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
                  </div>

                  {/* Shared Dockable Code Output Panel */}
                  <CodeOutputPanel
                    outputMode={outputMode}
                    iframeSrcdoc={iframeSrcdoc}
                    iframeKey={iframeKey}
                    consoleLines={consoleLines}
                    textOutput={textOutput}
                    dockPosition={outputDockPosition}
                    onDockChange={setOutputDockPosition}
                    size={outputPanelSize}
                    onSizeChange={setOutputPanelSize}
                    resizable={true}
                    showIframe={outputMode !== "console" || jsHasVisibleOutput}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Control Bar ──────────────────────────────────────────────────────
              Idle: schedule notice (relocated from the removed top bar) sits
              above a centered "Start Lecture" button — the notice now lives
              right next to the action it pre-fills, instead of in an isolated
              header the teacher had to look up at separately.

              Live: THREE separate clusters spread across the row with real gaps
              between them (not one fused pill), so the eye reads groups instead
              of one continuous row of equal-weight buttons:
                1. Status cluster (live dot + timer + info) — left edge, because
                   it's the thing glanced at most often and reading order starts
                   left. It's read-only, so it's visually separated (its own
                   pill, its own background) from anything clickable.
                2. Primary session actions (Mute / Screen Share / Record) — the
                   dead-center of the bar, matching the video-call convention
                   this is deliberately borrowing (Meet/Zoom) so the muscle
                   memory transfers. These are real labeled buttons (icon +
                   text) with a visible border/background, distinct from the
                   icon-only glanceable elements — a teacher mid-lecture needs
                   to identify them without hovering.
                3. Participant count + End — right edge, kept close together as
                   one unit. Count is a low-frequency glance so it stays small
                   and secondary; End is the one solid-red, highest-stakes
                   control, isolated at the far edge so it's never in the
                   accidental-click path of the mic/screen/record cluster a
                   teacher is toggling rapidly in the center. */}
          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            {!isBroadcasting ? (
              loadingTimetable ? (
                <Skeleton className="h-12 w-64 rounded-full" />
              ) : (
                <div className="flex items-center gap-1 bg-bg-elevated border border-border rounded-full p-1.5 shadow-[var(--shadow-modal)]">
                  {/* ── Schedule side ──────────────────────────────────────────
                      Always mounted. Active (a lecture is on now, or its circle
                      is hovered) → violet "Scheduled" pill; active with NO
                      lecture → a muted grey pill labelled "Idle".
                      Inactive → a dim icon-only circle. A self-hover on the real
                      "Scheduled" pill retracts its label at held width (icon
                      centres); the click flow holds it open for the spinner and
                      drops the calendar glyph once "Starting…" shows. All sizing
                      rides the ONE PILL_TRANSITION spring. */}
                  <Tooltip open={schedTipOpen} onOpenChange={setSchedTipOpen}>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        onClick={handleScheduleIconClick}
                        onMouseEnter={() => setScheduleHover(true)}
                        onMouseLeave={() => setScheduleHover(false)}
                        aria-label={
                          scheduledNow
                            ? `Scheduled now: ${currentLecture.subject || currentLecture.subject_name} — click to start`
                            : "No lecture scheduled"
                        }
                        className={cn(
                          "relative h-9 rounded-full flex items-center justify-center shrink-0 font-semibold transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95",
                          schedActive
                            ? schedIdle
                              ? "bg-bg-surface-3 text-text-secondary border border-border"
                              : "bg-accent-700 text-white shadow-[var(--shadow-modal)]"
                            : "bg-bg-surface-3 text-text-secondary hover:text-text-primary"
                        )}
                        initial={false}
                        animate={
                          schedActive
                            ? { minWidth: "8rem", paddingLeft: "1.5rem", paddingRight: "1.5rem" }
                            : { minWidth: "2.25rem", paddingLeft: "0.625rem", paddingRight: "0.625rem" }
                        }
                        transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                      >
                        {!calGlyphHidden && <CalendarStats className="w-[18px] h-[18px] relative shrink-0" />}

                        {/* "Scheduled" / "Idle" — width + opacity on the shared
                            spring. Retracts on a self-hover of the real pill and
                            during the loading beat. */}
                        <motion.span
                          className="overflow-hidden whitespace-nowrap"
                          initial={false}
                          animate={
                            schedLabelShown
                              ? { width: "auto", opacity: 1 }
                              : { width: 0, opacity: 0 }
                          }
                          transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                        >
                          <span className="pl-2">{scheduledNow ? "Scheduled" : "Idle"}</span>
                        </motion.span>

                        {/* Loading beat — spinner + "Starting…" only (the
                            calendar glyph above is dropped while this shows). */}
                        <motion.span
                          className="overflow-hidden whitespace-nowrap"
                          initial={false}
                          animate={
                            scheduleIconLoading
                              ? { width: "auto", opacity: 1 }
                              : { width: 0, opacity: 0 }
                          }
                          transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                        >
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Starting…</span>
                          </span>
                        </motion.span>
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-bg-elevated text-text-primary px-3.5 py-2.5 rounded-[var(--radius-lg)] shadow-[var(--shadow-modal)] max-w-[240px]"
                    >
                      {scheduledNow ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-text-primary">
                            {currentLecture.subject || currentLecture.subject_name}
                          </span>
                          <span className="text-text-secondary text-[11px]">
                            {currentLecture.class_name ? `${currentLecture.class_name} · ` : ""}
                            {toHHMM(currentLecture.start_time)}–{toHHMM(currentLecture.end_time)}
                          </span>
                          <span className="text-accent-500 text-[10px] font-medium mt-0.5">
                            Click to start this lecture
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-medium text-text-secondary">
                          No lecture scheduled
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>

                  {/* ── Instant side ──────────────────────────────────────────
                      Mirror of the Schedule side. Active → violet "Instant"
                      pill; inactive → a dim icon-only circle. A self-hover
                      retracts the label at held width (Monitor centres); the
                      click flow swaps the glyph + label for a spinner +
                      "Starting…". Same PILL_TRANSITION spring, opposite
                      direction, so the fill hands off between the two anchors. */}
                  <motion.button
                    type="button"
                    data-tour="teacher-broadcast-start"
                    onClick={handleStartButtonClick}
                    onMouseEnter={() => setStartHover(true)}
                    onMouseLeave={() => setStartHover(false)}
                    disabled={startButtonLoading}
                    className={cn(
                      "relative h-9 rounded-full flex items-center justify-center font-semibold shrink-0 transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 disabled:cursor-wait",
                      instActive
                        ? "bg-accent-700 hover:bg-accent-700/90 text-white shadow-[var(--shadow-modal)]"
                        : "bg-bg-surface-3 text-text-secondary hover:text-text-primary"
                    )}
                    initial={false}
                    animate={
                      instActive
                        ? { minWidth: "8rem", paddingLeft: "1.5rem", paddingRight: "1.5rem" }
                        : { minWidth: "2.25rem", paddingLeft: "0.625rem", paddingRight: "0.625rem" }
                    }
                    transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                  >
                    {startButtonLoading ? (
                      <Loader2 className="w-[18px] h-[18px] shrink-0 animate-spin" />
                    ) : (
                      <Monitor className="w-[18px] h-[18px] shrink-0" />
                    )}
                    <motion.span
                      className="overflow-hidden whitespace-nowrap"
                      initial={false}
                      animate={
                        instLabelShown ? { width: "auto", opacity: 1 } : { width: 0, opacity: 0 }
                      }
                      transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                    >
                      <span className="pl-2">
                        {startButtonLoading ? "Starting…" : "Instant"}
                      </span>
                    </motion.span>
                  </motion.button>
                </div>
              )
            ) : (
              <div className="w-full flex items-center justify-between gap-4 flex-wrap">
                {/* 1. Status cluster — live dot, timer, info (read-only, own pill) */}
                <div className="flex items-center gap-2 bg-bg-elevated/90 backdrop-blur border border-border rounded-full pl-3.5 pr-2 py-2 shadow-[var(--shadow-modal)] shrink-0">
                  <LiveDot />
                  <span className="tnum font-semibold text-sm text-text-primary" title="Session duration">
                    {formatTime(sessionSeconds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSessionInfoDialog(true)}
                    title="Session info — lecture, subject, password"
                    aria-label="Session info"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-surface-3 transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>

                {/* 2. Primary session actions — Mute / Screen Share / Record, as
                    real labeled buttons so each is identifiable at a glance. */}
                <div className="flex items-center gap-2.5 flex-wrap justify-center">
                  {/* Mic toggle — always shown while live. Muted by default; if
                      permission hasn't been granted (or was denied), clicking
                      (re)prompts the OS/browser permission dialog instead of
                      being disabled, so the teacher always has a way to turn it on. */}
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    onMouseEnter={() => setHoveredControlButton("mic")}
                    onMouseLeave={() => setHoveredControlButton(null)}
                    title={
                      !hasMic
                        ? micWarning
                          ? "Microphone permission blocked — enable it in your browser/OS settings, then click to try again"
                          : "Turn on microphone"
                        : micMuted
                        ? "Unmute microphone"
                        : "Mute microphone"
                    }
                    aria-label={!hasMic ? "Turn on microphone" : micMuted ? "Unmute microphone" : "Mute microphone"}
                    className={cn(
                      "btn-press relative h-10 rounded-full text-sm font-medium border transition-colors duration-150",
                      !hasMic
                        ? micWarning
                          ? "border-accent-warning/40 bg-accent-warning/15 text-accent-warning hover:bg-accent-warning/25"
                          : "border-border bg-bg-surface-3/60 text-text-primary hover:bg-bg-surface-3"
                        : micMuted
                        ? "border-accent-critical/50 bg-accent-critical/90 text-white hover:bg-accent-critical"
                        : "border-border bg-bg-surface-3/60 text-text-primary hover:bg-bg-surface-3"
                    )}
                  >
                    {micWarning && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent-warning ring-2 ring-bg-elevated" aria-hidden="true" />
                    )}
                    {/* Invisible sizer — always the full expanded content, so the
                        button's own box (driven by this normal-flow child) never
                        changes size. The real, animated content is the absolutely
                        positioned layer below, which can't affect this size. */}
                    <span className="invisible flex items-center px-4" aria-hidden="true">
                      {micMuted || !hasMic ? <MicOff className="w-[18px] h-[18px] shrink-0" /> : <Mic className="w-[18px] h-[18px] shrink-0" />}
                      <span className="pl-2 whitespace-nowrap">{!hasMic ? "Turn On Mic" : micMuted ? "Unmute" : "Mute"}</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center px-4">
                      {micMuted || !hasMic ? <MicOff className="w-[18px] h-[18px] shrink-0" /> : <Mic className="w-[18px] h-[18px] shrink-0" />}
                      <motion.span
                        className="overflow-hidden whitespace-nowrap"
                        initial={false}
                        animate={
                          hoveredControlButton === "mic"
                            ? { width: 0, opacity: 0 }
                            : { width: "auto", opacity: 1 }
                        }
                        transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                      >
                        <span className="pl-2">{!hasMic ? "Turn On Mic" : micMuted ? "Unmute" : "Mute"}</span>
                      </motion.span>
                    </span>
                  </button>

                  {/* Screen Share toggle */}
                  <button
                    data-tour="broadcast-screenshare"
                    type="button"
                    onClick={isScreenSharing ? handleStopScreenShareInternal : handleStartScreenShare}
                    onMouseEnter={() => setHoveredControlButton("screenshare")}
                    onMouseLeave={() => setHoveredControlButton(null)}
                    title={isScreenSharing ? "Stop screen sharing (session stays active)" : "Share your screen with students"}
                    aria-label={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
                    className={cn(
                      "btn-press relative h-10 rounded-full text-sm font-medium border transition-colors duration-150",
                      isScreenSharing
                        ? "border-accent-700/50 bg-accent-700 text-white hover:bg-accent-700/90"
                        : "border-border bg-bg-surface-3/60 text-text-primary hover:bg-bg-surface-3"
                    )}
                  >
                    <span className="invisible flex items-center px-4" aria-hidden="true">
                      {isScreenSharing ? <ScreenShareOff className="w-[18px] h-[18px] shrink-0" /> : <ScreenShareOn className="w-[18px] h-[18px] shrink-0" />}
                      <span className="pl-2 whitespace-nowrap">{isScreenSharing ? "Stop Sharing" : "Start Screen Share"}</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center px-4">
                      {isScreenSharing ? <ScreenShareOff className="w-[18px] h-[18px] shrink-0" /> : <ScreenShareOn className="w-[18px] h-[18px] shrink-0" />}
                      <motion.span
                        className="overflow-hidden whitespace-nowrap"
                        initial={false}
                        animate={
                          hoveredControlButton === "screenshare"
                            ? { width: 0, opacity: 0 }
                            : { width: "auto", opacity: 1 }
                        }
                        transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                      >
                        <span className="pl-2">{isScreenSharing ? "Stop Sharing" : "Start Screen Share"}</span>
                      </motion.span>
                    </span>
                  </button>

                  {/* Record toggle */}
                  <button
                    data-tour="broadcast-record"
                    type="button"
                    onClick={handleToggleRecording}
                    onMouseEnter={() => setHoveredControlButton("record")}
                    onMouseLeave={() => setHoveredControlButton(null)}
                    title={isRecording ? "Stop recording" : "Start recording"}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={cn(
                      "btn-press relative h-10 rounded-full text-sm font-medium border transition-colors duration-150",
                      isRecording
                        ? "border-accent-critical/50 bg-accent-critical/90 text-white hover:bg-accent-critical"
                        : "border-border bg-bg-surface-3/60 text-text-primary hover:bg-bg-surface-3"
                    )}
                  >
                    {isRecording && (
                      <span className="absolute inset-0 rounded-full ring-2 ring-accent-critical/50 pulse-dot" aria-hidden="true" />
                    )}
                    <span className="invisible flex items-center px-4" aria-hidden="true">
                      {isRecording ? <LivePhotoOff className="w-[18px] h-[18px] shrink-0" /> : <LivePhoto className="w-[18px] h-[18px] shrink-0" />}
                      <span className="pl-2 whitespace-nowrap">{isRecording ? "Stop Recording" : "Record"}</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center px-4">
                      {isRecording ? (
                        <LivePhotoOff className="w-[18px] h-[18px] shrink-0" />
                      ) : (
                        <LivePhoto className="w-[18px] h-[18px] shrink-0" />
                      )}
                      <motion.span
                        className="overflow-hidden whitespace-nowrap"
                        initial={false}
                        animate={
                          hoveredControlButton === "record"
                            ? { width: 0, opacity: 0 }
                            : { width: "auto", opacity: 1 }
                        }
                        transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                      >
                        <span className="pl-2">{isRecording ? "Stop Recording" : "Record"}</span>
                      </motion.span>
                    </span>
                  </button>

                  {/* Download Recording — appears only once a finished recording is ready */}
                  {recordingDownloadUrl && recordingState === "off" && (
                    <a
                      href={recordingDownloadUrl}
                      download="session-recording.webm"
                      title="Download Recording"
                      aria-label="Download Recording"
                      className="h-10 px-4 rounded-full flex items-center gap-2 text-sm font-medium border border-border bg-bg-surface-3/60 text-text-primary hover:bg-bg-surface-3 transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
                    >
                      <Download className="w-[18px] h-[18px]" />
                      Download
                    </a>
                  )}
                </div>

                {/* 3. Participant count + End — right edge, kept close together */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate("/teacher/monitor")}
                    title={`${connectedStudents.length} ${connectedStudents.length === 1 ? "student" : "students"} connected — open Student Monitor`}
                    aria-label="Open Student Monitor"
                    className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated/90 backdrop-blur border border-border rounded-full text-xs text-text-secondary font-medium hover:text-text-primary hover:border-border-hover transition-[color,border-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                  >
                    <Users className="w-4 h-4" />
                    <span className="tnum">{connectedStudents.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStopConfirm(true)}
                    onMouseEnter={() => setHoveredControlButton("end")}
                    onMouseLeave={() => setHoveredControlButton(null)}
                    title="End lecture"
                    aria-label="End lecture"
                    className="btn-press relative h-11 rounded-full bg-accent-critical hover:bg-accent-critical/90 text-white font-medium text-sm shadow-[var(--shadow-modal)] transition-colors duration-150"
                  >
                    <span className="invisible flex items-center px-5" aria-hidden="true">
                      <MonitorStop className="w-[18px] h-[18px] shrink-0" />
                      <span className="pl-2 whitespace-nowrap">End</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center px-5">
                      <MonitorStop className="w-[18px] h-[18px] shrink-0" />
                      <motion.span
                        className="overflow-hidden whitespace-nowrap"
                        initial={false}
                        animate={
                          hoveredControlButton === "end"
                            ? { width: 0, opacity: 0 }
                            : { width: "auto", opacity: 1 }
                        }
                        transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                      >
                        <span className="pl-2">End</span>
                      </motion.span>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Screen share error — shown below control bar */}
          {screenShareError && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-md)] text-xs text-accent-critical">
              <TriangleAlert className="w-4 h-4 flex-shrink-0" />
              <span>{screenShareError}</span>
              <button onClick={() => setScreenShareError("")} className="ml-auto text-accent-critical/60 hover:text-accent-critical" aria-label="Dismiss screen share error">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Recording error — shown below control bar */}
          {recordingError && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-md)] text-xs text-accent-critical">
              <TriangleAlert className="w-4 h-4 flex-shrink-0" />
              <span>{recordingError}</span>
              <button onClick={() => setRecordingError("")} className="ml-auto text-accent-critical/60 hover:text-accent-critical" aria-label="Dismiss recording error">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Note for browsers without File System Access API support — not
              shown in the Electron app, which saves direct-to-folder via its
              own native dialog regardless of browser API support. */}
          {!(typeof window !== "undefined" && window.electronAPI?.isElectron) &&
            typeof window.showSaveFilePicker !== "function" &&
            (isRecording || (recordingDownloadUrl && recordingState === "off")) && (
              <p className="text-xs text-text-muted mt-1 text-center w-full">
                Your browser doesn't support direct-to-folder saving; a download link will appear here when you stop recording.
              </p>
            )}
        </div>
      </div>

      {/* ── Session Info Dialog — low-frequency lookup (lecture/subject/password),
          reached via the small "i" icon in the bottom bar rather than living
          permanently on screen. bg-elevated per the app's modal convention. ──── */}
      <Dialog open={showSessionInfoDialog} onOpenChange={setShowSessionInfoDialog}>
        <DialogContent data-role="teacher" className="bg-bg-elevated border-border text-text-primary sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-primary flex items-center gap-2">
              <Info className="w-[18px] h-[18px]" strokeWidth={1.75} />
              Lecture Info
            </DialogTitle>
          </DialogHeader>
          {sessionInfo && (
            <div className="flex flex-col gap-4 pt-1">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Lecture Name
                </div>
                <div className="text-sm text-text-primary">{sessionInfo.lectureName}</div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Subject
                </div>
                <div className="text-sm text-text-primary">{sessionInfo.subject}</div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Password
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-base border border-border rounded-[var(--radius-md)]">
                  <span className="tnum font-bold text-text-primary tracking-wider text-sm">
                    {showPassword ? sessionInfo.password : "••••••••"}
                  </span>
                  <button
                    onClick={() => setShowPassword((p) => !p)}
                    className="text-text-muted hover:text-text-primary transition-[color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 p-1 rounded-[var(--radius-sm)] hover:bg-bg-surface-3"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const msg =
                    `📚 Live Lab Session is Active!\n\n` +
                    `Lecture: ${sessionInfo.lectureName}\n` +
                    `Subject: ${sessionInfo.subject}\n` +
                    `Lab Room: ${sessionInfo.labRoom}\n` +
                    `Password: ${sessionInfo.password}\n\n` +
                    `Log in to the student portal, enter the password, and click "JOIN NOW".`;
                  handleCopy("sessionInfoPassword", msg);
                }}
                className="w-full justify-center gap-2 border-border text-text-secondary hover:text-text-primary hover:bg-bg-surface-3"
              >
                {copiedField === "sessionInfoPassword" ? (
                  <>
                    <Check className="w-4 h-4 text-accent-success" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Invite Message
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Session Setup Modal ──────────────────────────────────────────────── */}
      <Dialog
        open={showSetupModal}
        onOpenChange={(open) => {
          setShowSetupModal(open);
          if (!open) {
            // Modal dismissed via Esc / overlay / the close button (a
            // successful start closes it directly, not through here) — hand the
            // pill back to its resting position and drop the "Starting…" state.
            setPillTarget("start");
            setScheduleIconLoading(false);
            setStartButtonLoading(false);
          }
        }}
      >
        <DialogContent data-role="teacher" className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary flex items-center gap-2">
              {setupModalMode === "scheduled" ? (
                <CalendarStats className="w-[18px] h-[18px]" strokeWidth={1.75} />
              ) : (
                <Monitor className="w-[18px] h-[18px]" strokeWidth={1.75} />
              )}
              {setupModalMode === "scheduled" ? "Start Scheduled Lecture" : "Start Instant Lecture"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Icon sits ON the pill's border. Built by hand rather than
                fieldset/legend's native "notch" (which silently stops
                working once the fieldset itself is display:flex in some
                browsers): an icon "patch" is absolutely positioned with its
                own vertical center pinned exactly to the pill's top border
                line, painted with the modal's own background color so it
                visually breaks the border line underneath it, sitting above
                the pill (z-10) so it's never clipped. */}
            <div className="relative group">
              <div className="absolute left-4 top-0 -translate-y-1/2 z-10 flex items-center px-1 bg-bg-surface">
                <Books className="w-4 h-4 text-text-muted group-focus-within:text-accent-info transition-colors duration-150" strokeWidth={1.75} />
              </div>
              <div style={{ height: '46px', borderRadius: '17px' }} className="border border-solid border-text-secondary focus-within:border-accent-info transition-colors duration-150 flex items-center">
                <input
                  type="text"
                  placeholder="Lecture Name"
                  value={formData.lectureName}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, lectureName: e.target.value }))
                  }
                  className="w-full h-full bg-transparent border-0 outline-none px-4 text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>

            <div className="relative group">
              <div className="absolute left-4 top-0 -translate-y-1/2 z-10 flex items-center px-1 bg-bg-surface">
                <Book2 className="w-4 h-4 text-text-muted group-focus-within:text-accent-info transition-colors duration-150" strokeWidth={1.75} />
              </div>
              <div style={{ height: '46px', borderRadius: '17px' }} className="border border-solid border-text-secondary focus-within:border-accent-info transition-colors duration-150 flex items-center">
                <input
                  type="text"
                  placeholder="Subject Name"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, subject: e.target.value }))
                  }
                  className="w-full h-full bg-transparent border-0 outline-none px-4 text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>

            <div className="relative group">
              <div className="absolute left-4 top-0 -translate-y-1/2 z-10 flex items-center px-1 bg-bg-surface">
                <Lock className="w-4 h-4 text-text-muted group-focus-within:text-accent-info transition-colors duration-150" strokeWidth={1.75} />
              </div>
              <div style={{ height: '46px', borderRadius: '17px' }} className="relative border border-solid border-text-secondary focus-within:border-accent-info transition-colors duration-150 flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Lecture Password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, password: e.target.value }))
                  }
                  className="w-full h-full bg-transparent border-0 outline-none px-4 pr-10 text-sm text-text-primary placeholder:text-text-muted"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-[color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute left-4 top-0 -translate-y-1/2 z-10 flex items-center px-1 bg-bg-surface">
                <MapPin className="w-4 h-4 text-text-muted group-focus-within:text-accent-info transition-colors duration-150" strokeWidth={1.75} />
              </div>
              <div style={{ height: '46px', borderRadius: '17px' }} className="border border-solid border-text-secondary focus-within:border-accent-info transition-colors duration-150 flex items-center">
                <input
                  type="text"
                  placeholder="Lab Room"
                  value={formData.labRoom}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, labRoom: e.target.value }))
                  }
                  className="w-full h-full bg-transparent border-0 outline-none px-4 text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <Chalkboard className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
                Select Classes
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
                      className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium border transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96] flex items-center gap-1.5 ${
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
              onClick={handleStartBroadcast}
              disabled={startLoading}
              aria-disabled={!isFormValid || startLoading}
              className={cn(
                "btn-press text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150",
                // Live/running → high-vis broadcast green; not-yet-started → teacher violet
                isBroadcasting
                  ? "bg-accent-live hover:bg-accent-live/90"
                  : "bg-accent-info hover:bg-accent-info/90",
                // Required fields incomplete → dimmed + not-allowed cursor on hover
                // (aria-disabled, not disabled, so the cursor still shows; the
                //  handler already no-ops via `if (!isFormValid) return`).
                isFormValid
                  ? "cursor-pointer"
                  : "opacity-40 cursor-not-allowed hover:bg-accent-info"
              )}
            >
              {startLoading ? (
                <Loader2 className="w-[18px] h-[18px] mr-2 animate-spin" />
              ) : setupModalMode === "scheduled" ? (
                <CalendarStats className="w-[18px] h-[18px] mr-2" />
              ) : (
                <Monitor className="w-[18px] h-[18px] mr-2" />
              )}
              {startLoading ? "Starting…" : "Start Lecture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stop Broadcast Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              End this lecture session?
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
              className="bg-accent-critical hover:bg-accent-critical/90 text-white border-0 flex items-center gap-1.5"
            >
              <MonitorStop className="w-4 h-4" />
              End
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
