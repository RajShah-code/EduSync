import { API_BASE_URL } from "../../config/api.js";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import {
  IconPlus,
  IconArrowLeft,
  IconTrash,
  IconDoorEnter,
  IconPlayerPlay,
  IconClock,
  IconFileText,
  IconCheck,
} from "@tabler/icons-react";
import { getSocket } from "../../store/socket";
import { cn } from "../../components/ui/utils";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState, PageLoader } from "../../components/ui/EmptyState";

// ── Thin fetch wrapper so the F2 page body (which was written against an
// `api.get/post/patch/del` helper) drops in unchanged. ──────────────────────
const authHeaders = () => {
  const token = localStorage.getItem("edusync_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
async function request(method, path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}
const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b ?? {}),
  put: (p, b) => request("PUT", p, b ?? {}),
  patch: (p, b) => request("PATCH", p, b ?? {}),
  del: (p) => request("DELETE", p),
};

// ── Local shims for the two F2 primitives F1 doesn't ship ───────────────────
function Field({ label, hint, className, children }) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

function OptionSelect({ value, onChange, options, placeholder, disabled, className }) {
  return (
    <Select value={value} onValueChange={(v) => onChange?.({ target: { value: v } })} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(options || []).map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CODE_LANGUAGES = ["javascript", "python", "java", "cpp", "c"];
const WIZARD_STEPS = [
  { id: 1, label: "Settings" },
  { id: 2, label: "Questions" },
  { id: 3, label: "Launch" },
];

const emptyExamForm = {
  title: "",
  question_type: "mcq",
  num_sets: 1,
  time_limit_minutes: 30,
  violation_limit: 3,
  class_ids: [],
};

function withParsedOptions(question) {
  let q = question;
  if (q?.type === "mcq" && typeof q.options === "string") {
    try {
      q = { ...q, options: JSON.parse(q.options) };
    } catch {
      /* leave as-is */
    }
  }
  if (q?.type === "code" && typeof q.test_cases === "string") {
    try {
      q = { ...q, test_cases: JSON.parse(q.test_cases) };
    } catch {
      /* leave as-is */
    }
  }
  return q;
}

export function ExamCreation() {
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext();
  const sessionInfo = outletContext?.sessionInfo ?? null;
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(location.state?.tab === "manage" ? "manage" : "create");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyExamForm);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/exams/my-exams"), api.get("/classes")]).then(
      ([examsRes, classesRes]) => {
        setExams(examsRes.exams ?? examsRes);
        setClasses(classesRes.classes ?? classesRes);
        setLoading(false);
      },
    );
  }, []);

  async function openExam(id) {
    const data = await api.get(`/exams/${id}`);
    const exam = data.exam ?? data;
    const setsMap = {};
    for (let n = 1; n <= (exam.num_sets || 1); n++) setsMap[n] = [];
    for (const s of data.sets || []) {
      setsMap[s.set_number] = (s.questions || []).map(withParsedOptions);
    }
    setSelected({ exam, sets: setsMap });
    setTab("create");
    setStep(2);
    return setsMap;
  }

  async function createExam() {
    setCreating(true);
    try {
      const res = await api.post("/exams/create", { ...form, session_id: sessionInfo?.id || null });
      const exam = res.exam ?? res;
      setExams((prev) => [exam, ...prev]);
      setForm(emptyExamForm);
      await openExam(exam.id);
    } catch (err) {
      toast.error(err.message || "Could not create exam");
    } finally {
      setCreating(false);
    }
  }

  function backToList() {
    setSelected(null);
    setStep(1);
    setTab("manage");
  }

  function classNameFor(id) {
    return classes.find((c) => c.id === id)?.name || id;
  }

  if (loading) return <PageLoader label="Loading exams" />;

  const canContinue = form.title.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      {/* Header + Create / Manage toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="font-display text-xl font-medium tracking-tight text-text-primary">Exam Manager</h1>
        <div className="inline-flex items-center gap-1 rounded-[var(--radius-lg)] bg-bg-surface-3 p-1">
          {[
            { key: "create", label: "Create" },
            { key: "manage", label: "Manage" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === "create" && !selected) setStep(1);
              }}
              className={cn(
                "flex h-8 items-center rounded-[var(--radius-md)] px-3.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "bg-bg-elevated text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "manage" ? (
        exams.length === 0 ? (
          <EmptyState icon={IconFileText} title="No exams yet" description="Switch to Create to build your first exam." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {exams.map((exam) => (
              <Card key={exam.id} className="flex flex-row flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-medium text-text-primary">{exam.title}</p>
                    <StatusBadge status={exam.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {(exam.class_ids || []).map(classNameFor).join(", ")} · {exam.time_limit_minutes} min
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {exam.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exam/active/${exam.id}`)}>
                      <IconPlayerPlay size={14} stroke={1.9} /> Monitor
                    </Button>
                  ) : exam.status === "ended" ? (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exam/results/${exam.id}`)}>
                      View Results
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openExam(exam.id)}>
                      Edit
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Step rail */}
          <div className="flex items-center gap-2">
            {WIZARD_STEPS.map((s, i) => {
              const reachable = s.id === 1 || Boolean(selected);
              const current = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && setStep(s.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    current
                      ? "border-accent-500 bg-accent-500/12 text-accent-500"
                      : "border-border-hover text-text-secondary hover:text-text-primary",
                  )}
                >
                  <span className="tnum">{i + 1}</span>
                  {s.label}
                </button>
              );
            })}
            {selected && (
              <button
                type="button"
                onClick={backToList}
                className="ml-auto flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <IconArrowLeft size={15} stroke={1.9} /> All Exams
              </button>
            )}
          </div>

          {step === 1 && !selected && (
            <Card className="p-5">
              <div className="flex flex-col gap-4">
                <Field label="Title">
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Unit 3 assessment" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Question type">
                    <OptionSelect
                      value={form.question_type}
                      onChange={(e) => setForm({ ...form, question_type: e.target.value })}
                      options={[
                        { value: "mcq", label: "Multiple choice only" },
                        { value: "code", label: "Code only" },
                        { value: "both", label: "MCQ + code" },
                      ]}
                    />
                  </Field>
                  <Field label="Sets (versions)">
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={form.num_sets}
                      onChange={(e) => setForm({ ...form, num_sets: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Time limit (min)">
                    <Input
                      type="number"
                      min={5}
                      value={form.time_limit_minutes}
                      onChange={(e) => setForm({ ...form, time_limit_minutes: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Violation limit">
                    <Input
                      type="number"
                      min={0}
                      value={form.violation_limit}
                      onChange={(e) => setForm({ ...form, violation_limit: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <Field label="Classes" hint="Who this exam is assigned to">
                  <div className="flex flex-wrap gap-1.5">
                    {classes.map((c) => {
                      const active = form.class_ids.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              class_ids: active
                                ? form.class_ids.filter((id) => id !== c.id)
                                : [...form.class_ids, c.id],
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "border-accent-500 bg-accent-500/12 text-accent-500"
                              : "border-border-hover text-text-secondary hover:bg-bg-surface-3",
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Button
                  variant="default"
                  disabled={!canContinue || creating}
                  onClick={createExam}
                  className="mt-1 self-end"
                >
                  Create Exam — Add Questions Next
                </Button>
              </div>
            </Card>
          )}

          {selected && (step === 2 || step === 3) && (
            <ExamEditor
              step={step}
              setStep={setStep}
              selected={selected}
              setSelected={setSelected}
              onRefresh={() => openExam(selected.exam.id)}
              onExamUpdated={(patch) => {
                setSelected((prev) => ({ ...prev, exam: { ...prev.exam, ...patch } }));
                setExams((prev) => prev.map((e) => (e.id === selected.exam.id ? { ...e, ...patch } : e)));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExamEditor({ step, setStep, selected, setSelected, onRefresh, onExamUpdated }) {
  const navigate = useNavigate();
  const { exam, sets } = selected;
  const setNumbers = Object.keys(sets)
    .map(Number)
    .sort((a, b) => a - b);
  const [activeSet, setActiveSet] = useState(setNumbers[0]);
  const [waitingCount, setWaitingCount] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);

  const preLaunch = exam.status === "draft" || exam.status === "waiting_room";

  useEffect(() => {
    if (exam.status !== "waiting_room") return;
    let cancelled = false;
    api.get(`/exams/${exam.id}/waiting-count`).then((d) => !cancelled && setWaitingCount(d.count));
    const socket = getSocket();
    if (!socket) return () => { cancelled = true; };
    const onUpdate = (payload) => setWaitingCount(payload.count);
    socket.on("exam:waiting_count_update", onUpdate);
    return () => {
      cancelled = true;
      socket.off("exam:waiting_count_update", onUpdate);
    };
  }, [exam.id, exam.status]);

  async function addQuestion(setNumber, type) {
    if (addingQuestion) return;
    const draft =
      type === "mcq"
        ? { type: "mcq", question_text: "", options: ["", "", "", ""], correct_option: 0, max_score: 1 }
        : { type: "code", question_text: "", description: "", language: "javascript", starter_code: "", test_cases: [], max_score: 10 };
    const countBefore = (sets[setNumber] || []).length;
    setAddingQuestion(true);
    try {
      const res = await api.post(`/exams/${exam.id}/sets/${setNumber}/questions`, draft);
      const question = withParsedOptions(res.question ?? res);
      setSelected((prev) => ({
        ...prev,
        sets: { ...prev.sets, [setNumber]: [...(prev.sets[setNumber] || []), question] },
      }));
    } catch (err) {
      try {
        const freshSets = await onRefresh?.();
        if ((freshSets?.[setNumber]?.length ?? 0) > countBefore) {
          toast.success("Question saved — refreshed to show it");
        } else {
          toast.error(err.message || "Could not add question");
        }
      } catch {
        toast.error(err.message || "Could not add question");
      }
    } finally {
      setAddingQuestion(false);
    }
  }

  async function updateQuestion(setNumber, questionId, patch) {
    setSelected((prev) => ({
      ...prev,
      sets: { ...prev.sets, [setNumber]: prev.sets[setNumber].map((q) => (q.id === questionId ? { ...q, ...patch } : q)) },
    }));
    try {
      await api.patch(`/exams/${exam.id}/questions/${questionId}`, patch);
    } catch (err) {
      toast.error(err.message || "Could not save question");
    }
  }

  async function deleteQuestion(setNumber, questionId) {
    setSelected((prev) => ({
      ...prev,
      sets: { ...prev.sets, [setNumber]: prev.sets[setNumber].filter((q) => q.id !== questionId) },
    }));
    try {
      await api.del(`/exams/${exam.id}/questions/${questionId}`);
    } catch (err) {
      toast.error(err.message || "Could not delete question");
    }
  }

  async function openWaitingRoom() {
    try {
      await api.post(`/exams/${exam.id}/open`);
      onExamUpdated({ status: "waiting_room" });
      toast.success("Waiting room opened");
    } catch (err) {
      toast.error(err.message || "Could not open waiting room");
    }
  }

  async function startExam() {
    try {
      await api.post(`/exams/${exam.id}/start`);
      onExamUpdated({ status: "active" });
      navigate(`/teacher/exam/active/${exam.id}`);
    } catch (err) {
      toast.error(err.message || "Could not start exam");
    }
  }

  async function scheduleExam() {
    try {
      await api.post(`/exams/${exam.id}/schedule`, { scheduled_at: scheduleAt });
      setScheduleOpen(false);
      toast.success("Exam scheduled to open automatically");
    } catch (err) {
      toast.error(err.message || "Could not schedule");
    }
  }

  const currentQuestions = sets[activeSet] || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-medium text-text-primary">{exam.title}</h2>
          <StatusBadge status={exam.status} />
          <span className="text-xs text-text-muted">
            {exam.time_limit_minutes} min · violation limit {exam.violation_limit}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {step === 2 && (
            <Button size="sm" variant="default" onClick={() => setStep(3)}>
              Next: Launch
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" variant="outline" onClick={() => setStep(2)}>
              <IconArrowLeft size={14} stroke={1.9} /> Back to Questions
            </Button>
          )}
        </div>
      </div>

      {step === 2 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <Tabs value={String(activeSet)} onValueChange={(v) => setActiveSet(Number(v))}>
              <TabsList>
                {setNumbers.map((n) => (
                  <TabsTrigger key={n} value={String(n)}>
                    Set {n}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {preLaunch && (
              <div className="flex gap-1.5">
                {(exam.question_type === "mcq" || exam.question_type === "both") && (
                  <Button size="sm" variant="outline" disabled={addingQuestion} onClick={() => addQuestion(activeSet, "mcq")}>
                    <IconPlus size={14} stroke={1.9} /> Add MCQ
                  </Button>
                )}
                {(exam.question_type === "code" || exam.question_type === "both") && (
                  <Button size="sm" variant="outline" disabled={addingQuestion} onClick={() => addQuestion(activeSet, "code")}>
                    <IconPlus size={14} stroke={1.9} /> Add Code Question
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-5">
            {currentQuestions.length === 0 ? (
              <EmptyState title="No questions yet" description="Add your first question to this set." />
            ) : (
              currentQuestions.map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  index={idx}
                  question={q}
                  editable={preLaunch}
                  onChange={(patch) => updateQuestion(activeSet, q.id, patch)}
                  onDelete={() => deleteQuestion(activeSet, q.id)}
                />
              ))
            )}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-sm text-text-secondary">
            {exam.status === "draft"
              ? "Open the waiting room when you are ready for students to join, or schedule it to open automatically."
              : exam.status === "waiting_room"
                ? "Students are joining the waiting room. Start the exam when everyone is ready."
                : "This exam is already live."}
          </p>
          <div className="flex flex-wrap gap-2">
            {exam.status === "draft" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
                  <IconClock size={14} stroke={1.9} /> Schedule
                </Button>
                <Button size="sm" variant="default" onClick={openWaitingRoom}>
                  <IconDoorEnter size={14} stroke={1.9} /> Open Waiting Room
                </Button>
              </>
            )}
            {exam.status === "waiting_room" && (
              <Button size="sm" variant="default" onClick={startExam}>
                <IconPlayerPlay size={14} stroke={1.9} /> Start Exam {waitingCount !== null && `(${waitingCount} waiting)`}
              </Button>
            )}
            {exam.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exam/active/${exam.id}`)}>
                <IconPlayerPlay size={14} stroke={1.9} /> Go to Live Monitor
              </Button>
            )}
          </div>
        </Card>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule Auto-Open</DialogTitle>
          </DialogHeader>
          <Field label="Open Waiting Room At">
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </Field>
          <Button variant="default" className="mt-4" onClick={scheduleExam}>
            Confirm Schedule
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionEditor({ index, question, editable, onChange, onDelete }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="mt-1.5 shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Q{index + 1}</span>
        <Textarea
          value={question.question_text}
          onChange={(e) => onChange({ question_text: e.target.value })}
          placeholder="Question text"
          disabled={!editable}
          rows={2}
          className="flex-1"
        />
        <Field label="Points" className="mt-0 w-20 shrink-0">
          <Input
            type="number"
            min={1}
            value={question.max_score ?? (question.type === "mcq" ? 1 : 10)}
            disabled={!editable}
            onChange={(e) => onChange({ max_score: Number(e.target.value) })}
            className="text-center"
          />
        </Field>
        {editable && (
          <button
            onClick={onDelete}
            aria-label={`Delete question ${index + 1}`}
            className="mt-6 shrink-0 rounded p-1 text-text-muted transition-colors hover:text-accent-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <IconTrash size={15} stroke={1.8} />
          </button>
        )}
      </div>

      {question.type === "mcq" ? (
        <div className="ml-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {(question.options || []).map((opt, i) => {
            const letter = ["A", "B", "C", "D"][i];
            const isCorrect = question.correct_option === i;
            return (
              <div
                key={i}
                role="button"
                tabIndex={editable ? 0 : -1}
                onClick={() => editable && onChange({ correct_option: i })}
                onKeyDown={(e) => {
                  if (editable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onChange({ correct_option: i });
                  }
                }}
                aria-pressed={isCorrect}
                aria-label={`Option ${letter}${isCorrect ? " — correct answer" : ""}`}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-full border pl-4 pr-3 text-sm transition-colors duration-150",
                  editable && "cursor-text",
                  isCorrect ? "border-accent-success/60 bg-accent-success/12" : "border-border hover:border-border-hover",
                )}
              >
                <span className={cn("shrink-0 text-xs font-bold tnum", isCorrect ? "text-accent-success" : "text-text-muted")}>
                  {letter}.
                </span>
                <input
                  value={opt}
                  disabled={!editable}
                  onChange={(e) => {
                    const next = [...question.options];
                    next[i] = e.target.value;
                    onChange({ options: next });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={`Option ${letter}`}
                  className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted disabled:text-text-secondary"
                />
                {isCorrect && <IconCheck size={15} stroke={2.5} className="shrink-0 text-accent-success" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ml-7 flex flex-col gap-2.5">
          <Textarea
            value={question.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Problem statement — shown to students above their editor"
            disabled={!editable}
            rows={3}
          />
          <div className="flex items-center gap-3">
            <OptionSelect
              value={question.language || "javascript"}
              onChange={(e) => onChange({ language: e.target.value })}
              disabled={!editable}
              className="!h-9 w-36"
              options={CODE_LANGUAGES.map((l) => ({ value: l, label: l }))}
            />
            <span className="text-xs text-text-muted">Graded manually after submission</span>
          </div>
          <Field label="Starter code" hint="Pre-filled in the student's editor when the question loads">
            <Textarea
              value={question.starter_code || ""}
              onChange={(e) => onChange({ starter_code: e.target.value })}
              placeholder={"function solve() {\n  // ...\n}"}
              disabled={!editable}
              rows={4}
              className="font-mono text-sm"
            />
          </Field>
          <TestCaseEditor
            testCases={question.test_cases || []}
            editable={editable}
            onChange={(next) => onChange({ test_cases: next })}
          />
        </div>
      )}
    </div>
  );
}

function TestCaseEditor({ testCases, editable, onChange }) {
  function updateCase(i, patch) {
    onChange(testCases.map((tc, idx) => (idx === i ? { ...tc, ...patch } : tc)));
  }
  function addCase() {
    onChange([...testCases, { input: "", expected_output: "" }]);
  }
  function removeCase(i) {
    onChange(testCases.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Sample test cases</span>
        {editable && (
          <button
            type="button"
            onClick={addCase}
            className="flex items-center gap-1 rounded text-xs font-semibold text-accent-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <IconPlus size={12} stroke={2} /> Add case
          </button>
        )}
      </div>
      {testCases.length === 0 ? (
        <p className="text-xs text-text-muted">No sample cases yet — students won&apos;t see any example input/output.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {testCases.map((tc, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border p-2.5">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Input">
                  <Textarea
                    value={tc.input}
                    onChange={(e) => updateCase(i, { input: e.target.value })}
                    disabled={!editable}
                    rows={2}
                    className="font-mono text-xs"
                  />
                </Field>
                <Field label="Expected output">
                  <Textarea
                    value={tc.expected_output}
                    onChange={(e) => updateCase(i, { expected_output: e.target.value })}
                    disabled={!editable}
                    rows={2}
                    className="font-mono text-xs"
                  />
                </Field>
              </div>
              {editable && (
                <button
                  onClick={() => removeCase(i)}
                  aria-label={`Remove test case ${i + 1}`}
                  className="mt-6 shrink-0 rounded p-1 text-text-muted transition-colors hover:text-accent-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <IconTrash size={14} stroke={1.8} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExamCreation;
