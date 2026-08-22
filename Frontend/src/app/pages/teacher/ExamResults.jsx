import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  FileText,
  Loader2,
  ChevronDown,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import PageShell from "../../components/PageShell";

export function ExamResults() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAttempt, setExpandedAttempt] = useState(null);
  const [scoreDrafts, setScoreDrafts] = useState({}); // answerId -> score string
  const [savingScore, setSavingScore] = useState(null); // answerId being saved

  const token = localStorage.getItem("edusync_token");

  const fetchResults = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExam(data.exam);
        setResults(data.results || []);
      }
    } catch (err) {
      console.error("[ExamResults] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResults(); }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveScore = async (answerId) => {
    const score = scoreDrafts[answerId];
    if (score === undefined || score === "") return;
    setSavingScore(answerId);
    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/answers/${answerId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ score: parseFloat(score) }),
      });
      if (res.ok) {
        toast.success("Score saved");
        // Update local state without full refetch
        setResults((prev) =>
          prev.map((attempt) => ({
            ...attempt,
            answers: attempt.answers.map((ans) =>
              ans.answer_id === answerId
                ? { ...ans, score: parseFloat(score) }
                : ans
            ),
          }))
        );
        setScoreDrafts((prev) => {
          const next = { ...prev };
          delete next[answerId];
          return next;
        });
      } else {
        const data = await res.json();
        toast.error(data.message);
      }
    } catch {
      toast.error("Failed to save score");
    } finally {
      setSavingScore(null);
    }
  };

  const getStatusKey = (status) => {
    if (status === "submitted") return "submitted";
    if (status === "locked") return "locked";
    if (status === "in_progress") return "in-progress";
    return "pending";
  };

  const totalScore = (attempt) =>
    attempt.answers.reduce((sum, a) => sum + Number(a.score ?? 0), 0);

  if (loading) {
    return (
      <PageShell>
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-bg-surface border border-border rounded-lg space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border rounded-lg">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
      </PageShell>
    );
  }

  if (!exam) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-20 gap-3">
        <FileText className="w-12 h-12 text-text-muted" />
        <p className="text-base font-medium text-text-primary">Exam not found</p>
      </div>
    );
  }

  return (
    <PageShell>
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Exam Results</h1>
          <p className="text-sm text-text-secondary">
            {exam.title} · {exam.question_type.toUpperCase()} · {exam.num_sets} set(s) ·{" "}
            {exam.time_limit_minutes} min
          </p>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Students", value: results.length },
            {
              label: "Submitted",
              value: results.filter((r) => r.status === "submitted" || r.status === "locked")
                .length,
            },
            {
              label: "Auto-submitted",
              value: results.filter((r) => r.auto_submitted).length,
            },
            {
              label: "Violations",
              value: results.reduce((sum, r) => sum + (r.violation_count ?? 0), 0),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="p-4 bg-bg-surface border border-border rounded-lg"
            >
              <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
              <div className="text-2xl tnum font-semibold text-text-primary">{value}</div>
            </div>
          ))}
        </div>

        {/* Results list */}
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-12 h-12 text-text-muted" />
            <p className="text-base font-medium text-text-primary">No attempts yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((attempt) => {
              const isExpanded = expandedAttempt === attempt.attempt_id;
              const score = totalScore(attempt);
              const hasCodeAnswers = attempt.answers.some((a) => a.type === "code");

              return (
                <div
                  key={attempt.attempt_id}
                  className="bg-bg-surface border border-border rounded-lg overflow-hidden"
                >
                  {/* Collapsed row */}
                  <button
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-bg-base/50 transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.995] text-left"
                    onClick={() =>
                      setExpandedAttempt(isExpanded ? null : attempt.attempt_id)
                    }
                  >
                    <div className="flex-1 flex items-center gap-4">
                      <div>
                        <div className="font-medium text-text-primary text-sm">
                          {attempt.student_name}
                        </div>
                        <div className="text-xs text-text-muted tnum">
                          {attempt.roll_no ? `Roll ${attempt.roll_no}` : ""} · Set{" "}
                          {attempt.set_number}
                        </div>
                      </div>
                      <StatusBadge status={getStatusKey(attempt.status)} />
                      {attempt.auto_submitted && (
                        <span className="text-xs tnum px-2 py-0.5 bg-accent-warning/10 text-accent-warning border border-accent-warning/20 rounded">
                          auto-submitted
                        </span>
                      )}
                      {attempt.violation_count > 0 && (
                        <span className="text-xs tnum px-2 py-0.5 bg-accent-critical/10 text-accent-critical border border-accent-critical/20 rounded">
                          {attempt.violation_count} violation(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-text-muted">Score</div>
                        <div className="tnum font-semibold text-text-primary">
                          {score.toFixed(1)}
                          {hasCodeAnswers && (
                            <span className="text-xs text-text-muted font-normal"> (partial)</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-text-muted transition-transform duration-200 ease-[var(--ease-out-strong)] ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded answers */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {attempt.answers.length === 0 && (
                        <p className="text-sm text-text-muted px-4 py-3">No answers recorded.</p>
                      )}
                      {attempt.answers.map((ans, idx) => (
                        <div key={ans.answer_id} className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <span className="text-xs tnum text-text-muted px-2 py-0.5 bg-bg-base border border-border rounded flex-shrink-0 mt-0.5">
                              {ans.type.toUpperCase()}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary mb-2">
                                {idx + 1}. {ans.question_text}
                              </p>

                              {/* MCQ answer display — auto-scored */}
                              {ans.type === "mcq" && (
                                <div className="space-y-1">
                                  {(typeof ans.options === 'string'
                                    ? JSON.parse(ans.options)
                                    : ans.options || []
                                  ).map((opt, oi) => {
                                    const isSelected = ans.selected_option === oi;
                                    const isCorrect = ans.correct_option === oi;
                                    return (
                                      <div
                                        key={oi}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs border ${
                                          isCorrect
                                            ? "bg-accent-success/10 border-accent-success/30 text-accent-success"
                                            : isSelected && !isCorrect
                                            ? "bg-accent-critical/10 border-accent-critical/30 text-accent-critical"
                                            : "border-transparent text-text-secondary"
                                        }`}
                                      >
                                        {isCorrect ? (
                                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                        ) : isSelected ? (
                                          <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                        ) : (
                                          <span className="w-3.5" />
                                        )}
                                        {opt}
                                        {isSelected && !isCorrect && (
                                          <span className="ml-auto tnum">student selected</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-text-muted">Auto-score:</span>
                                    <span
                                      className={`text-xs tnum font-semibold ${
                                        ans.score > 0 ? "text-accent-success" : "text-accent-critical"
                                      }`}
                                    >
                                      {ans.score ?? 0}/{ans.max_score ?? 1}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Code answer — show code + manual scoring */}
                              {ans.type === "code" && (
                                <div className="space-y-2">
                                  {ans.code_answer ? (
                                    <pre className="text-xs text-text-primary bg-bg-base border border-border rounded p-3 overflow-x-auto max-h-48 font-mono whitespace-pre-wrap">
                                      {ans.code_answer}
                                    </pre>
                                  ) : (
                                    <p className="text-xs text-text-muted italic">
                                      No code submitted
                                    </p>
                                  )}

                                  {/* Manual scoring row */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-text-muted">
                                      Score (out of {ans.max_score ?? 10}):
                                    </span>
                                    {ans.score !== null && ans.score !== undefined &&
                                     scoreDrafts[ans.answer_id] === undefined ? (
                                      <span className="text-xs tnum text-text-primary">
                                        {ans.score}
                                      </span>
                                    ) : null}
                                    <Input
                                      type="number"
                                      step="0.5"
                                      min={0}
                                      max={ans.max_score ?? 10}
                                      placeholder={
                                        ans.score !== null && ans.score !== undefined
                                          ? String(ans.score)
                                          : `0 - ${ans.max_score ?? 10}`
                                      }
                                      value={scoreDrafts[ans.answer_id] ?? ""}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        const maxVal = parseFloat(ans.max_score ?? 10);
                                        if (!isNaN(val) && val > maxVal) {
                                          toast.error(`Score cannot exceed max score of ${maxVal}`);
                                          return;
                                        }
                                        setScoreDrafts((prev) => ({
                                          ...prev,
                                          [ans.answer_id]: e.target.value,
                                        }));
                                      }}
                                      className="w-28 h-7 text-xs bg-bg-base border-border tnum"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-3"
                                      onClick={() => handleSaveScore(ans.answer_id)}
                                      disabled={
                                        savingScore === ans.answer_id ||
                                        scoreDrafts[ans.answer_id] === undefined ||
                                        scoreDrafts[ans.answer_id] === ""
                                      }
                                    >
                                      {savingScore === ans.answer_id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        "Save"
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </PageShell>
  );
}
