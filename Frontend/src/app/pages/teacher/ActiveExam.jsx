import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { getSocket } from "../../store/socket";
import { StatusBadge } from "../../components/StatusBadge";
import { Timer } from "../../components/Timer";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
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
import {
  AlertTriangle,
  Lock,
  FileText,
  Loader2,
  Users,
  ChevronRight,
  X,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "../../components/ui/skeleton";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "submitted", label: "Submitted" },
  { key: "locked", label: "Locked" },
];

const CARD_BADGE_STATUS = {
  in_progress: "in-progress",
  submitted: "submitted",
  locked: "locked",
};

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// One card, exactly one status — mirrors the TaskStudentCard pattern built
// for Task Assignment's live roster (identity row / status row / activity
// row), adapted for exam-attempt data instead of task-submission data.
function ExamStudentCard({ attempt, violationLimit, onClick }) {
  const answeredCount = attempt.answers?.length ?? 0;
  const hasViolations = attempt.violation_count > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Review ${attempt.student_name} — ${attempt.status.replace("_", " ")}`}
      className={cn(
        "flex flex-col gap-4 p-5 bg-bg-surface border rounded-[var(--radius-lg)] card-hover h-full cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
        attempt.status === "locked"
          ? "border-accent-locked/40"
          : hasViolations
          ? "border-accent-critical/30"
          : "border-border"
      )}
    >
      {/* Identity row */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-xs font-semibold text-text-secondary flex-shrink-0">
          {initialsOf(attempt.student_name)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate leading-tight" title={attempt.student_name}>
            {attempt.student_name}
          </div>
          <div className="text-[11px] text-text-muted tnum mt-0.5">
            {attempt.roll_no ? `Roll ${attempt.roll_no}` : "—"} · Set {attempt.set_number}
          </div>
        </div>
      </div>

      {/* Status row */}
      <div>
        <StatusBadge status={CARD_BADGE_STATUS[attempt.status] || "pending"} />
      </div>

      {/* Activity row — answered count + violation flag */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-border/60">
        <span className="text-[11px] text-text-secondary tnum">{answeredCount} answered</span>
        {hasViolations && (
          <span className="flex items-center gap-1 text-[11px] text-accent-critical flex-shrink-0">
            <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
            <span className="tnum">{attempt.violation_count}/{violationLimit}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Attempt detail modal — same shell language as the app's other status
// modals (fixed backdrop, centered bg-bg-elevated panel, motion enter/exit
// gated by prefers-reduced-motion): a focused read-only view of one
// student's live exam attempt. No grading here — that's ExamResults.jsx,
// post-submission, respecting the same scope boundary the live pages
// (Live Broadcast, Task Assignment) already keep between "monitor" and
// "grade" views. ──
function AttemptDetailModal({ attempt, violationLimit, onClose }) {
  const prefersReducedMotion = useReducedMotion();
  const transition = { duration: prefersReducedMotion ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] };

  return (
    <AnimatePresence>
      {attempt && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${attempt.student_name} — exam attempt`}
            className="relative w-full max-w-md bg-bg-elevated border border-border rounded-[var(--radius-lg)] overflow-hidden"
            style={{ boxShadow: "var(--shadow-modal)" }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={transition}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-xs font-semibold text-text-secondary flex-shrink-0">
                  {initialsOf(attempt.student_name)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{attempt.student_name}</div>
                  <div className="text-[11px] text-text-muted tnum mt-0.5">
                    {attempt.roll_no ? `Roll ${attempt.roll_no}` : "—"} · Set {attempt.set_number}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Status</span>
                <StatusBadge status={CARD_BADGE_STATUS[attempt.status] || "pending"} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Questions Answered</span>
                <span className="tnum text-sm text-text-primary font-medium">
                  {attempt.answers?.length ?? 0}
                </span>
              </div>
              {attempt.started_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Started</span>
                  <span className="tnum text-sm text-text-primary">
                    {new Date(attempt.started_at).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {attempt.submitted_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Submitted</span>
                  <span className="tnum text-sm text-text-primary">
                    {new Date(attempt.submitted_at).toLocaleTimeString()}
                  </span>
                </div>
              )}

              <div
                className={cn(
                  "flex items-center justify-between p-3 rounded-[var(--radius-md)] border",
                  attempt.violation_count > 0
                    ? "bg-accent-critical/10 border-accent-critical/25"
                    : "bg-bg-surface border-border"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <AlertTriangle
                    className={cn("w-3.5 h-3.5", attempt.violation_count > 0 ? "text-accent-critical" : "text-text-muted")}
                    strokeWidth={1.75}
                  />
                  Violations
                </span>
                <span className={cn("tnum text-sm font-semibold", attempt.violation_count > 0 ? "text-accent-critical" : "text-text-primary")}>
                  {attempt.violation_count ?? 0} / {violationLimit}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ActiveExam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const [exam, setExam] = useState(null);
  const [studentAttempts, setStudentAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAttempt, setSelectedAttempt] = useState(null);

  // Seconds remaining — derived from server-side start + time_limit
  const [secondsRemaining, setSecondsRemaining] = useState(null);

  const token = localStorage.getItem("edusync_token");

  // ── Fetch exam data ─────────────────────────────────────────────────────────
  const fetchExamData = async () => {
    try {
      const [examRes, resultsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/exams/${examId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/exams/${examId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (examRes.ok) {
        const { exam: examData } = await examRes.json();
        setExam(examData);

        // Compute time remaining from server-authoritative start time
        // We use the started_at of the first in_progress or submitted attempt
        // as a proxy for when the exam clock started.
        // The exam table doesn't store started_at — it's on the attempts.
      }

      if (resultsRes.ok) {
        const { results } = await resultsRes.json();
        setStudentAttempts(results || []);
      }
    } catch (err) {
      console.error("[ActiveExam] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExamData();
    // Poll every 30s so submission counts stay roughly current without websocket overhead
    const interval = setInterval(fetchExamData, 30_000);
    return () => clearInterval(interval);
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compute time remaining from attempts' started_at ───────────────────────
  useEffect(() => {
    if (!exam || !studentAttempts.length) return;
    const firstStarted = studentAttempts.find((a) => a.started_at)?.started_at;
    if (!firstStarted || !exam.time_limit_minutes) return;

    const expiresAt = new Date(firstStarted).getTime() + exam.time_limit_minutes * 60 * 1000;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateRemaining();
    const iv = setInterval(updateRemaining, 1000);
    return () => clearInterval(iv);
  }, [exam, studentAttempts]);

  // ── Socket listeners: violation warnings + force lock updates ──────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleViolationWarning = ({ examId: eId, violationCount, violationLimit }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      toast.warning(`Violation warning — ${violationCount}/${violationLimit}`, { duration: 3000 });
      // Refresh to pick up updated violation count
      fetchExamData();
    };

    const handleForceLock = ({ examId: eId }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      fetchExamData();
    };

    const handleStudentJoinedWaiting = ({ examId: eId, studentName }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      toast.info(`${studentName || 'A student'} joined the waiting room`);
      fetchExamData();
    };

    const handleStudentSubmitted = ({ examId: eId, studentName }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      toast.success(`${studentName || 'A student'} submitted the exam`);
      fetchExamData();
    };

    socket.on("exam:violation_warning", handleViolationWarning);
    socket.on("exam:force_lock", handleForceLock);
    socket.on("exam:student_joined_waiting", handleStudentJoinedWaiting);
    socket.on("exam:student_submitted", handleStudentSubmitted);

    return () => {
      socket.off("exam:violation_warning", handleViolationWarning);
      socket.off("exam:force_lock", handleForceLock);
      socket.off("exam:student_joined_waiting", handleStudentJoinedWaiting);
      socket.off("exam:student_submitted", handleStudentSubmitted);
    };
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── End exam early ──────────────────────────────────────────────────────────
  const handleEndExam = async () => {
    setShowEndConfirm(false);
    setEnding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Exam ended — all students locked out");
        navigate(`/teacher/exam/results/${examId}`);
      } else {
        const data = await res.json();
        toast.error(data.message);
      }
    } catch {
      toast.error("Failed to end exam");
    } finally {
      setEnding(false);
    }
  };

  const submitted = studentAttempts.filter(
    (a) => a.status === "submitted" || a.status === "locked"
  ).length;
  const total = studentAttempts.length;
  const violations = studentAttempts.filter((a) => a.violation_count > 0);

  const filterCounts = {
    all: total,
    in_progress: studentAttempts.filter((a) => a.status === "in_progress").length,
    submitted: studentAttempts.filter((a) => a.status === "submitted").length,
    locked: studentAttempts.filter((a) => a.status === "locked").length,
  };
  const filteredAttempts =
    statusFilter === "all" ? studentAttempts : studentAttempts.filter((a) => a.status === statusFilter);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-bg-base overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-bg-surface flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="flex items-center gap-6">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <Skeleton className="h-4 w-32 mb-3" />
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-5 bg-bg-surface border border-border rounded-[var(--radius-lg)] space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <FileText className="w-12 h-12 text-text-muted" strokeWidth={1.75} />
        <p className="text-base font-medium text-text-primary">Exam not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-border bg-bg-surface flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{exam.title}</h1>
            <p className="text-[11px] text-text-muted tnum mt-0.5 uppercase tracking-[0.08em]">
              {exam.question_type} · {exam.num_sets} set(s) · {exam.time_limit_minutes} min ·
              limit {exam.violation_limit} violation(s)
            </p>
          </div>

          <div className="flex items-center gap-5">
            {secondsRemaining !== null && (
              <div className="flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border border-border bg-bg-elevated">
                <Clock className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
                <Timer seconds={secondsRemaining} size="lg" className="font-sans" />
              </div>
            )}
            <div className="text-center">
              <div className="text-[10px] text-text-muted mb-0.5 uppercase tracking-[0.08em]">
                Submitted
              </div>
              <div className="text-lg tnum font-semibold text-text-primary leading-none">
                {submitted} / {total}
              </div>
            </div>
            <div className="h-8 w-px bg-border" aria-hidden="true" />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-accent-locked/50 text-accent-locked hover:bg-accent-locked/10"
                onClick={() => setShowEndConfirm(true)}
                disabled={ending}
              >
                {ending ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Lock className="w-4 h-4" strokeWidth={1.75} />
                )}
                End Exam
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/teacher/exam/results/${examId}`)}
              >
                Results
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Violation summary */}
        {violations.length > 0 && (
          <div className="p-4 bg-accent-critical/5 border border-accent-critical/20 rounded-[var(--radius-lg)]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-accent-critical" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold text-accent-critical">
                {violations.length} student{violations.length === 1 ? "" : "s"} with violations
              </h3>
            </div>
            <div className="space-y-1">
              {violations.map((a) => (
                <div key={a.attempt_id} className="flex items-center justify-between text-xs">
                  <span className="text-text-primary font-medium">{a.student_name}</span>
                  <span className="tnum text-accent-critical">
                    {a.violation_count} / {exam.violation_limit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Student roster */}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users className="w-12 h-12 text-text-muted" strokeWidth={1.75} />
            <p className="text-base font-medium text-text-primary">
              No students have started yet
            </p>
            <p className="text-sm text-text-secondary">
              Students will appear here once the exam is delivered.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter bar — same chip-with-count pattern used for Task
                Assignment's live roster filter, reused here since it's the
                same underlying use case: filtering a status-driven card grid. */}
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter students by status">
              {FILTERS.map((f) => {
                const isActiveFilter = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={isActiveFilter}
                    onClick={() => setStatusFilter(f.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-[var(--radius-pill)] border text-xs font-semibold transition-colors duration-150",
                      isActiveFilter
                        ? "bg-accent-500/15 border-accent-500/30 text-accent-500"
                        : "bg-transparent border-border text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary"
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "tnum text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-[var(--radius-sm)]",
                        isActiveFilter ? "bg-accent-500/20" : "bg-bg-surface-3 text-text-muted"
                      )}
                    >
                      {filterCounts[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={statusFilter}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                {filteredAttempts.length > 0 ? (
                  <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                    {filteredAttempts.map((attempt) => (
                      <ExamStudentCard
                        key={attempt.attempt_id}
                        attempt={attempt}
                        violationLimit={exam.violation_limit}
                        onClick={() => setSelectedAttempt(attempt)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-text-muted italic bg-bg-surface border border-border rounded-[var(--radius-lg)]">
                    No students match this filter.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      <AttemptDetailModal
        attempt={selectedAttempt}
        violationLimit={exam.violation_limit}
        onClose={() => setSelectedAttempt(null)}
      />

      {/* ── End Exam Confirmation ────────────────────────────────────────────── */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              End the exam for all students now?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This cannot be undone. All students will be locked out immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-text-secondary hover:bg-bg-elevated bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndExam}
              className="bg-accent-critical hover:bg-accent-critical/90 text-white border-0"
            >
              End Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
