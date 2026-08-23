import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import Editor from "@monaco-editor/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import {
  FileText,
  Loader2,
  ChevronDown,
  CheckCircle,
  XCircle,
  X,
  Award,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import PageShell from "../../components/PageShell";

const READONLY_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
};

// ── Code answer grading modal — mirrors TaskStatusModal's SubmittedBody
// exactly (read-only Monaco preview, language chip, Score/Save form against
// max_score), since manual code grading here is the same interaction as
// grading a submitted task there. MCQ answers stay inline in the expanded
// row below — they're already auto-scored and read-only, so a modal would
// add a click for no benefit. ──
function CodeAnswerGradeModal({ answer, studentName, onClose, onSave, saving }) {
  const prefersReducedMotion = useReducedMotion();
  const transition = { duration: prefersReducedMotion ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] };
  const [scoreInput, setScoreInput] = useState("");

  useEffect(() => {
    setScoreInput(answer?.score !== null && answer?.score !== undefined ? String(answer.score) : "");
  }, [answer?.answer_id, answer?.score]);

  const maxScore = answer?.max_score ?? 10;

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(scoreInput);
    if (isNaN(val)) return;
    if (val > maxScore) {
      toast.error(`Score cannot exceed max score of ${maxScore}`);
      return;
    }
    onSave(answer.answer_id, scoreInput);
  };

  return (
    <AnimatePresence>
      {answer && (
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
            aria-label={`${studentName} — code answer grading`}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-bg-elevated border border-border rounded-[var(--radius-lg)] overflow-hidden"
            style={{ boxShadow: "var(--shadow-modal)" }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={transition}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-text-primary truncate">{studentName}</h2>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{answer.question_text}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors rounded-[var(--radius-sm)] flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span className="font-semibold tracking-wide bg-bg-base px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] uppercase border border-border">
                  {answer.language || "Plain Text"}
                </span>
              </div>

              <div className="h-64 border border-border rounded-[var(--radius-md)] overflow-hidden">
                {answer.code_answer ? (
                  <Editor
                    height="100%"
                    language={(answer.language || "plaintext").toLowerCase()}
                    value={answer.code_answer}
                    theme="vs-dark"
                    options={READONLY_EDITOR_OPTIONS}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-text-muted italic bg-bg-base">
                    No code submitted
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <Label htmlFor="modalScore" className="text-xs font-bold text-text-secondary uppercase whitespace-nowrap flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Score / {maxScore}
                </Label>
                <Input
                  id="modalScore"
                  type="number"
                  step="0.5"
                  min={0}
                  max={maxScore}
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  placeholder={`0 - ${maxScore}`}
                  className="w-28 bg-bg-base border-border tnum text-sm text-text-primary"
                />
                <Button
                  type="submit"
                  disabled={saving || scoreInput === ""}
                  size="sm"
                  className="font-bold h-9"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> : null}
                  Save Score
                </Button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ExamResults() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAttempt, setExpandedAttempt] = useState(null);
  const [gradingAnswer, setGradingAnswer] = useState(null); // { answer, attempt } | null
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

  const handleSaveScore = async (answerId, scoreStr) => {
    if (scoreStr === undefined || scoreStr === "") return;
    setSavingScore(answerId);
    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/answers/${answerId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ score: parseFloat(scoreStr) }),
      });
      if (res.ok) {
        toast.success("Score saved");
        // Update local state without full refetch
        setResults((prev) =>
          prev.map((attempt) => ({
            ...attempt,
            answers: attempt.answers.map((ans) =>
              ans.answer_id === answerId
                ? { ...ans, score: parseFloat(scoreStr) }
                : ans
            ),
          }))
        );
        setGradingAnswer(null);
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
  const maxPossible = (attempt) =>
    attempt.answers.reduce((sum, a) => sum + Number(a.max_score ?? (a.type === "mcq" ? 1 : 0)), 0);

  // Score distribution — one bar per student who has submitted, as a % of
  // that attempt's own max possible score. Only rendered once at least one
  // submitted/locked attempt exists; skipped entirely otherwise rather than
  // showing an empty chart.
  const scoreChartData = results
    .filter((a) => (a.status === "submitted" || a.status === "locked") && maxPossible(a) > 0)
    .map((a) => ({
      student: a.student_name?.split(" ")[0] || `#${a.attempt_id}`,
      pct: Math.round((totalScore(a) / maxPossible(a)) * 1000) / 10,
    }));

  if (loading) {
    return (
      <PageShell>
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
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
        <FileText className="w-12 h-12 text-text-muted" strokeWidth={1.75} />
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)]"
            >
              <div className="text-[11px] text-text-muted uppercase tracking-[0.08em] mb-1">{label}</div>
              <div className="text-2xl tnum font-semibold text-text-primary">{value}</div>
            </div>
          ))}
        </div>

        {/* Score distribution — earns its place here specifically because a
            teacher reviewing a full class benefits from an at-a-glance
            "who's struggling" read before scrolling a per-student list;
            skipped when nothing is scoreable yet. */}
        {scoreChartData.length > 0 && (
          <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Score Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreChartData} id="exam-score-distribution-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="student"
                  stroke="var(--text-secondary)"
                  style={{ fontSize: 11 }}
                  tick={{ fontFamily: "var(--font-sans)" }}
                />
                <YAxis
                  stroke="var(--text-secondary)"
                  style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                  tick={{ fontFamily: "var(--font-sans)" }}
                  domain={[0, 100]}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in srgb, var(--text-primary) 6%, transparent)" }}
                  contentStyle={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                  }}
                  formatter={(value) => [`${value}%`, "Score"]}
                />
                <Bar dataKey="pct" name="score-pct" fill="var(--accent-500)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Results list */}
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-12 h-12 text-text-muted" strokeWidth={1.75} />
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
                  className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden"
                >
                  {/* Collapsed row */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-bg-base/50 transition-colors duration-150 text-left"
                    onClick={() =>
                      setExpandedAttempt(isExpanded ? null : attempt.attempt_id)
                    }
                    aria-expanded={isExpanded}
                  >
                    <div className="flex-1 flex flex-wrap items-center gap-3">
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
                        <span className="text-[11px] tnum px-2 py-0.5 bg-accent-warning/10 text-accent-warning border border-accent-warning/20 rounded-[var(--radius-sm)]">
                          auto-submitted
                        </span>
                      )}
                      {attempt.violation_count > 0 && (
                        <span className="text-[11px] tnum px-2 py-0.5 bg-accent-critical/10 text-accent-critical border border-accent-critical/20 rounded-[var(--radius-sm)]">
                          {attempt.violation_count} violation(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] text-text-muted uppercase tracking-[0.08em]">Score</div>
                        <div className="tnum font-semibold text-text-primary">
                          {score.toFixed(1)}
                          {hasCodeAnswers && (
                            <span className="text-xs text-text-muted font-normal"> (partial)</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-text-muted transition-transform duration-200 ease-[var(--ease-out-strong)]",
                          isExpanded && "rotate-180"
                        )}
                        strokeWidth={1.75}
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
                            <span className="text-[10px] tnum text-text-muted px-2 py-0.5 bg-bg-base border border-border rounded-[var(--radius-sm)] flex-shrink-0 mt-0.5 uppercase">
                              {ans.type}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary mb-2">
                                {idx + 1}. {ans.question_text}
                              </p>

                              {/* MCQ answer display — auto-scored, read-only,
                                  stays inline (a modal would add friction for
                                  a glance-only view). */}
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
                                        className={cn(
                                          "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs border",
                                          isCorrect
                                            ? "bg-accent-success/10 border-accent-success/30 text-accent-success"
                                            : isSelected && !isCorrect
                                            ? "bg-accent-critical/10 border-accent-critical/30 text-accent-critical"
                                            : "border-transparent text-text-secondary"
                                        )}
                                      >
                                        {isCorrect ? (
                                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
                                        ) : isSelected ? (
                                          <XCircle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
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
                                      className={cn(
                                        "text-xs tnum font-semibold",
                                        ans.score > 0 ? "text-accent-success" : "text-accent-critical"
                                      )}
                                    >
                                      {ans.score ?? 0}/{ans.max_score ?? 1}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Code answer — grading happens in the modal,
                                  mirroring Task Assignment's Submitted-question
                                  grading flow. This row is just a summary +
                                  entry point. */}
                              {ans.type === "code" && (
                                <button
                                  type="button"
                                  onClick={() => setGradingAnswer({ answer: ans, attempt })}
                                  className="w-full flex items-center justify-between gap-3 p-3 bg-bg-base border border-border rounded-[var(--radius-md)] hover:border-border-hover transition-colors duration-150 text-left"
                                >
                                  <span className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
                                    <Clock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" strokeWidth={1.75} />
                                    <span className="truncate">
                                      {ans.code_answer ? "View code & grade" : "No code submitted"}
                                    </span>
                                  </span>
                                  <span
                                    className={cn(
                                      "tnum text-xs font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] flex-shrink-0",
                                      ans.score !== null && ans.score !== undefined
                                        ? "bg-accent-success/10 text-accent-success"
                                        : "bg-accent-warning/10 text-accent-warning"
                                    )}
                                  >
                                    {ans.score !== null && ans.score !== undefined
                                      ? `${ans.score}/${ans.max_score ?? 10}`
                                      : `Ungraded · /${ans.max_score ?? 10}`}
                                  </span>
                                </button>
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

        <CodeAnswerGradeModal
          answer={gradingAnswer?.answer}
          studentName={gradingAnswer?.attempt?.student_name}
          onClose={() => setGradingAnswer(null)}
          onSave={handleSaveScore}
          saving={savingScore === gradingAnswer?.answer?.answer_id}
        />
    </PageShell>
  );
}
