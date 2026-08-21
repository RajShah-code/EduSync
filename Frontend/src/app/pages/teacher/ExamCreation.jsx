import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { StatusBadge } from "../../components/StatusBadge";
import { Skeleton } from "../../components/ui/skeleton";
import Editor from "@monaco-editor/react";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Code2,
  CheckSquare,
  Play,
  Loader2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const QUESTION_TYPES = [
  { value: "mcq", label: "MCQ Only", icon: CheckSquare, desc: "Multiple choice questions only" },
  { value: "code", label: "Code Only", icon: Code2, desc: "Code submission questions only" },
  { value: "both", label: "Both", icon: BookOpen, desc: "Mix of MCQ and code questions" },
];

const LANGUAGES = ["javascript", "python", "java", "cpp", "c"];

const emptyMcq = () => ({
  type: "mcq",
  question_text: "",
  options: ["", "", "", ""],
  correct_option: 0,
  max_score: 1,
});

const emptyCode = () => ({
  type: "code",
  question_text: "",
  language: "python",
  starter_code: "",
  max_score: 10,
});

export function ExamCreation() {
  const context = useOutletContext();
  const sessionInfo = context?.sessionInfo ?? null;
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Exam settings
  const [settings, setSettings] = useState({
    title: "",
    question_type: "mcq",
    num_sets: 2,
    time_limit_minutes: 30,
    violation_limit: 3,
  });

  // After creation, exam_id is stored here
  const [examId, setExamId] = useState(null);

  // Target classes state
  const [classes, setClasses] = useState([]);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [examOpened, setExamOpened] = useState(false);

  // Fetch classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setClasses(data.classes || []);
        }
      } catch (err) {
        console.error("Failed to fetch classes:", err);
      }
    };
    fetchClasses();
  }, []);

  const [activeTab, setActiveTab] = useState("create"); // "create" | "manage"
  const [myExams, setMyExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);

  const fetchMyExams = async () => {
    setLoadingExams(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/my-exams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyExams(data.exams || []);
      }
    } catch (err) {
      console.error("Failed to fetch teacher exams:", err);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    if (activeTab === "manage") {
      fetchMyExams();
    }
  }, [activeTab]);

  const handleManageExam = async (exam) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${exam.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Populate settings
        setSettings({
          title: data.exam.title,
          question_type: data.exam.question_type,
          num_sets: data.exam.num_sets,
          time_limit_minutes: data.exam.time_limit_minutes,
          violation_limit: data.exam.violation_limit
        });
        setExamId(data.exam.id);
        setSelectedClassIds(data.exam.class_ids || []);
        setExamOpened(data.exam.status === "waiting_room");

        // Reconstruct setQuestions: { [setNumber]: questions[] }
        const questionsMap = {};
        for (let i = 1; i <= data.exam.num_sets; i++) {
          questionsMap[i] = [];
        }
        for (const s of data.sets) {
          questionsMap[s.set_number] = s.questions || [];
        }
        setSetQuestions(questionsMap);

        // Go to Step 3 (Review & Start)
        setStep(3);
        setActiveTab("create"); // Switch back to the create tab to show this exam's detail view!
      } else {
        toast.error("Failed to load exam details");
      }
    } catch (err) {
      console.error("Error loading exam details:", err);
      toast.error("Error loading exam details");
    }
  };

  const handleExamClick = (exam) => {
    if (exam.status === "draft" || exam.status === "waiting_room") {
      handleManageExam(exam);
    } else if (exam.status === "active") {
      navigate(`/teacher/exam/active/${exam.id}`);
    } else if (exam.status === "ended") {
      navigate(`/teacher/exam/results/${exam.id}`);
    }
  };

  // Step 2 — Per-set question arrays: { [setNumber]: Question[] }
  const [setQuestions, setSetQuestions] = useState({});
  const [activeSet, setActiveSet] = useState(1);
  // Draft form for the question being built
  const [draft, setDraft] = useState(null); // null means no draft open

  // ── Step 1: Create Exam ────────────────────────────────────────────────────
  const handleCreateExam = async () => {
    if (!settings.title.trim()) return toast.error("Exam title is required");
    if (selectedClassIds.length === 0) return toast.error("Please select at least one class");

    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...settings,
          session_id: sessionInfo?.id || null,
          class_ids: selectedClassIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setExamId(data.exam.id);
      // Initialise empty question lists for each set
      const initial = {};
      for (let i = 1; i <= settings.num_sets; i++) initial[i] = [];
      setSetQuestions(initial);
      setActiveSet(1);
      setDraft(null);
      setStep(2);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExam = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/open`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setExamOpened(true);
      toast.success("Exam opened! Students can now join the waiting room.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Add a question to the active set ───────────────────────────────
  const openNewDraft = (type) => {
    setDraft(type === "code" ? emptyCode() : emptyMcq());
  };

  const handleSaveQuestion = async () => {
    if (!draft) return;
    if (!draft.question_text.trim()) return toast.error("Question text is required");

    if (draft.type === "mcq") {
      if (draft.options.some((o) => !o.trim())) return toast.error("All 4 options are required");
    }
    if (draft.type === "code") {
      if (!draft.language) return toast.error("Select a language");
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(
        `${API_BASE_URL}/exams/${examId}/sets/${activeSet}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(draft),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setSetQuestions((prev) => ({
        ...prev,
        [activeSet]: [...(prev[activeSet] || []), data.question],
      }));
      setDraft(null);
      toast.success("Question added");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestionLocally = (setNum, qId) => {
    setSetQuestions((prev) => ({
      ...prev,
      [setNum]: prev[setNum].filter((q) => q.id !== qId),
    }));
  };

  // ── Step 3: Start Exam ─────────────────────────────────────────────────────
  const handleStartExam = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Exam started!");
      navigate(`/teacher/exam/active/${examId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalQuestions = Object.values(setQuestions).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  const isDraftMcq = draft?.type === "mcq";
  const isDraftCode = draft?.type === "code";

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header and Tabs */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Exam Manager</h1>
            <p className="text-sm text-text-secondary">
              Configure exams, manage sets, and track student results
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex bg-bg-surface p-1 rounded border border-border">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded transition-all ${
                activeTab === "create"
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Plus className="w-4 h-4" />
              Create Exam
            </button>
            <button
              onClick={() => setActiveTab("manage")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded transition-all ${
                activeTab === "manage"
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Manage Exams ({myExams.length})
            </button>
          </div>
        </div>

        {activeTab === "create" ? (
          <div className="grid grid-cols-[220px_1fr] gap-6">
          {/* Left: Step indicator + summary */}
          <div className="space-y-4">
            <div className="p-4 bg-bg-surface border border-border rounded-lg">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Setup Steps
              </h3>
              <div className="space-y-1">
                {[
                  { id: 1, label: "Settings", active: step >= 1 },
                  { id: 2, label: "Questions", active: step >= 2 },
                  { id: 3, label: "Start", active: step >= 3 },
                ].map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                      step === s.id
                        ? "bg-accent-info/10 border border-accent-info/20 text-accent-info"
                        : step > s.id
                        ? "text-accent-success"
                        : "text-text-muted"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                        step > s.id
                          ? "bg-accent-success text-white"
                          : step === s.id
                          ? "bg-accent-info text-white"
                          : "bg-bg-base border border-border"
                      }`}
                    >
                      {step > s.id ? "✓" : s.id}
                    </span>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-bg-surface border border-border rounded-lg text-sm space-y-2">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Summary
              </h3>
              <div className="flex justify-between">
                <span className="text-text-secondary">Type</span>
                <span className="font-mono text-text-primary uppercase text-xs">
                  {settings.question_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Sets</span>
                <span className="font-mono text-text-primary">{settings.num_sets}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Duration</span>
                <span className="font-mono text-text-primary">
                  {settings.time_limit_minutes}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Violations</span>
                <span className="font-mono text-text-primary">{settings.violation_limit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Questions</span>
                <span className="font-mono text-text-primary">{totalQuestions}</span>
              </div>
            </div>
          </div>

          {/* Right: Step content */}
          <div className="bg-bg-surface border border-border rounded-lg p-6">
            {/* ── STEP 1: Settings ── */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-text-primary">Exam Settings</h2>

                <div>
                  <Label htmlFor="exam-title">Exam Title</Label>
                  <Input
                    id="exam-title"
                    value={settings.title}
                    onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                    placeholder="e.g., Data Structures Mid-term"
                    className="mt-1 bg-bg-base border-border"
                  />
                </div>

                <div>
                  <Label>Question Type</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {QUESTION_TYPES.map(({ value, label, icon: Icon, desc }) => (
                      <button
                        key={value}
                        onClick={() => setSettings({ ...settings, question_type: value })}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          settings.question_type === value
                            ? "border-accent-info bg-accent-info/10"
                            : "border-border bg-bg-base hover:border-border/60"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 mb-1.5 ${
                            settings.question_type === value
                              ? "text-accent-info"
                              : "text-text-muted"
                          }`}
                        />
                        <div
                          className={`text-sm font-medium ${
                            settings.question_type === value
                              ? "text-accent-info"
                              : "text-text-primary"
                          }`}
                        >
                          {label}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Target Classes</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {classes.map((cls) => {
                      const isSelected = selectedClassIds.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedClassIds(selectedClassIds.filter((id) => id !== cls.id));
                            } else {
                              setSelectedClassIds([...selectedClassIds, cls.id]);
                            }
                          }}
                          className={`p-3 rounded-lg border text-left transition-all flex items-center gap-3 ${
                            isSelected
                              ? "border-accent-info bg-accent-info/10"
                              : "border-border bg-bg-base hover:border-border/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="rounded border-border text-accent-info focus:ring-accent-info h-4 w-4 bg-bg-base"
                          />
                          <div>
                            <div className="text-sm font-medium text-text-primary">
                              {cls.name}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {classes.length === 0 && (
                    <p className="text-xs text-text-muted mt-1">No classes found. Please create classes first.</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="num-sets">Question Sets</Label>
                    <Input
                      id="num-sets"
                      type="number"
                      min={1}
                      max={10}
                      value={settings.num_sets}
                      onChange={(e) =>
                        setSettings({ ...settings, num_sets: parseInt(e.target.value) || 1 })
                      }
                      className="mt-1 bg-bg-base border-border font-mono"
                    />
                    <p className="text-xs text-text-muted mt-1">
                      Different versions of the exam
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="time-limit">Duration (min)</Label>
                    <Input
                      id="time-limit"
                      type="number"
                      min={1}
                      value={settings.time_limit_minutes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          time_limit_minutes: parseInt(e.target.value) || 30,
                        })
                      }
                      className="mt-1 bg-bg-base border-border font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="violation-limit">Violation Limit</Label>
                    <Input
                      id="violation-limit"
                      type="number"
                      min={1}
                      max={10}
                      value={settings.violation_limit}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          violation_limit: parseInt(e.target.value) || 3,
                        })
                      }
                      className="mt-1 bg-bg-base border-border font-mono"
                    />
                    <p className="text-xs text-text-muted mt-1">Auto-locks after this many</p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleCreateExam}
                    disabled={saving || !settings.title.trim()}
                    className="bg-accent-info hover:bg-accent-info/90"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mr-2" />
                    )}
                    Create &amp; Continue to Questions
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Question Builder ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-text-primary">Question Builder</h2>
                  <span className="text-xs font-mono text-text-muted px-2 py-1 bg-bg-base border border-border rounded">
                    Exam #{examId}
                  </span>
                </div>

                {/* Set tabs */}
                <div className="flex gap-1 border-b border-border pb-0">
                  {Array.from({ length: settings.num_sets }, (_, i) => i + 1).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setActiveSet(s); setDraft(null); }}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        activeSet === s
                          ? "border-accent-info text-accent-info"
                          : "border-transparent text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Set {s}
                      {(setQuestions[s]?.length ?? 0) > 0 && (
                        <span className="ml-1.5 text-xs font-mono px-1.5 py-0.5 bg-accent-info/10 text-accent-info rounded">
                          {setQuestions[s].length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Question list for active set */}
                <div className="space-y-2">
                  {(setQuestions[activeSet] || []).map((q, idx) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 p-3 bg-bg-base border border-border rounded-lg"
                    >
                      <span className="text-xs font-mono text-text-muted px-2 py-0.5 bg-bg-surface border border-border rounded mt-0.5 flex-shrink-0">
                        {q.type.toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">
                          {idx + 1}. {q.question_text}
                        </p>
                        {q.type === "code" && (
                          <p className="text-xs text-text-muted mt-0.5 font-mono">{q.language}</p>
                        )}
                        {q.type === "mcq" && (
                          <p className="text-xs text-text-muted mt-0.5">
                            {q.options?.length ?? 0} options · correct: {
                              q.options?.[q.correct_option] ?? "—"
                            }
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteQuestionLocally(activeSet, q.id)}
                        className="text-text-muted hover:text-accent-critical transition-colors flex-shrink-0"
                        title="Remove from list"
                        aria-label={`Remove question ${idx + 1} from list: ${q.question_text}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {(setQuestions[activeSet] || []).length === 0 && !draft && (
                    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg text-text-muted text-sm">
                      No questions yet for Set {activeSet}
                    </div>
                  )}
                </div>

                {/* Add question button row */}
                {!draft && (
                  <div className="flex gap-2">
                    {(settings.question_type === "mcq" || settings.question_type === "both") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openNewDraft("mcq")}
                        className="border-accent-info/40 text-accent-info hover:bg-accent-info/10"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add MCQ
                      </Button>
                    )}
                    {(settings.question_type === "code" || settings.question_type === "both") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openNewDraft("code")}
                        className="border-accent-success/40 text-accent-success hover:bg-accent-success/10"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Code
                      </Button>
                    )}
                  </div>
                )}

                {/* Draft question editor */}
                {draft && (
                  <div className="border border-border rounded-lg p-4 space-y-4 bg-bg-base">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                        New {draft.type === "mcq" ? "MCQ" : "Code"} Question — Set {activeSet}
                      </span>
                      <button
                        onClick={() => setDraft(null)}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>

                    <div>
                      <Label>Question Text</Label>
                      <Input
                        value={draft.question_text}
                        onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                        placeholder="Enter your question..."
                        className="mt-1 bg-bg-surface border-border"
                      />
                    </div>

                    {isDraftMcq && (
                      <>
                        <div className="space-y-2">
                          <Label>Options (select correct answer)</Label>
                          {draft.options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <button
                                onClick={() => setDraft({ ...draft, correct_option: i })}
                                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                                  draft.correct_option === i
                                    ? "border-accent-success bg-accent-success"
                                    : "border-border hover:border-accent-success/50"
                                }`}
                              />
                              <Input
                                value={opt}
                                onChange={(e) => {
                                  const next = [...draft.options];
                                  next[i] = e.target.value;
                                  setDraft({ ...draft, options: next });
                                }}
                                placeholder={`Option ${["A", "B", "C", "D"][i]}`}
                                className="bg-bg-surface border-border"
                              />
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-1">
                            <p className="text-xs text-text-muted">
                              Circle = correct answer (index {draft.correct_option})
                            </p>
                            <span className="text-xs font-mono px-2 py-0.5 bg-bg-surface border border-border rounded text-text-secondary">
                              1 point (auto)
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {isDraftCode && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Language</Label>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {LANGUAGES.map((lang) => (
                                <button
                                  key={lang}
                                  onClick={() => setDraft({ ...draft, language: lang })}
                                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                                    draft.language === lang
                                      ? "border-accent-info bg-accent-info/10 text-accent-info"
                                      : "border-border text-text-muted hover:border-border/60"
                                  }`}
                                >
                                  {lang}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label htmlFor="code-max-score">Max Score (Points)</Label>
                            <Input
                              id="code-max-score"
                              type="number"
                              min={1}
                              max={100}
                              value={draft.max_score ?? 10}
                              onChange={(e) =>
                                setDraft({ ...draft, max_score: parseInt(e.target.value) || 1 })
                              }
                              className="mt-1 bg-bg-surface border-border font-mono w-32 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="mb-1 block">Starter Code (optional)</Label>
                          <div className="border border-border rounded overflow-hidden" style={{ height: 160 }}>
                            <Editor
                              height="160px"
                              language={draft.language}
                              value={draft.starter_code}
                              onChange={(val) => setDraft({ ...draft, starter_code: val || "" })}
                              theme="vs-dark"
                              options={{
                                minimap: { enabled: false },
                                fontSize: 12,
                                lineNumbers: "off",
                                scrollBeyondLastLine: false,
                                padding: { top: 8 },
                              }}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={handleSaveQuestion}
                        disabled={saving}
                        className="bg-accent-info hover:bg-accent-info/90"
                        size="sm"
                      >
                        {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                        Add to Set {activeSet}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1.5" />
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    className="bg-accent-info hover:bg-accent-info/90"
                    disabled={totalQuestions === 0}
                  >
                    Review &amp; Start
                    <ChevronRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Start ── */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-text-primary">Review &amp; Start</h2>

                <div className="p-4 bg-bg-base border border-border rounded-lg space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Title</span>
                    <span className="font-medium text-text-primary">{settings.title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Type</span>
                    <span className="font-mono text-text-primary uppercase text-xs">
                      {settings.question_type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Sets</span>
                    <span className="font-mono text-text-primary">{settings.num_sets}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Duration</span>
                    <span className="font-mono text-text-primary">
                      {settings.time_limit_minutes} minutes
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Auto-lock after</span>
                    <span className="font-mono text-text-primary">
                      {settings.violation_limit} violation(s)
                    </span>
                  </div>
                  <div className="border-t border-border pt-3">
                    {Array.from({ length: settings.num_sets }, (_, i) => i + 1).map((s) => (
                      <div key={s} className="flex items-center justify-between">
                        <span className="text-text-secondary">Set {s}</span>
                        <span className="font-mono text-text-primary">
                          {setQuestions[s]?.length ?? 0} question(s)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-accent-warning/5 border border-accent-warning/20 rounded-lg text-xs text-text-secondary">
                  <strong className="text-accent-warning">Note:</strong> Once started, sets will be
                  distributed to students in roll-number order with an adjacency guard (no two
                  adjacent roll numbers get the same set). The timer starts immediately for all students.
                </div>

                <div className="flex gap-2 items-center">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4 mr-1.5" />
                    Back to Questions
                  </Button>
                  {!examOpened ? (
                    <Button
                      data-tour="teacher-open-exam"
                      onClick={handleOpenExam}
                      disabled={saving}
                      className="bg-accent-info hover:bg-accent-info/90 text-white"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Open Exam
                    </Button>
                  ) : (
                    <StatusBadge status="waiting_room" />
                  )}
                  <Button
                    data-tour="teacher-start-exam-now"
                    onClick={handleStartExam}
                    disabled={saving}
                    className="bg-accent-success hover:bg-accent-success/90"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Start Exam Now
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        ) : (
          /* Manage Exams List Tab */
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border bg-bg-elevated">
              <h3 className="text-sm font-semibold text-text-primary">
                My Exams List
              </h3>
            </div>

            {loadingExams ? (
              <div className="divide-y divide-border">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : myExams.length === 0 ? (
              <div className="p-12 text-center text-text-muted italic">
                No exams created yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {myExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="p-4 flex items-center justify-between hover:bg-bg-elevated transition-colors"
                  >
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-text-primary">
                        {exam.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span className="capitalize font-mono text-[10px] border border-border bg-bg-base px-1.5 py-0.5 rounded text-text-muted">
                          Type: {exam.question_type}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-text-muted" />
                          {exam.time_limit_minutes} mins
                        </span>
                        <span>•</span>
                        <span>Created: {new Date(exam.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={exam.status} />
                      <Button
                        onClick={() => handleExamClick(exam)}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                      >
                        Manage / View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
