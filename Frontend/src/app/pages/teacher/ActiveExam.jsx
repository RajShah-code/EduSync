import { Timer } from "../../components/Timer";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { AlertTriangle, Plus, Lock, Pause, FileText } from "lucide-react";

// Mock data cleared - empty states shown
const mockStudents = [];
const warnings = [];

export function ActiveExam() {
  const submitted = mockStudents.filter((s) => s.status === "submitted").length;
  const total = mockStudents.length;

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Top Control Bar */}
      <div className="px-6 py-4 border-b border-border bg-bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              Active Exam Monitor
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Monitor active exams in real-time
            </p>
          </div>

          {mockStudents.length > 0 && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-xs text-text-secondary mb-1">
                  TIME REMAINING
                </div>
                <Timer seconds={1847} size="lg" />
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="text-xs text-text-secondary mb-1">
                  SUBMITTED
                </div>
                <div className="text-xl font-mono font-semibold text-text-primary">
                  {submitted} / {total}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons (only if exam active) */}
        {mockStudents.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="border-accent-warning text-accent-warning hover:bg-accent-warning/10"
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause Exam
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-accent-info text-accent-info hover:bg-accent-info/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              +5 min
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-accent-info text-accent-info hover:bg-accent-info/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              +10 min
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-accent-locked text-accent-locked hover:bg-accent-locked/10"
            >
              <Lock className="w-4 h-4 mr-2" />
              Lock All Screens
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-accent-critical text-accent-critical hover:bg-accent-critical/10"
            >
              End Exam
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {mockStudents.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText className="w-12 h-12 text-text-muted" />
            <h3 className="text-base font-medium text-text-primary">
              No active exam session
            </h3>
            <p className="text-sm text-text-secondary">
              No students are currently taking an exam.
            </p>
          </div>
        ) : (
          <>
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="p-4 bg-accent-critical/10 border border-accent-critical/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-accent-critical" />
                  <h3 className="font-semibold text-accent-critical">
                    Suspicious Activity Detected
                  </h3>
                </div>
                <div className="space-y-2">
                  {warnings.map((warning) => (
                    <div
                      key={warning.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <span className="text-text-primary font-medium">
                          {warning.studentName}
                        </span>
                        <span className="text-text-secondary mx-2">—</span>
                        <span className="text-text-secondary">
                          {warning.event}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-text-muted">
                        {warning.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Student Progress Grid */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Student Progress
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {mockStudents.map((student) => (
                  <div
                    key={student.id}
                    className={`p-4 bg-bg-surface border rounded-lg ${
                      student.warnings > 0
                        ? "border-accent-critical"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-text-primary text-sm">
                          {student.name}
                        </div>
                      </div>
                      <StatusBadge status={student.status} />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex-1 h-1.5 bg-bg-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-info"
                          style={{
                            width: `${
                              (student.questionsAnswered /
                                student.totalQuestions) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-text-secondary">
                        {student.questionsAnswered}/{student.totalQuestions}
                      </span>
                    </div>
                    {student.warnings > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-accent-critical">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{student.warnings} warning(s)</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
