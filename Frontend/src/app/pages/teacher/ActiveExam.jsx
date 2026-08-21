import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { getSocket } from "../../store/socket";
import { StatusBadge } from "../../components/StatusBadge";
import { Timer } from "../../components/Timer";
import { Button } from "../../components/ui/button";
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
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "../../components/ui/skeleton";

export function ActiveExam() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [studentAttempts, setStudentAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

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

    const handleViolationWarning = ({ examId: eId, violationCount, violationLimit, ...rest }) => {
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

  const getStatusBadgeKey = (status) => {
    if (status === "submitted") return "submitted";
    if (status === "locked") return "locked";
    if (status === "in_progress") return "in-progress";
    return "pending";
  };

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
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-1 w-full rounded-full" />
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
        <FileText className="w-12 h-12 text-text-muted" />
        <p className="text-base font-medium text-text-primary">Exam not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      {/* Top control bar */}
      <div className="px-6 py-4 border-b border-border bg-bg-surface flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{exam.title}</h1>
            <p className="text-xs text-text-muted font-mono mt-0.5 uppercase tracking-wider">
              {exam.question_type} · {exam.num_sets} set(s) · {exam.time_limit_minutes} min ·
              limit {exam.violation_limit} violation(s)
            </p>
          </div>

          <div className="flex items-center gap-6">
            {secondsRemaining !== null && (
              <div className="text-center">
                <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
                  Time Remaining
                </div>
                <Timer seconds={secondsRemaining} size="lg" />
              </div>
            )}
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
                Submitted
              </div>
              <div className="text-xl font-mono font-semibold text-text-primary">
                {submitted} / {total}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-accent-locked text-accent-locked hover:bg-accent-locked/10"
                onClick={() => setShowEndConfirm(true)}
                disabled={ending}
              >
                {ending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                End Exam
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/teacher/exam/results/${examId}`)}
              >
                Results
                <ChevronRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Violation summary */}
        {violations.length > 0 && (
          <div className="p-4 bg-accent-critical/5 border border-accent-critical/20 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-accent-critical" />
              <h3 className="text-sm font-semibold text-accent-critical">
                {violations.length} student(s) with violations
              </h3>
            </div>
            <div className="space-y-1">
              {violations.map((a) => (
                <div key={a.attempt_id} className="flex items-center justify-between text-xs">
                  <span className="text-text-primary font-medium">{a.student_name}</span>
                  <span className="font-mono text-accent-critical">
                    {a.violation_count} / {exam.violation_limit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Student grid */}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users className="w-12 h-12 text-text-muted" />
            <p className="text-base font-medium text-text-primary">
              No students have started yet
            </p>
            <p className="text-sm text-text-secondary">
              Students will appear here once the exam is delivered.
            </p>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Student Progress</h3>
            <div className="grid grid-cols-3 gap-3">
              {studentAttempts.map((attempt) => {
                const answeredCount = attempt.answers?.length ?? 0;
                const hasViolations = attempt.violation_count > 0;

                return (
                  <div
                    key={attempt.attempt_id}
                    className={`p-4 bg-bg-surface border rounded-lg ${
                      attempt.status === "locked"
                        ? "border-accent-locked/40"
                        : hasViolations
                        ? "border-accent-critical/30"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-text-primary text-sm">
                          {attempt.student_name}
                        </div>
                        <div className="text-xs text-text-muted font-mono mt-0.5">
                          {attempt.roll_no ? `Roll ${attempt.roll_no}` : ""} · Set{" "}
                          {attempt.set_number}
                        </div>
                      </div>
                      <StatusBadge status={getStatusBadgeKey(attempt.status)} />
                    </div>

                    <div className="flex items-center gap-2 text-xs mt-2">
                      <div className="flex-1 h-1 bg-bg-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-info transition-all"
                          style={{ width: `${Math.min(100, (answeredCount / Math.max(1, attempt.answers?.length || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-text-muted">{answeredCount} ans</span>
                    </div>

                    {hasViolations && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-accent-critical">
                        <AlertTriangle className="w-3 h-3" />
                        <span>
                          {attempt.violation_count}/{exam.violation_limit} violations
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
