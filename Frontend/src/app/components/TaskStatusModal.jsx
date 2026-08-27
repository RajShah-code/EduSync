import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Editor from "@monaco-editor/react";
import { IconX as X, IconClock as Clock, IconAward as Award, IconHelpCircle as HelpCircle, IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Skeleton } from "./ui/skeleton";
import { cn } from "./ui/utils";

const READONLY_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
};

const VARIANT_BADGE = {
  in_progress: "in-progress",
  doubt: "doubt",
  submitted: "submitted",
};

const panelTransition = { duration: 0.22, ease: [0.23, 1, 0.32, 1] };
const reducedTransition = { duration: 0.01 };

// Shared modal shell — bg-elevated per the app's modal convention, identical
// enter/exit motion and close behavior across all three variants. Only the
// body content differs by status.
export function TaskStatusModal({
  open,
  onClose,
  variant,
  student,
  task,
  submission,
  doubt,
  onResolveDoubt,
  resolving,
  onSaveScore,
  savingScore,
}) {
  const prefersReducedMotion = useReducedMotion();
  const transition = prefersReducedMotion ? reducedTransition : panelTransition;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
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
            aria-label={`${student?.student_name || "Student"} — ${task?.title || "task"}`}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-bg-elevated border border-border rounded-[var(--radius-lg)] overflow-hidden"
            style={{ boxShadow: "var(--shadow-modal)" }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={transition}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Shared header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-bold text-text-primary truncate">
                    {student?.student_name || "Unnamed student"}
                  </h2>
                  <span className="text-[11px] text-text-muted tnum flex-shrink-0">
                    Roll {student?.roll_no ?? "N/A"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5 truncate">
                  {task?.title || "Untitled task"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {variant && <StatusBadge status={VARIANT_BADGE[variant]} />}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-text-muted hover:text-text-primary transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Variant body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {variant === "in_progress" && (
                <InProgressBody student={student} submission={submission} />
              )}
              {variant === "doubt" && (
                <DoubtBody
                  doubt={doubt}
                  onResolveDoubt={onResolveDoubt}
                  resolving={resolving}
                />
              )}
              {variant === "submitted" && (
                <SubmittedBody
                  submission={submission}
                  onSaveScore={onSaveScore}
                  savingScore={savingScore}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── In Progress ─────────────────────────────────────────────────────────
// No live code stream reaches the teacher dashboard until a save/submit
// event, so this is honestly framed as an activity signal, not a fake
// live preview — a content-shaped skeleton communicates "on its way",
// never a spinner (per the skeleton-loading convention).
function InProgressBody({ student, submission }) {
  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-text-secondary leading-relaxed">
        {student?.student_name || "This student"} is currently working on this task.
        A live code preview isn't available on this dashboard — status below is
        derived from real activity signals.
      </p>

      <div className="border border-border rounded-[var(--radius-md)] bg-bg-base p-4 space-y-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
          Live preview unavailable
        </div>
        {[92, 68, 84, 52, 76, 40].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Presence
          </div>
          <StatusBadge status={student?.presence || "offline"} />
        </div>
        <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)] flex flex-col justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last Saved
          </div>
          <div className="text-xs text-text-primary tnum">
            {submission?.updated_at
              ? new Date(submission.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not yet saved"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Doubt Raised ────────────────────────────────────────────────────────
function DoubtBody({ doubt, onResolveDoubt, resolving }) {
  const [responseText, setResponseText] = useState("");
  const [lineStart, setLineStart] = useState("");
  const [lineEnd, setLineEnd] = useState("");
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);

  useEffect(() => {
    setResponseText(doubt?.teacher_response_text || "");
    setLineStart(doubt?.hint_line_start ? String(doubt.hint_line_start) : "");
    setLineEnd(doubt?.hint_line_end ? String(doubt.hint_line_end) : "");
  }, [doubt?.id]);

  const applyDecorations = (startVal, endVal) => {
    const editor = editorRef.current;
    const monacoNS = monacoRef.current;
    if (!editor || !monacoNS) return;
    const start = parseInt(startVal, 10);
    const end = parseInt(endVal, 10) || start;
    const next =
      start > 0
        ? [
            {
              range: new monacoNS.Range(start, 1, end, 1),
              options: {
                isWholeLine: true,
                className: "doubt-highlight-line",
                linesDecorationsClassName: "doubt-highlight-gutter",
              },
            },
          ]
        : [];
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, next);
    if (start > 0) editor.revealLineInCenter(start);
  };

  const handleEditorMount = (editor, monacoNS) => {
    editorRef.current = editor;
    monacoRef.current = monacoNS;
    applyDecorations(lineStart, lineEnd);
  };

  useEffect(() => {
    applyDecorations(lineStart, lineEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineStart, lineEnd]);

  if (!doubt) return null;

  const isPending = doubt.status === "pending";

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!responseText.trim()) return;
    onResolveDoubt?.({ responseText, lineStart, lineEnd });
  };

  return (
    <div className="p-5 space-y-4">
      <style>{`
        .doubt-highlight-line { background: color-mix(in srgb, var(--accent-warning) 18%, transparent); }
        .doubt-highlight-gutter { background: var(--accent-warning); width: 3px !important; margin-left: 3px; }
      `}</style>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-text-muted flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-accent-warning flex-shrink-0" />
          Raised {doubt.raised_at ? new Date(doubt.raised_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
        </p>
      </div>

      <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Student's Question
        </div>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
          {doubt.question_text || "(No question text was submitted with this doubt.)"}
        </p>
      </div>

      <p className="text-[11px] text-text-muted">
        Review the code snapshot below and select the relevant lines to highlight in your hint.
      </p>

      <div className="h-56 border border-border rounded-[var(--radius-md)] overflow-hidden relative">
        <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-black/60 text-[9px] font-semibold tracking-wide text-white rounded-[var(--radius-sm)]">
          Read-only Snapshot
        </div>
        <Editor
          height="100%"
          language="javascript"
          value={doubt.code_snapshot || ""}
          theme="vs-dark"
          options={READONLY_EDITOR_OPTIONS}
          onMount={handleEditorMount}
        />
      </div>

      {isPending ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="modalLineStart" className="text-[10px] text-text-secondary font-bold uppercase">
                Hint Start Line (Optional)
              </Label>
              <Input
                id="modalLineStart"
                type="number"
                min="1"
                value={lineStart}
                onChange={(e) => setLineStart(e.target.value)}
                placeholder="e.g. 5"
                className="mt-1 bg-bg-base border-border text-xs text-text-primary tnum"
              />
            </div>
            <div>
              <Label htmlFor="modalLineEnd" className="text-[10px] text-text-secondary font-bold uppercase">
                Hint End Line (Optional)
              </Label>
              <Input
                id="modalLineEnd"
                type="number"
                min="1"
                value={lineEnd}
                onChange={(e) => setLineEnd(e.target.value)}
                placeholder="e.g. 8"
                className="mt-1 bg-bg-base border-border text-xs text-text-primary tnum"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="modalResponseText" className="text-[10px] text-text-secondary font-bold uppercase">
              Teacher Response / Hint Text (Mandatory)
            </Label>
            <Textarea
              id="modalResponseText"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Write instructions or highlight issues for the student..."
              className="mt-1 bg-bg-base border-border text-xs text-text-primary min-h-[70px]"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={resolving || !responseText.trim()}
            className="w-full bg-accent-500 hover:bg-accent-500/90 text-white font-semibold text-xs h-9"
          >
            {resolving ? "Resolving Doubt..." : "Send Hint & Resolve Doubt"}
          </Button>
        </form>
      ) : (
        <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)] text-xs text-text-secondary space-y-1">
          <div className="font-semibold text-accent-success flex items-center gap-1.5 mb-1">
            Resolved Hint
          </div>
          <div className="bg-bg-surface p-2 border border-border/40 rounded-[var(--radius-sm)] text-text-primary">
            {doubt.teacher_response_text}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Submitted ───────────────────────────────────────────────────────────
function SubmittedBody({ submission, onSaveScore, savingScore }) {
  const [scoreInput, setScoreInput] = useState("");

  useEffect(() => {
    setScoreInput(submission?.score !== null && submission?.score !== undefined ? String(submission.score) : "");
  }, [submission?.id, submission?.score]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveScore?.(scoreInput);
  };

  return (
    <div className="p-5 space-y-4">
      {submission?.status === "auto_submitted" && (
        <div className="flex items-center gap-2 text-xs text-accent-warning bg-accent-warning/10 border border-accent-warning/25 rounded-[var(--radius-md)] px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Auto-submitted when the task deadline passed.
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold tracking-wide bg-bg-base px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] uppercase border border-border">
          {submission?.language || "Plain Text"}
        </span>
        {submission?.submitted_at && (
          <span className="flex items-center gap-1 tnum">
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            {new Date(submission.submitted_at).toLocaleString()}
          </span>
        )}
      </div>

      <div className="h-64 border border-border rounded-[var(--radius-md)] overflow-hidden">
        <Editor
          height="100%"
          language={submission?.language?.toLowerCase() || "plaintext"}
          value={submission?.code || ""}
          theme="vs-dark"
          options={READONLY_EDITOR_OPTIONS}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <Label htmlFor="modalScore" className="text-xs font-bold text-text-secondary uppercase whitespace-nowrap flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" />
          Grade / Score
        </Label>
        <Input
          id="modalScore"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={scoreInput}
          onChange={(e) => setScoreInput(e.target.value)}
          placeholder="e.g. 85.5"
          className="w-28 bg-bg-base border-border tnum text-sm text-text-primary"
        />
        <Button
          type="submit"
          disabled={savingScore}
          size="sm"
          className={cn("bg-accent-500 hover:bg-accent-500/90 text-white font-bold h-9")}
        >
          {savingScore ? "Saving..." : "Save Score"}
        </Button>
      </form>
    </div>
  );
}
