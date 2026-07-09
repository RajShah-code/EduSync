import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import { getSocket } from "../../store/socket";
import { useFocusGuard } from "../../hooks/useFocusGuard";
import { Timer } from "../../components/Timer";
import { ExamLocked } from "./ExamLocked";
import Editor from "@monaco-editor/react";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import {
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

// Phase state machine
// 'waiting'    — holding screen before exam:start arrives
// 'in_progress'— active exam UI
// 'submitted'  — student manually submitted
// 'locked'     — exam:force_lock received OR violation_limit reached

export function ExamScreen() {
  const { examId } = useParams();

  const [phase, setPhase] = useState("waiting");

  // Data received with exam:start
  const [examMeta, setExamMeta] = useState(null); // { examId, setNumber, timeLimitMinutes, serverStartTimestamp }
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Answer state
  const [mcqAnswers, setMcqAnswers] = useState({}); // question_id -> selected_option (int index)
  const [codeAnswers, setCodeAnswers] = useState({}); // question_id -> code string

  // UI state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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
        const res = await fetch(`http://localhost:3000/exams/${examId}/violation`, {
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
        const res = await fetch(`http://localhost:3000/exams/${examId}/my-questions`, {
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
        const res = await fetch(`http://localhost:3000/exams/${payload.examId}/my-questions`, {
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

  // ── Enter fullscreen on transition to in_progress ──────────────────────────
  useEffect(() => {
    if (phase === "in_progress") {
      hasEnteredFullscreenRef.current = false; // reset for new exam
      requestFullscreen();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit exam ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!window.confirm("Submit your exam? This cannot be undone.")) return;
    setSubmitting(true);

    const answers = questions.map((q) => ({
      questionId: q.id,
      ...(q.type === "mcq" ? { selectedOption: mcqAnswers[q.id] ?? null } : {}),
      ...(q.type === "code" ? { codeAnswer: codeAnswers[q.id] ?? "" } : {}),
    }));

    try {
      const res = await fetch(`http://localhost:3000/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        setPhase("submitted");
        // Exit fullscreen gracefully
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
            <FileText className="w-8 h-8 text-accent-success" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-2">Exam Submitted</h1>
            <p className="text-text-secondary text-sm">
              Your answers have been recorded. Results will be available after grading.
            </p>
          </div>
          <div className="p-4 bg-bg-surface border border-border rounded-lg text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-text-secondary">Questions Answered</span>
              <span className="font-mono text-text-primary">
                {answeredCount} / {questions.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Submitted At</span>
              <span className="font-mono text-text-primary">
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
          <Loader2 className="w-8 h-8 text-accent-info animate-spin" />
        ) : (
          <ShieldCheck className="w-12 h-12 text-accent-info" />
        )}
        <h1 className="text-xl font-semibold text-text-primary">
          {loadingQuestions ? "Loading exam..." : "Waiting for exam to begin"}
        </h1>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          {loadingQuestions
            ? "Fetching your question set..."
            : "Your teacher will start the exam shortly. Stay on this page. Do not switch tabs or exit fullscreen once the exam begins."}
        </p>
        <div className="mt-4 p-3 bg-bg-surface border border-border rounded-lg flex items-center gap-2 text-xs text-text-muted">
          <Clock className="w-4 h-4" />
          <span>Exam ID: {examId}</span>
        </div>
      </div>
    );
  }

  // ── Phase: in_progress ──────────────────────────────────────────────────────
  const question = questions[currentIdx];
  const isCritical = secondsRemaining !== null && secondsRemaining < 300;
  const mcqAnsweredCount = Object.keys(mcqAnswers).length;
  const codeAnsweredCount = Object.keys(codeAnswers).filter(
    (k) => (codeAnswers[k] || "").trim().length > 0
  ).length;
  const totalAnswered = mcqAnsweredCount + codeAnsweredCount;

  return (
    <div ref={containerRef} className="h-screen flex flex-col bg-bg-base">
      {/* Top bar */}
      <div
        className={`h-14 px-6 border-b flex items-center justify-between flex-shrink-0 transition-colors ${
          isCritical
            ? "bg-accent-critical/10 border-accent-critical/20"
            : "bg-bg-surface border-border"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-accent-locked/10 border border-accent-locked/20 rounded-sm">
            <span className="text-xs font-mono text-accent-locked">⊘ SECURE MODE</span>
          </div>
          {!hasFocus && (
            <div className="px-2 py-1 bg-accent-critical/15 border border-accent-critical/30 rounded text-xs text-accent-critical font-semibold">
              ⚠ Return to fullscreen
            </div>
          )}
          {violationCount > 0 && (
            <span className="text-xs font-mono text-accent-warning">
              {violationCount}/{violationLimit} warnings
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {isCritical && (
            <span className="text-xs font-semibold text-accent-critical animate-pulse">
              TIME CRITICAL
            </span>
          )}
          {secondsRemaining !== null && (
            <Timer seconds={secondsRemaining} size="lg" onExpire={handleTimerExpire} />
          )}
          <span className="text-sm font-mono text-text-secondary">
            {currentIdx + 1} / {questions.length}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-8">
          {!question ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Question header */}
              <div className="flex items-start gap-3">
                <span className="px-3 py-1.5 bg-accent-info/10 border border-accent-info/20 rounded font-mono text-sm text-accent-info flex-shrink-0">
                  Q{currentIdx + 1}
                </span>
                <div>
                  <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                    {question.type === "mcq" ? "Multiple Choice" : "Code"}
                  </div>
                  <div className="text-lg font-medium text-text-primary">
                    {question.question_text}
                  </div>
                </div>
              </div>

              {/* MCQ options */}
              {question.type === "mcq" && (
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
                      <div
                        key={oi}
                        className={`relative flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-accent-info/10 border-accent-info/50"
                            : "bg-bg-surface border-border hover:border-accent-info/30"
                        }`}
                      >
                        <RadioGroupItem
                          value={String(oi)}
                          id={`q${question.id}-opt${oi}`}
                        />
                        <Label
                          htmlFor={`q${question.id}-opt${oi}`}
                          className="flex-1 text-sm text-text-primary cursor-pointer"
                        >
                          <span className="font-mono text-text-muted mr-2">
                            {["A", "B", "C", "D"][oi]}.
                          </span>
                          {opt}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}

              {/* Code editor */}
              {question.type === "code" && (
                <div className="border border-border rounded-lg overflow-hidden" style={{ height: 400 }}>
                  <Editor
                    height="400px"
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
                    }}
                  />
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIdx((i) => i - 1)}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>

                {currentIdx < questions.length - 1 ? (
                  <Button
                    onClick={() => setCurrentIdx((i) => i + 1)}
                    className="bg-accent-info hover:bg-accent-info/90"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-accent-success hover:bg-accent-success/90"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Submit Exam
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: question navigator */}
        <div className="w-56 border-l border-border bg-bg-surface overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Navigator
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const isAnswered =
                  q.type === "mcq"
                    ? mcqAnswers[q.id] !== undefined
                    : (codeAnswers[q.id] || "").trim().length > 0;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-mono transition-all ${
                      isCurrent
                        ? "bg-accent-info text-white"
                        : isAnswered
                        ? "bg-accent-success/20 border border-accent-success/50 text-accent-success"
                        : "bg-bg-base border border-border text-text-muted hover:border-accent-info/40"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-accent-info" />
                <span className="text-text-secondary">Current</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-accent-success/20 border border-accent-success/50" />
                <span className="text-text-secondary">Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-bg-base border border-border" />
                <span className="text-text-secondary">Unanswered</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border text-xs text-text-muted">
              <div className="flex justify-between">
                <span>Answered</span>
                <span className="font-mono text-text-primary">
                  {totalAnswered}/{questions.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Re-enter fullscreen overlay (shown when fullscreen exits mid-exam) */}
      {!hasFocus && phase === "in_progress" && (
        <div
          className="fixed inset-0 bg-bg-base/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4"
          style={{ cursor: "pointer" }}
          onClick={requestFullscreen}
        >
          <div className="w-16 h-16 rounded-full bg-accent-warning/10 border-2 border-accent-warning/30 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-accent-warning" />
          </div>
          <p className="text-text-primary font-semibold">Fullscreen required</p>
          <p className="text-text-secondary text-sm">
            Click anywhere to re-enter fullscreen and continue
          </p>
          {violationCount > 0 && (
            <p className="text-accent-warning text-xs font-mono">
              {violationCount}/{violationLimit} warnings used
            </p>
          )}
        </div>
      )}
    </div>
  );
}
