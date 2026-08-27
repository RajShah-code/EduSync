import { IconShieldOff as ShieldOff } from "@tabler/icons-react";
import { StatusBadge } from "../../components/StatusBadge";

const REASON_LABELS = {
  violation_limit_reached: "Access revoked — violation limit exceeded",
  time_expired: "Time has expired",
  teacher_ended: "Exam ended by instructor",
};

/**
 * ExamLocked
 *
 * Terminal locked-out state. Rendered by ExamScreen when:
 *   - exam:force_lock is received from server (violation limit OR timer expiry)
 *
 * Props:
 *   examTitle      — string: name of the exam
 *   submittedAt    — Date: timestamp of submission/lock
 *   reason         — string: 'violation_limit_reached' | 'time_expired' | 'teacher_ended'
 *   violationCount — number: how many violations were recorded
 *   questionCount  — number: total questions in the set
 *   answeredCount  — number: questions answered before lock
 */
export function ExamLocked({
  examTitle = "Exam",
  submittedAt,
  reason = "time_expired",
  violationCount,
  questionCount,
  answeredCount,
}) {
  const reasonLabel = REASON_LABELS[reason] ?? "Exam closed";
  const lockedTime = submittedAt
    ? new Date(submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="h-screen bg-bg-base flex items-center justify-center p-6">
      <div className="page-enter max-w-md w-full text-center space-y-6">
        {/* Lock Icon */}
        <div className="w-20 h-20 mx-auto rounded-full bg-accent-locked/10 border-2 border-accent-locked/30 flex items-center justify-center">
          <ShieldOff className="w-10 h-10 text-accent-locked" strokeWidth={1.75} />
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-3xl font-semibold text-text-primary mb-2">EXAM CLOSED</h1>
          <p className="text-text-secondary text-sm">{reasonLabel}</p>
        </div>

        {/* Details card */}
        <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Exam</span>
              <span className="font-medium text-text-primary">{examTitle}</span>
            </div>
            {answeredCount !== undefined && questionCount !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Questions Answered</span>
                <span className="tnum font-medium text-text-primary">
                  {answeredCount} / {questionCount}
                </span>
              </div>
            )}
            {violationCount !== undefined && violationCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Violations</span>
                <span className="tnum font-medium text-accent-warning">
                  {violationCount}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Locked At</span>
              <span className="tnum font-medium text-text-primary">{lockedTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Status</span>
              <StatusBadge status="locked" />
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="p-4 bg-accent-info/5 border border-accent-info/15 rounded-[var(--radius-md)]">
          <p className="text-sm text-text-primary">
            Your responses have been automatically saved and submitted. Results will be
            available once grading is complete.
          </p>
        </div>
      </div>
    </div>
  );
}
