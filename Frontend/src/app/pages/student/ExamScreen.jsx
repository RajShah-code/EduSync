import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { getSocket } from "../../store/socket";
import { useFocusGuard } from "../../hooks/useFocusGuard";
import { Timer } from "../../components/Timer";
import { ExamLocked } from "./ExamLocked";
import Editor from "@monaco-editor/react";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
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
import { cn } from "../../components/ui/utils";
import { IconClock as Clock, IconShieldCheck as ShieldCheck, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconChevronDown as ChevronDown, IconLoader2 as Loader2, IconFileText as FileText, IconPlayerPlay as Play, IconLayoutSidebarRight as PanelRight, IconLayoutSidebar as PanelLeft, IconLayoutNavbar as PanelTop, IconLayoutBottombar as PanelBottom, IconX as X } from "@tabler/icons-react";

// Dock options for the code-question console panel — a manually-built
// dropdown (matching CodeOutputPanel.jsx's pattern below) rather than the
// shared Select primitive: Select's popper-mode Viewport is height-locked to
// its trigger (a real, documented shadcn/Radix quirk), which clips a 4-item
// menu under a compact trigger to almost nothing. CodeOutputPanel already
// solved exactly this "dock position picker" problem elsewhere in the app —
// reusing that proven pattern instead of re-hitting the same bug.
const DOCK_OPTIONS = [
  { value: "right", label: "Right", icon: PanelRight },
  { value: "left", label: "Left", icon: PanelLeft },
  { value: "top", label: "Top", icon: PanelTop },
  { value: "bottom", label: "Bottom", icon: PanelBottom },
];
import { toast } from "sonner";

// ─── Pyodide lazy-loader (self-hosted) ─────────────────────────────────────────
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

const buildJsSrcdoc = (code, qId) =>
  `<!DOCTYPE html><html><head>
<script>
(function(){
  const send=(m,args)=>{
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch{return String(a)}}).join(' ');
    window.parent.postMessage({type:'__edusync_student_console__',method:m,msg,qId:${qId}},'*');
  };
  ['log','warn','error','info'].forEach(fn=>{console[fn]=(...a)=>send(fn,a);});
  window.onerror=(msg,_,line)=>{send('error',['Line '+line+': '+msg]);return true;};
  window.onunhandledrejection=e=>{send('error',['Unhandled promise: '+e.reason]);};
})();
<\/script>
</head>
<!-- Sandboxed iframe doc has no access to the parent's CSS custom properties,
     so these are literal values kept in sync with --bg-elevated / --text-primary. -->
<body style="margin:0;background:#17171A;color:#F1F2F5;font-family:system-ui;padding:12px">
<script>
try{
${code}
}catch(e){window.parent.postMessage({type:'__edusync_student_console__',method:'error',msg:e.message,qId:${qId}},'*');}
<\/script>
</body></html>`;

export function ExamScreen() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const [phase, setPhase] = useState("waiting");

  // Data received with exam:start
  const [examMeta, setExamMeta] = useState(null); // { examId, setNumber, timeLimitMinutes, serverStartTimestamp }
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [mcqAnswers, setMcqAnswers] = useState({}); // question_id -> selected_option (int index)
  const [codeAnswers, setCodeAnswers] = useState({}); // question_id -> code string

  // Runner local execution states (scoped by question ID)
  const [isRunning, setIsRunning] = useState({}); // { [qId]: boolean }
  const [pyodideLoading, setPyodideLoading] = useState({}); // { [qId]: boolean }
  const [textOutput, setTextOutput] = useState({}); // { [qId]: string }
  const [iframeSrcdoc, setIframeSrcdoc] = useState({}); // { [qId]: string }
  const [iframeKey, setIframeKey] = useState({}); // { [qId]: number }

  // UI state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // ── Code-question panel layout: resizable 3-way split + dockable console ──
  // Preference lives purely in component state — it's a per-session UI
  // convenience, not something worth persisting per-student.
  const [consoleDockPosition, setConsoleDockPosition] = useState("right"); // 'right' | 'left' | 'top' | 'bottom'
  const [questionPanelWidth, setQuestionPanelWidth] = useState(380);
  const [consoleSize, setConsoleSize] = useState(320); // width (left/right dock) or height (top/bottom dock), px
  const [isDockMenuOpen, setIsDockMenuOpen] = useState(false);
  const codeAreaRef = useRef(null); // outer row: [Question] [handle] [editor area]
  const editorAreaRef = useRef(null); // sub-container holding Editor + Console
  const dockMenuRef = useRef(null);

  useEffect(() => {
    if (!isDockMenuOpen) return;
    const handleClickOutside = (e) => {
      if (dockMenuRef.current && !dockMenuRef.current.contains(e.target)) {
        setIsDockMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDockMenuOpen]);

  // Lock details (for ExamLocked props)
  const [lockInfo, setLockInfo] = useState({});

  // Violation tracking — counts reported by server
  const [violationCount, setViolationCount] = useState(0);
  const [violationLimit, setViolationLimit] = useState(3);

  // Computed seconds remaining (server-authoritative)
  const secondsRemaining = examMeta
    ? Math.max(
        0,
        Math.floor(
          (examMeta.serverStartTimestamp +
            examMeta.timeLimitMinutes * 60 * 1000 -
            Date.now()) /
            1000
        )
      )
    : null;

  const token = localStorage.getItem("edusync_token");
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("edusync_user") || "{}");
    } catch {
      return {};
    }
  })();

  // ── useFocusGuard: reuse existing hook for fullscreen/visibility detection ──
  // Enabled only while in_progress. examId is passed as sessionId so the hook
  // can use it internally. The hook handles requestFullscreen and detects exits.
  const { containerRef, isFullscreen, hasFocus, requestFullscreen } = useFocusGuard({
    sessionId: examId,
    studentId: user.id,
    enabled: phase === "in_progress",
  });

  // ── Violation reporting: separate from useFocusGuard's session focus events ──
  // We add our own fullscreenchange and visibilitychange listeners SPECIFICALLY
  // to POST /exams/:id/violation. The hook continues handling session events
  // independently and is NOT modified. This avoids coupling exam logic to the hook.
  const hasEnteredFullscreenRef = useRef(false);
  const postingViolationRef = useRef(false); // debounce: one POST per event fire

  const reportViolation = useCallback(
    async (violationType) => {
      if (phase !== "in_progress") return;
      if (postingViolationRef.current) return;
      postingViolationRef.current = true;

      try {
        const res = await fetch(`${API_BASE_URL}/exams/${examId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ violation_type: violationType }),
        });
        const data = await res.json();
        if (res.ok) {
          setViolationCount(data.violationCount);
          setViolationLimit(data.violationLimit);
          if (!data.locked) {
            toast.warning(
              `⚠ Warning ${data.violationCount}/${data.violationLimit} — ${
                violationType === "fullscreen_exit" ? "Fullscreen exited" : "Tab switched"
              }`,
              { duration: 5000 }
            );
          }
          // If server says locked, ExamLocked is triggered via exam:force_lock socket event
        }
      } catch (err) {
        console.error("[ExamScreen] Violation POST failed:", err);
      } finally {
        // Allow next violation after a short cooldown to avoid double-firing
        setTimeout(() => { postingViolationRef.current = false; }, 1500);
      }
    },
    [phase, examId, token]
  );

  // Fullscreen exit listener (exam-specific, separate from useFocusGuard)
  useEffect(() => {
    if (phase !== "in_progress") return;

    const onFullscreenChange = () => {
      const isNowFullscreen = document.fullscreenElement !== null;
      if (isNowFullscreen) {
        hasEnteredFullscreenRef.current = true;
        return;
      }
      // Only report exit if we had actually entered fullscreen first
      if (hasEnteredFullscreenRef.current) {
        reportViolation("fullscreen_exit");
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasEnteredFullscreenRef.current) {
        reportViolation("tab_switch");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phase, reportViolation]);

  // ── Recovery check on mount: check if exam is already in progress ───────────
  useEffect(() => {
    let active = true;
    const checkActiveAttempt = async () => {
      setLoadingQuestions(true);
      try {
        const res = await fetch(`${API_BASE_URL}/exams/${examId}/my-questions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.questions && data.questions.length > 0) {
          // If a valid active attempt exists, restore it immediately
          const parsedQuestions = data.questions.map(q => {
            let opts = q.options;
            if (typeof q.options === 'string') {
              try { opts = JSON.parse(q.options); } catch (e) { opts = []; }
            }
            return { ...q, options: opts || [] };
          });
          setQuestions(parsedQuestions);
          setAttemptId(data.attemptId);
          setViolationCount(data.violationCount ?? 0);
          setViolationLimit(data.violationLimit ?? 3);
          setExamMeta({
            examId,
            setNumber: data.setNumber,
            timeLimitMinutes: data.timeLimitMinutes,
            serverStartTimestamp: new Date(data.startedAt).getTime(),
            title: data.title,
          });
          setPhase("in_progress");
        } else if (res.status === 403 && data.message === "Exam already submitted") {
          setPhase("submitted");
        }
      } catch (err) {
        console.error("[ExamScreen] Failed to recover active attempt:", err);
      } finally {
        if (active) setLoadingQuestions(false);
      }
    };
    checkActiveAttempt();
    return () => {
      active = false;
    };
  }, [examId, token]);

  // ── Socket: register socket + listen for exam events ───────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Register/re-register socket on every (re)connect so the server map is fresh
    const registerSocket = () => {
      socket.emit("exam:register_socket");
    };
    registerSocket();
    socket.on("connect", registerSocket);

    // exam:start — received individually from server when teacher starts the exam
    const handleExamStart = async (payload) => {
      if (parseInt(payload.examId) !== parseInt(examId)) return;
      console.log("[ExamScreen] exam:start received:", payload);
      setExamMeta(payload);
      setViolationLimit(payload.violationLimit ?? 3);

      // Fetch questions
      setLoadingQuestions(true);
      try {
        const res = await fetch(`${API_BASE_URL}/exams/${payload.examId}/my-questions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          const parsedQuestions = (data.questions || []).map(q => {
            let opts = q.options;
            if (typeof q.options === 'string') {
              try { opts = JSON.parse(q.options); } catch (e) { opts = []; }
            }
            return { ...q, options: opts || [] };
          });
          setQuestions(parsedQuestions);
          setAttemptId(data.attemptId);
          // Transition to active exam
          setPhase("in_progress");
          requestFullscreen();
        } else {
          toast.error(data.message || "Failed to load questions");
        }
      } catch (err) {
        toast.error("Could not fetch questions");
        console.error("[ExamScreen] Question fetch error:", err);
      } finally {
        setLoadingQuestions(false);
      }
    };

    // exam:violation_warning — server echoes count (already handled via POST response,
    // but socket update keeps UI in sync if multiple tabs somehow fired)
    const handleViolationWarning = ({ examId: eId, violationCount: vc, violationLimit: vl }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      setViolationCount(vc);
      setViolationLimit(vl);
    };

    // exam:force_lock — server-initiated lock (violation limit OR timer expiry)
    const handleForceLock = ({ examId: eId, reason }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      console.log("[ExamScreen] exam:force_lock received, reason:", reason);
      setLockInfo({ reason, examTitle: examMeta?.title });
      setPhase("locked");
    };

    socket.on("exam:start", handleExamStart);
    socket.on("exam:violation_warning", handleViolationWarning);
    socket.on("exam:force_lock", handleForceLock);

    return () => {
      socket.off("connect", registerSocket);
      socket.off("exam:start", handleExamStart);
      socket.off("exam:violation_warning", handleViolationWarning);
      socket.off("exam:force_lock", handleForceLock);
    };
  }, [examId, token, requestFullscreen, examMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listener for iframe postMessage (console mode for JS sandbox) ───────────
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type !== "__edusync_student_console__") return;
      const { method, msg, qId } = event.data;
      // Validate qId is present and belongs to our active questions list
      if (qId === undefined || qId === null) return;
      const questionExists = questions.some((q) => q.id === qId);
      if (!questionExists) return;

      const prefix =
        method === "error" ? "❌" : method === "warn" ? "⚠️" : method === "info" ? "info" : "›";

      setTextOutput((prev) => {
        const current = prev[qId] || "";
        return {
          ...prev,
          [qId]: current ? `${current}\n${prefix} ${msg}` : `${prefix} ${msg}`
        };
      });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [questions]);

  // ── Enter fullscreen on transition to in_progress ──────────────────────────
  useEffect(() => {
    if (phase === "in_progress") {
      hasEnteredFullscreenRef.current = false; // reset for new exam
      requestFullscreen();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generic drag-resize handler for the code-question panels ────────────────
  // Mirrors the mouse-event resize pattern already used for the dockable
  // output panel elsewhere in the app (CodeOutputPanel.jsx / student Task
  // page): track the pointer's start position, compute a signed delta on
  // mousemove, clamp into [min, max], and clean up listeners on mouseup.
  // `sign` encodes whether dragging in the positive axis direction should
  // grow or shrink the panel (depends on which side of the handle the panel
  // sits on), so the same function drives every handle in every dock layout.
  const startPanelResize = (e, { axis, sign, size, setSize, min, max }) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startSize = size;

    const handleMove = (moveEvent) => {
      const pos = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const delta = sign * (pos - startPos);
      const next = Math.max(min, Math.min(max, startSize + delta));
      setSize(Math.round(next));
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleClearOutput = (qId) => {
    setTextOutput((prev) => ({ ...prev, [qId]: "" }));
  };

  // ── Monaco local runner ─────────────────────────────────────────────────────
  const handleRunCode = async (qId, language) => {
    const code = codeAnswers[qId] ?? questions.find((q) => q.id === qId)?.starter_code ?? "";
    setIsRunning((prev) => ({ ...prev, [qId]: true }));

    if (language === "python") {
      setTextOutput((prev) => ({ ...prev, [qId]: "⏳ Loading Python runtime…" }));
      setPyodideLoading((prev) => ({ ...prev, [qId]: true }));

      let pyodide;
      try {
        pyodide = await loadStudentPyodide();
      } catch (loadErr) {
        setPyodideLoading((prev) => ({ ...prev, [qId]: false }));
        setIsRunning((prev) => ({ ...prev, [qId]: false }));
        setTextOutput((prev) => ({
          ...prev,
          [qId]: `❌ Python runtime unavailable:\n${loadErr.message}\n\nEnsure Pyodide files are in public/pyodide/`
        }));
        return;
      }

      setPyodideLoading((prev) => ({ ...prev, [qId]: false }));
      setTextOutput((prev) => ({ ...prev, [qId]: "" }));

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
        setTextOutput((prev) => ({ ...prev, [qId]: combined || "(no output)" }));
      } catch (runErr) {
        let errText = runErr.message || String(runErr);
        try {
          const stderr = pyodide.runPython("_err.getvalue()");
          if (stderr) errText = stderr;
        } catch {
          // ignore
        }
        setTextOutput((prev) => ({ ...prev, [qId]: `❌ ${errText}` }));
      } finally {
        setIsRunning((prev) => ({ ...prev, [qId]: false }));
      }
    } else if (language === "javascript") {
      setTextOutput((prev) => ({ ...prev, [qId]: "⏳ Sandboxing JavaScript execution…" }));
      // Set the iframe srcdoc to trigger the sandboxed run
      setIframeSrcdoc((prev) => ({ ...prev, [qId]: buildJsSrcdoc(code, qId) }));
      setIframeKey((prev) => ({ ...prev, [qId]: (prev[qId] || 0) + 1 }));
      setIsRunning((prev) => ({ ...prev, [qId]: false }));
      // Clear the loading message after a brief delay
      setTimeout(() => {
        setTextOutput((prev) => {
          if (prev[qId] === "⏳ Sandboxing JavaScript execution…") {
            return { ...prev, [qId]: "(no output)" };
          }
          return prev;
        });
      }, 500);
    } else {
      setIsRunning((prev) => ({ ...prev, [qId]: false }));
      setTextOutput((prev) => ({
        ...prev,
        [qId]: `❌ Local execution not supported for language: ${language.toUpperCase()}`
      }));
    }
  };

  // ── Submit exam ─────────────────────────────────────────────────────────────
  // Confirmation is our own AlertDialog (see showSubmitConfirm below), not
  // the browser's native window.confirm — this function now runs the actual
  // submission only, triggered from that dialog's confirm action.
  const handleSubmit = async () => {
    setSubmitting(true);

    const answers = questions.map((q) => ({
      questionId: q.id,
      ...(q.type === "mcq" ? { selectedOption: mcqAnswers[q.id] ?? null } : {}),
      ...(q.type === "code" ? { codeAnswer: codeAnswers[q.id] ?? "" } : {}),
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        setPhase("submitted");
        toast.success("Exam submitted successfully!");
        // Exit fullscreen gracefully
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setTimeout(() => {
          console.log("[EXAM-DEBUG] navigating to /student");
          navigate("/student");
        }, 1500);
      } else {
        const data = await res.json();
        toast.error(data.message || "Submission failed");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Timer expiry handler ────────────────────────────────────────────────────
  const handleTimerExpire = useCallback(() => {
    // Server will auto-submit and send exam:force_lock — we just show a toast
    toast.info("Time is up! Submitting your exam...");
  }, []);

  // ── Phase: locked ───────────────────────────────────────────────────────────
  if (phase === "locked") {
    const answeredCount = Object.keys(mcqAnswers).length + Object.keys(codeAnswers).length;
    return (
      <ExamLocked
        examTitle={examMeta?.title || "Exam"}
        submittedAt={new Date()}
        reason={lockInfo.reason}
        violationCount={violationCount}
        questionCount={questions.length}
        answeredCount={answeredCount}
      />
    );
  }

  // ── Phase: submitted ────────────────────────────────────────────────────────
  if (phase === "submitted") {
    const answeredCount = Object.keys(mcqAnswers).length + Object.keys(codeAnswers).length;
    return (
      <div className="h-screen bg-bg-base flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent-success/10 border-2 border-accent-success/30 flex items-center justify-center">
            <FileText className="w-8 h-8 text-accent-success" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-2">Exam Submitted</h1>
            <p className="text-text-secondary text-sm">
              Your answers have been recorded. Results will be available after grading.
            </p>
          </div>
          <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-md)] text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-text-secondary">Questions Answered</span>
              <span className="tnum text-text-primary">
                {answeredCount} / {questions.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Submitted At</span>
              <span className="tnum text-text-primary">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: waiting ──────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-4 p-6">
        {loadingQuestions ? (
          <Loader2 className="w-12 h-12 text-accent-info animate-spin" strokeWidth={1.75} />
        ) : (
          <ShieldCheck className="w-12 h-12 text-accent-info" strokeWidth={1.75} />
        )}
        <h1 className="text-xl font-semibold text-text-primary">
          {loadingQuestions ? "Loading exam..." : "Waiting for exam to begin"}
        </h1>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          {loadingQuestions
            ? "Fetching your question set..."
            : "Your teacher will start the exam shortly. Stay on this page. Do not switch tabs or exit fullscreen once the exam begins."}
        </p>
        <div className="mt-4 p-3 bg-bg-surface border border-border rounded-[var(--radius-md)] flex items-center gap-1.5 text-xs text-text-muted">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Exam ID: <span className="tnum">{examId}</span></span>
        </div>
      </div>
    );
  }

  // ── Phase: in_progress ──────────────────────────────────────────────────────
  const question = questions[currentIdx];
  const isCritical = secondsRemaining !== null && secondsRemaining < 300;

  // Last question by POSITION, not by type — Submit Exam replaces Next
  // whichever question type happens to land last in the set.
  const isLastQuestion = currentIdx === questions.length - 1;
  const navButtons = (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        onClick={() => setCurrentIdx((i) => i - 1)}
        disabled={currentIdx === 0}
        className="text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="w-4 h-4 mr-2" strokeWidth={1.75} />
        Previous
      </Button>

      {isLastQuestion ? (
        <Button
          onClick={() => setShowSubmitConfirm(true)}
          disabled={submitting}
          className="bg-accent-success hover:bg-accent-success/90 text-white font-semibold px-6"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.75} />
          ) : null}
          Submit Exam
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => setCurrentIdx((i) => i + 1)}
          className="border-border text-text-secondary hover:text-text-primary hover:bg-bg-surface-3"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-2" strokeWidth={1.75} />
        </Button>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="h-screen flex flex-col bg-bg-base">
      {/* Top bar — deliberately quiet by default. The timer carries the
          time-critical signal on its own (a subtle color/glow shift built
          into the Timer component itself); only genuine security
          interruptions (fullscreen exit, violations) get bold treatment. */}
      <div className="h-16 px-6 bg-bg-surface border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
            Secure mode
          </span>
          {!hasFocus && (
            <div className="px-2 py-1 bg-accent-critical/15 border border-accent-critical/30 rounded-[var(--radius-sm)] text-xs text-accent-critical font-semibold">
              ⚠ Return to fullscreen
            </div>
          )}
          {violationCount > 0 && (
            <span className="tnum text-xs text-accent-warning">
              {violationCount}/{violationLimit} warnings
            </span>
          )}
        </div>

        {/* Right cluster — the timer is the single most important glanceable
            element on this bar, so it gets the most visual weight: its own
            pill, larger type. The urgency cue is just that pill's background
            tinting amber/red as time runs low — no extra "time critical"
            label competing for attention next to it. */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border transition-colors duration-300",
              isCritical
                ? "bg-accent-critical/10 border-accent-critical/30"
                : "bg-bg-elevated border-border"
            )}
          >
            <Clock
              className={cn("w-4 h-4", isCritical ? "text-accent-critical" : "text-text-muted")}
              strokeWidth={1.75}
            />
            {secondsRemaining !== null && (
              <Timer
                seconds={secondsRemaining}
                size="lg"
                onExpire={handleTimerExpire}
                className="font-sans"
              />
            )}
          </div>
          <div className="h-6 w-px bg-border" aria-hidden="true" />
          <span className="tnum text-sm text-text-secondary font-medium">
            {currentIdx + 1} / {questions.length}
          </span>
        </div>
      </div>

      {/* Question tab strip — LeetCode-Contest-style horizontal navigator,
          reusing the exact browser-tab pattern already built for the
          student Task Progress strip (CodeEditor.jsx): active tab shares
          bg-bg-base with the panel below so it reads as physically attached,
          not a separate floating panel. Answered state is a small filled
          dot next to the label — self-evident without a separate legend.
          More tabs than fit at normal desktop width scroll horizontally
          (same as the Task strip) rather than wrapping — wrapping would
          push question content down and eat the vertical space this
          redesign is trying to reclaim, and a lab desktop-first exam
          realistically has a small, fixed question count per set. */}
      <div
        className="h-11 px-2 bg-bg-surface border-b border-border flex items-end gap-1 overflow-x-auto flex-shrink-0"
        role="tablist"
        aria-label="Exam questions"
      >
        {questions.map((q, idx) => {
          const isSelected = idx === currentIdx;
          const isAnswered =
            q.type === "mcq"
              ? mcqAnswers[q.id] !== undefined
              : (codeAnswers[q.id] || "").trim().length > 0;
          return (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`Question ${idx + 1}${isAnswered ? ", answered" : ", unanswered"}`}
              onClick={() => setCurrentIdx(idx)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-9 rounded-t-[var(--radius-md)] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-150",
                isSelected
                  ? "bg-bg-base text-text-primary"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
            >
              {isAnswered && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-success flex-shrink-0" aria-hidden="true" />
              )}
              <span className="max-w-[180px] truncate">
                Q{idx + 1}: {q.question_text}
              </span>
            </button>
          );
        })}
      </div>

      {/* Question panel — code questions get an independent-scroll two-column
          split (problem statement / editor+console); MCQ gets a narrower
          centered card, matching the two reference layouts respectively. */}
      <div className={cn("flex-1", !question || question.type === "mcq" ? "overflow-y-auto" : "overflow-hidden")}>
        {!question ? (
          <div className="max-w-3xl mx-auto p-10 space-y-8">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-14 flex-shrink-0 rounded-[var(--radius-sm)]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            </div>
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-md)]" />
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {question.type === "code" ? (() => {
              const isConsoleRow = consoleDockPosition === "left" || consoleDockPosition === "right";
              const consoleFirst = consoleDockPosition === "left" || consoleDockPosition === "top";
              const questionMax = () => (codeAreaRef.current?.clientWidth || 1200) * 0.5;
              const consoleMax = () =>
                isConsoleRow
                  ? (editorAreaRef.current?.clientWidth || 900) * 0.55
                  : (editorAreaRef.current?.clientHeight || 600) * 0.65;

              const DockIcon = { right: PanelRight, left: PanelLeft, top: PanelTop, bottom: PanelBottom }[consoleDockPosition];

              const editorBlock = (
                <div key="editor" className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-bg-surface">
                  {/* Toolbar — matches the Monaco toolbar convention used in
                      Task Assignment / Live Broadcast (language + Run). */}
                  <div className="h-11 px-4 flex items-center justify-between bg-bg-elevated border-b border-border flex-shrink-0">
                    <span className="text-xs text-text-secondary">
                      Language: <span className="text-text-primary font-medium capitalize">{question.language || "python"}</span>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleRunCode(question.id, question.language || "python")}
                      disabled={
                        isRunning[question.id] ||
                        pyodideLoading[question.id] ||
                        phase === "submitted" ||
                        phase === "locked"
                      }
                      className="bg-accent-success hover:bg-accent-success/90 text-white flex items-center gap-1.5 h-7 px-3 text-xs font-semibold"
                    >
                      {pyodideLoading[question.id] ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                          <span>Loading Pyodide...</span>
                        </>
                      ) : isRunning[question.id] ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Run Code</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex-1 min-h-0">
                    <Editor
                      height="100%"
                      language={question.language || "python"}
                      value={codeAnswers[question.id] ?? question.starter_code ?? ""}
                      onChange={(val) =>
                        setCodeAnswers((prev) => ({ ...prev, [question.id]: val || "" }))
                      }
                      theme="vs-dark"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        padding: { top: 12 },
                        automaticLayout: true,
                        readOnly: phase === "submitted" || phase === "locked",
                      }}
                    />
                  </div>

                  {/* Hidden Iframe for JS sandbox */}
                  {question.language === "javascript" && iframeSrcdoc[question.id] && (
                    <iframe
                      key={`${question.id}-${iframeKey[question.id] || 0}`}
                      srcDoc={iframeSrcdoc[question.id]}
                      style={{ width: 0, height: 0, border: 0, display: "none" }}
                    />
                  )}
                </div>
              );

              const consoleBlock = (
                <div
                  key="console"
                  style={isConsoleRow ? { width: consoleSize } : { height: consoleSize }}
                  className={cn(
                    "flex-shrink-0 flex flex-col overflow-hidden bg-bg-surface",
                    isConsoleRow
                      ? consoleFirst ? "border-r border-border" : "border-l border-border"
                      : consoleFirst ? "border-b border-border" : "border-t border-border"
                  )}
                >
                  <div className="h-9 px-3 flex items-center justify-between bg-bg-elevated border-b border-border flex-shrink-0 gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                      Console Output
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleClearOutput(question.id)}
                        className="text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded-[var(--radius-sm)] hover:bg-bg-surface-3 transition-colors flex items-center gap-1"
                        title="Clear console output"
                      >
                        <X className="w-3 h-3" strokeWidth={1.75} />
                        Clear
                      </button>
                      <div className="relative" ref={dockMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsDockMenuOpen((p) => !p)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] bg-bg-surface border border-border hover:border-border-hover hover:bg-bg-surface-3 transition-colors text-[11px] text-text-secondary whitespace-nowrap"
                          title="Dock position"
                          aria-haspopup="true"
                          aria-expanded={isDockMenuOpen}
                        >
                          <DockIcon className="w-3 h-3 text-accent-500" />
                          Dock {DOCK_OPTIONS.find((o) => o.value === consoleDockPosition)?.label}
                          <ChevronDown className="w-3 h-3 text-text-muted" />
                        </button>

                        {isDockMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-bg-elevated border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-modal)] z-50 py-1">
                            {DOCK_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setConsoleDockPosition(opt.value);
                                  setIsDockMenuOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-bg-surface-3 transition-colors",
                                  consoleDockPosition === opt.value ? "text-accent-500 font-semibold" : "text-text-primary"
                                )}
                              >
                                <opt.icon className="w-3.5 h-3.5" />
                                Dock {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <pre className="flex-1 overflow-y-auto text-xs text-text-primary whitespace-pre-wrap p-3 bg-bg-base">
                    {textOutput[question.id] || "(click Run to see output)"}
                  </pre>
                </div>
              );

              // Handle between editor and console — orientation follows the
              // dock's row/column split; sign follows which side of the
              // handle the console sits on, so dragging always feels like
              // dragging *the console's* edge regardless of dock position.
              const editorConsoleHandle = (
                <div
                  key="handle"
                  onMouseDown={(e) =>
                    startPanelResize(e, {
                      axis: isConsoleRow ? "x" : "y",
                      sign: consoleFirst ? 1 : -1,
                      size: consoleSize,
                      setSize: setConsoleSize,
                      min: isConsoleRow ? 240 : 120,
                      max: consoleMax(),
                    })
                  }
                  role="separator"
                  aria-orientation={isConsoleRow ? "vertical" : "horizontal"}
                  aria-label="Resize console panel"
                  className={cn(
                    "flex-shrink-0 hover:bg-accent-500/50 active:bg-accent-500 transition-colors",
                    isConsoleRow ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
                  )}
                />
              );

              return (
                <motion.div
                  key={question.id}
                  className="h-full flex flex-col"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div ref={codeAreaRef} className="flex-1 flex overflow-hidden min-h-0">
                    {/* Question panel — its own scroll region; Previous/Next
                        (or Submit on the last question) are scoped to this
                        panel's own width at its bottom edge, not floating
                        under the full-width layout. */}
                    <div style={{ width: questionPanelWidth }} className="flex-shrink-0 flex flex-col border-r border-border bg-bg-surface min-w-0">
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div className="flex items-center gap-2.5">
                          <Badge variant="info" className="tnum rounded-[var(--radius-sm)] px-2.5 py-1 text-sm font-semibold">
                            Q{currentIdx + 1}
                          </Badge>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                            Code
                          </span>
                        </div>
                        <h1 className="text-xl font-semibold tracking-tight text-text-primary leading-snug">
                          {question.question_text}
                        </h1>
                        {question.description && (
                          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                            {question.description}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 p-4 border-t border-border">
                        {navButtons}
                      </div>
                    </div>

                    {/* Handle: Question panel <-> editor area */}
                    <div
                      onMouseDown={(e) =>
                        startPanelResize(e, {
                          axis: "x",
                          sign: 1,
                          size: questionPanelWidth,
                          setSize: setQuestionPanelWidth,
                          min: 260,
                          max: questionMax(),
                        })
                      }
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize question panel"
                      className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-accent-500/50 active:bg-accent-500 transition-colors"
                    />

                    {/* Editor area: editor + console, order/orientation per dock */}
                    <div
                      ref={editorAreaRef}
                      className={cn("flex-1 min-w-0 min-h-0 flex overflow-hidden", isConsoleRow ? "flex-row" : "flex-col")}
                    >
                      {consoleFirst
                        ? [consoleBlock, editorConsoleHandle, editorBlock]
                        : [editorBlock, editorConsoleHandle, consoleBlock]}
                    </div>
                  </div>
                </motion.div>
              );
            })() : (
              <motion.div
                key={question.id}
                className="min-h-full flex items-center justify-center px-8 py-10"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                {/* MCQ — narrower centered card (question + options + nav all
                    inside one card), distinct from the full-width code split. */}
                <div className="w-full max-w-xl bg-bg-surface border border-border rounded-[var(--radius-lg)] p-6 space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Badge variant="info" className="tnum rounded-[var(--radius-sm)] px-2.5 py-1 text-sm font-semibold">
                        Q{currentIdx + 1}
                      </Badge>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Multiple Choice
                      </span>
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-text-primary leading-snug">
                      {question.question_text}
                    </h1>
                  </div>

                  <RadioGroup
                    value={
                      mcqAnswers[question.id] !== undefined
                        ? String(mcqAnswers[question.id])
                        : ""
                    }
                    onValueChange={(val) =>
                      setMcqAnswers((prev) => ({ ...prev, [question.id]: parseInt(val) }))
                    }
                    className="space-y-3"
                  >
                    {(question.options || []).map((opt, oi) => {
                      const isSelected = mcqAnswers[question.id] === oi;
                      return (
                        <Label
                          key={oi}
                          htmlFor={`q${question.id}-opt${oi}`}
                          className={cn(
                            "flex items-center gap-3.5 p-4 rounded-[var(--radius-md)] border cursor-pointer transition-colors duration-150",
                            isSelected
                              ? "bg-accent-500/10 border-accent-500/50"
                              : "bg-bg-base border-border hover:border-border-hover"
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 transition-colors duration-150",
                              isSelected
                                ? "bg-accent-700 text-white"
                                : "bg-bg-elevated border border-border text-text-muted"
                            )}
                          >
                            {["A", "B", "C", "D"][oi]}
                          </span>
                          <span className="flex-1 text-sm text-text-primary">{opt}</span>
                          <RadioGroupItem
                            value={String(oi)}
                            id={`q${question.id}-opt${oi}`}
                            className="size-[18px] shrink-0"
                          />
                        </Label>
                      );
                    })}
                  </RadioGroup>

                  {navButtons}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Re-enter fullscreen overlay (shown when fullscreen exits mid-exam) */}
      {!hasFocus && phase === "in_progress" && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Re-enter fullscreen to continue the exam"
          className="fixed inset-0 bg-bg-base/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset"
          style={{ cursor: "pointer" }}
          onClick={requestFullscreen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              requestFullscreen();
            }
          }}
        >
          <div className="w-16 h-16 rounded-full bg-accent-warning/10 border-2 border-accent-warning/30 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-accent-warning" strokeWidth={1.75} />
          </div>
          <p className="text-text-primary font-semibold">Fullscreen required</p>
          <p className="text-text-secondary text-sm">
            Click anywhere to re-enter fullscreen and continue
          </p>
          {violationCount > 0 && (
            <p className="tnum text-accent-warning text-xs">
              {violationCount}/{violationLimit} warnings used
            </p>
          )}
        </div>
      )}

      {/* Submit confirmation — our own dialog, not the browser's native
          window.confirm, so it matches the app's dark theme/typography
          instead of an unstyled OS alert. */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        {/* Portalled into the same element that goes fullscreen (containerRef) —
            a dialog portalled to document.body by default is outside the
            Fullscreen API's painted subtree and never actually appears on
            screen while the exam is in fullscreen. */}
        <AlertDialogContent
          container={containerRef.current}
          className="bg-bg-surface border-border text-text-primary sm:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              Submit your exam?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This cannot be undone. You won't be able to change any answers after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-text-secondary hover:bg-bg-elevated bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSubmitConfirm(false);
                handleSubmit();
              }}
              disabled={submitting}
              className="bg-accent-success hover:bg-accent-success/90 text-white border-0"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.75} />
              ) : null}
              Submit Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
