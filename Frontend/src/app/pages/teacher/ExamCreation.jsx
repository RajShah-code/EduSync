import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { getSocket } from "../../store/socket";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { StatusBadge } from "../../components/StatusBadge";
import { Skeleton } from "../../components/ui/skeleton";
import { Textarea } from "../../components/ui/textarea";
import { cn } from "../../components/ui/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../../components/ui/sheet";
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
import { IconPlus as Plus, IconTrash as Trash2, IconChevronRight as ChevronRight, IconChevronLeft as ChevronLeft, IconCode as Code2, IconSquareCheck as CheckSquare, IconCheckbox as Checkbox, IconArrowBarBoth as ArrowBarBoth, IconPlayerPlay as Play, IconLoader2 as Loader2, IconCheck as Check, IconCircleCheck as CircleCheck, IconSearch as Search, IconAlertTriangle as AlertTriangle, IconAdjustmentsHorizontal as SlidersHorizontal, IconBroadcast as Radio, IconChartBar as BarChart2, IconPencil as Edit3, IconUsers as Users, IconX as X, IconSquarePlus as SquarePlus, IconChalkboard as Chalkboard, IconAlarm as Alarm, IconFileStack as FileStack, IconLayoutGrid as LayoutGrid, IconNotes as Notes, IconFileCode as FileCode, IconFileCheck as FileCheck, IconCircleDashedNumber1 as CircleDashedNumber1, IconCircleDashedNumber2 as CircleDashedNumber2, IconCircleDashedNumber3 as CircleDashedNumber3, IconCircleNumber1 as CircleNumber1, IconCircleNumber2 as CircleNumber2, IconCircleNumber3 as CircleNumber3, IconPencilQuestion as PencilQuestion, IconCircleDashedCheck as CircleDashedCheck, IconArrowsSort as ArrowsSort, IconCalendarClock as CalendarClock } from "@tabler/icons-react";
import { toast } from "sonner";
import PageShell from "../../components/PageShell";

const QUESTION_TYPES = [
  { value: "mcq", label: "MCQ Only", icon: Checkbox, desc: "Multiple choice questions only" },
  { value: "code", label: "Code Only", icon: Code2, desc: "Code submission questions only" },
  { value: "both", label: "Both", icon: ArrowBarBoth, desc: "Mix of MCQ and code questions" },
];

const LANGUAGES = ["javascript", "python", "java", "cpp", "c"];

const SETUP_STEPS = [
  { id: 1, label: "Exam Settings", desc: "Core configuration", dashedIcon: CircleDashedNumber1, activeIcon: CircleNumber1 },
  { id: 2, label: "Questions", desc: "Add exam content", dashedIcon: CircleDashedNumber2, activeIcon: CircleNumber2 },
  { id: 3, label: "Review & Start", desc: "Confirm and launch", dashedIcon: CircleDashedNumber3, activeIcon: CircleNumber3 },
];

const MANAGE_FILTERS = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "draft", label: "Draft", icon: Notes },
  { key: "scheduled", label: "Scheduled", icon: Alarm },
  { key: "active", label: "Active", icon: FileCode },
  { key: "ended", label: "Ended", icon: FileCheck },
];

const MANAGE_PAGE_SIZES = [5, 10, 20, "All"];

// Groups the two pre-launch exam statuses (draft, waiting_room) under one
// "Draft" filter bucket — StatusBadge still tells them apart on the card
// itself, this is just the coarser filter grain the wizard needs.
function manageFilterKeyOf(status) {
  if (status === "draft" || status === "waiting_room") return "draft";
  return status;
}

// "Scheduled" isn't a status — it's a draft with a future auto-open time.
// Once the cron flips it to waiting_room this returns false again and the row
// falls back into normal status-based filtering.
function isScheduledExam(exam) {
  return (
    exam.status === "draft" &&
    !!exam.scheduled_at &&
    new Date(exam.scheduled_at).getTime() > Date.now()
  );
}

// Local wall-clock -> the value shape <input type="datetime-local"> expects
// ("YYYY-MM-DDTHH:mm"). Used for the picker's `min` and nothing else.
function toLocalInputValue(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

// Small-caps breadcrumb + display heading used at the top of each wizard
// step's content card — the one piece of the reference's visual language
// that lives inside the step card rather than the page-level header.
function StepHeader({ index, total, title, subtitle }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-[0.12em]">
        <span>Exam Creation Wizard</span>
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
        <span className="text-accent-500">Step {index} of {total}</span>
      </div>
      <h2 className="text-xl font-bold text-text-primary tracking-[-0.01em] mt-1.5">{title}</h2>
      {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
    </div>
  );
}

// One dense row per exam for the Manage Exams list — the same <table> row
// idiom used by Attendance.jsx (px-4 py-2.5 cells, divide-y rows, hover
// tint), laid out horizontally instead of as a card. Fields are limited to
// what /my-exams actually returns (plus class_names from the Task B join);
// no fabricated candidate/violation counts. The whole row is the click
// target — same contextual action per status that handleExamClick routes.
function ExamManageRow({ exam, onOpen }) {
  const isActive = exam.status === "active";
  const isEnded = exam.status === "ended";
  const isWaiting = exam.status === "waiting_room";

  const actionLabel = isActive ? "Monitor Live" : isEnded ? "View Results" : isWaiting ? "Manage Exam" : "Edit Draft";
  const ActionIcon = isActive ? Radio : isEnded ? BarChart2 : isWaiting ? Users : Edit3;

  const classNames = Array.isArray(exam.class_names) ? exam.class_names.filter(Boolean) : [];
  const classLabel = classNames.join(", ");
  const scheduled = isScheduledExam(exam);

  const open = () => onOpen(exam);

  return (
    <tr
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${actionLabel}: ${exam.title}`}
      className={cn(
        "cursor-pointer transition-colors duration-150 hover:bg-bg-elevated focus-visible:outline-none focus-visible:bg-bg-elevated",
        isActive && "bg-accent-live/5"
      )}
    >
      {/* Status first — the most decision-relevant field */}
      <td className="px-4 py-2.5">
        <StatusBadge status={exam.status} />
      </td>
      <td className="px-4 py-2.5 max-w-[220px]">
        <span className="block truncate text-sm font-medium text-text-primary" title={exam.title}>
          {exam.title}
        </span>
      </td>
      <td className="px-4 py-2.5 max-w-[180px]">
        {classLabel ? (
          <span className="block truncate text-sm text-text-secondary" title={classLabel}>
            {classLabel}
          </span>
        ) : (
          <span className="text-sm text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-block text-[10px] tnum font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-[var(--radius-sm)] border border-border bg-bg-base text-text-muted whitespace-nowrap">
          {exam.question_type}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm tnum text-text-secondary whitespace-nowrap">
        {exam.time_limit_minutes}m
      </td>
      <td className="px-4 py-2.5 text-sm tnum text-text-secondary whitespace-nowrap">
        {exam.num_sets} set{exam.num_sets === 1 ? "" : "s"}
      </td>
      {/* Created — or, for a scheduled draft, the auto-open time with the
          created date kept underneath so nothing is hidden. */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {scheduled ? (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1 text-xs tnum font-medium text-accent-warning">
              <Alarm className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              {new Date(exam.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </span>
            <span className="text-[11px] tnum text-text-muted">
              created {new Date(exam.created_at).toLocaleDateString()}
            </span>
          </div>
        ) : (
          <span className="text-sm tnum text-text-secondary">
            {new Date(exam.created_at).toLocaleDateString()}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs whitespace-nowrap",
            isActive
              ? "bg-accent-live hover:bg-accent-live/90 text-white"
              : "bg-transparent border border-border text-text-primary hover:bg-bg-surface-3"
          )}
        >
          <ActionIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
          {actionLabel}
        </Button>
      </td>
    </tr>
  );
}

// Pagination footer bound to the Manage Exams table. A rows-per-page
// segmented control (default 5) plus a compact prev/next pager. Reuses the
// app's segment/chip idiom and the global .btn-press micro-interaction so
// controls respond on pointer-down; .btn-press is reduced-motion-safe in
// theme.css. The pager cluster hides itself when there's only one page.
function ManagePaginationBar({
  total,
  rangeStart,
  rangeEnd,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const multiPage = pageCount > 1;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.08em]">Rows</span>
        <div className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-bg-base p-0.5">
          {MANAGE_PAGE_SIZES.map((size) => {
            const selected = pageSize === size;
            return (
              <button
                key={String(size)}
                type="button"
                onClick={() => onPageSizeChange(size)}
                aria-pressed={selected}
                className={cn(
                  "btn-press tnum px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors duration-150",
                  selected
                    ? "bg-bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="tnum text-xs text-text-secondary">
          {total === 0 ? "0 of 0" : `${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        {multiPage && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className="btn-press inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] border border-border text-text-secondary transition-colors duration-150 hover:text-text-primary hover:bg-bg-surface-3 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <span className="tnum text-xs text-text-secondary min-w-[4.5rem] text-center">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
              aria-label="Next page"
              className="btn-press inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] border border-border text-text-secondary transition-colors duration-150 hover:text-text-primary hover:bg-bg-surface-3 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The add/update question endpoints can return `options` as a JSON string
// (JSONB round-trip), while getExamById returns it already parsed. Normalise
// on the way into state so every consumer (the Step 2 row, openEditDraft) can
// treat options as an array.
function withParsedOptions(q) {
  if (!q || q.options == null || Array.isArray(q.options)) return q;
  if (typeof q.options === "string") {
    try {
      return { ...q, options: JSON.parse(q.options) };
    } catch {
      return { ...q, options: [] };
    }
  }
  return q;
}

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
  description: "",
  language: "python",
  max_score: 10,
});

export function ExamCreation() {
  const context = useOutletContext();
  const sessionInfo = context?.sessionInfo ?? null;
  const navigate = useNavigate();

  // The page is the Manage Exams list; the creation/edit wizard lives in a
  // right-side Sheet ("drawer") opened from the header or a row action.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [drawerIsCreate, setDrawerIsCreate] = useState(true); // header label only

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 3 — "Schedule for Later" sub-panel
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");

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
  const [classSearch, setClassSearch] = useState("");
  const [waitingCount, setWaitingCount] = useState(0);

  // Fetches the live waiting-room count once opened (initial load / when
  // revisiting via Manage Exams) — live updates after that come from
  // exam:waiting_count_update below.
  useEffect(() => {
    if (!examOpened || !examId) return;
    let active = true;
    const fetchWaitingCount = async () => {
      try {
        const token = localStorage.getItem("edusync_token");
        const res = await fetch(`${API_BASE_URL}/exams/${examId}/waiting-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && active) {
          const data = await res.json();
          setWaitingCount(data.count ?? 0);
        }
      } catch (err) {
        console.error("Failed to fetch waiting-room count:", err);
      }
    };
    fetchWaitingCount();
    return () => { active = false; };
  }, [examOpened, examId]);

  useEffect(() => {
    if (!examId) return;
    const socket = getSocket();
    if (!socket) return;
    const handleWaitingCount = ({ examId: eId, count }) => {
      if (parseInt(eId) !== parseInt(examId)) return;
      setWaitingCount(count);
    };
    socket.on("exam:waiting_count_update", handleWaitingCount);
    return () => socket.off("exam:waiting_count_update", handleWaitingCount);
  }, [examId]);

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

  const [myExams, setMyExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [manageFilter, setManageFilter] = useState("all");
  const [manageSearch, setManageSearch] = useState("");
  const [manageSort, setManageSort] = useState("newest"); // "newest" | "oldest" — by created_at
  const [managePageSize, setManagePageSize] = useState(5); // 5 | 10 | 20 | "All"
  const [managePage, setManagePage] = useState(1); // 1-indexed

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

  // The list is the page now — load it on mount, and refresh it whenever the
  // wizard drawer closes (a new draft may have been created / edited).
  useEffect(() => {
    fetchMyExams();
  }, []);

  // Any narrowing of the list (status filter, search, sort, page size) drops
  // back to page 1 so the user never lands on a now-empty page.
  useEffect(() => {
    setManagePage(1);
  }, [manageFilter, manageSearch, manageSort, managePageSize]);

  // ── Wizard drawer open/close ──────────────────────────────────────────────
  const resetWizard = () => {
    setStep(1);
    setSettings({ title: "", question_type: "mcq", num_sets: 2, time_limit_minutes: 30, violation_limit: 3 });
    setExamId(null);
    setSelectedClassIds([]);
    setExamOpened(false);
    setWaitingCount(0);
    setSetQuestions({});
    setActiveSet(1);
    setDraft(null);
    setScheduleMode(false);
    setScheduledAtLocal("");
    setClassSearch("");
  };

  const openCreateDrawer = () => {
    resetWizard();
    setDrawerIsCreate(true);
    setDrawerOpen(true);
  };

  // "Unsaved work" that a silent close would lose: a half-typed question, or a
  // brand-new exam (step 1, not yet POSTed) with a title/classes entered.
  // Once the draft exam exists on the server (step 2+), questions are persisted
  // on add and closing just exits — same as the existing "Save as Draft".
  const wizardIsDirty = () => {
    if (draft) return true;
    if (step === 1 && !examId && (settings.title.trim() || selectedClassIds.length > 0)) return true;
    return false;
  };

  const closeDrawer = () => {
    setConfirmCloseOpen(false);
    setDrawerOpen(false);
    fetchMyExams();
  };

  // Radix calls this with `false` on X / overlay / Escape. Block the close and
  // raise the confirm dialog if there's unsaved work; otherwise close cleanly.
  const handleDrawerOpenChange = (open) => {
    if (open) {
      setDrawerOpen(true);
      return;
    }
    if (wizardIsDirty()) {
      setConfirmCloseOpen(true);
      return;
    }
    closeDrawer();
  };

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
        setWaitingCount(0);
        setDraft(null);
        setScheduleMode(false);
        setScheduledAtLocal("");

        // Reconstruct setQuestions: { [setNumber]: questions[] }
        const questionsMap = {};
        for (let i = 1; i <= data.exam.num_sets; i++) {
          questionsMap[i] = [];
        }
        for (const s of data.sets) {
          questionsMap[s.set_number] = (s.questions || []).map(withParsedOptions);
        }
        setSetQuestions(questionsMap);
        setActiveSet(1);

        // Land on Step 3 (Review & Start) inside the drawer
        setStep(3);
        setDrawerIsCreate(false);
        setDrawerOpen(true);
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
  // Draft form for the question being built — rendered as a modal (see
  // "Question Editor Dialog" below), matching the type-aware modal pattern
  // already established for Task Assignment.
  const [draft, setDraft] = useState(null); // null means dialog is closed

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
      if (!draft.description?.trim()) return toast.error("Description is required");
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
        [activeSet]: [...(prev[activeSet] || []), withParsedOptions(data.question)],
      }));
      setDraft(null);
      toast.success("Question added");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reopen the Question Editor Dialog pre-filled for an existing question.
  // `draft.id` present == edit mode (see handleUpdateQuestion / the dialog).
  const openEditDraft = (q) => {
    setDraft({
      id: q.id,
      type: q.type,
      question_text: q.question_text || "",
      description: q.description || "",
      language: q.language || "python",
      max_score: q.max_score ?? (q.type === "code" ? 10 : 1),
      options: Array.isArray(q.options)
        ? [...q.options, "", "", "", ""].slice(0, 4)
        : ["", "", "", ""],
      correct_option: q.correct_option ?? 0,
    });
  };

  const handleUpdateQuestion = async () => {
    if (!draft || !draft.id) return;
    if (!draft.question_text.trim()) return toast.error("Question text is required");
    if (draft.type === "mcq" && draft.options.some((o) => !o.trim())) {
      return toast.error("All 4 options are required");
    }
    if (draft.type === "code") {
      if (!draft.description?.trim()) return toast.error("Description is required");
      if (!draft.language) return toast.error("Select a language");
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/questions/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setSetQuestions((prev) => ({
        ...prev,
        [activeSet]: (prev[activeSet] || []).map((q) => (q.id === draft.id ? withParsedOptions(data.question) : q)),
      }));
      setDraft(null);
      toast.success("Question updated");
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

  // Delete goes to the server first so the client list can't silently desync
  // from the DB; local state is only trimmed on a 2xx.
  const handleDeleteQuestion = async (setNum, q) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/questions/${q.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to delete question");
      deleteQuestionLocally(setNum, q.id);
      toast.success("Question deleted");
    } catch (err) {
      toast.error(err.message);
    }
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

  // ── Step 3: Schedule for Later (Option A) ─────────────────────────────────
  // Sets a future scheduled_at; the exam stays a draft. examScheduleCron opens
  // the waiting room automatically at that time; the teacher still clicks
  // "Start Exam Now" themselves. Client rejects past times before the call,
  // mirroring the server's own future-only check.
  const handleScheduleExam = async () => {
    const when = new Date(scheduledAtLocal);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return toast.error("Pick a date and time in the future");
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduled_at: when.toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success(`Scheduled — the waiting room opens automatically at ${when.toLocaleString()}`);
      setDrawerOpen(false);
      fetchMyExams();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 2 "Save as Draft" — questions are already persisted on add, so this
  // just exits the drawer (no unsaved-changes prompt).
  const handleSaveDraftAndClose = () => {
    setDrawerOpen(false);
    fetchMyExams();
  };

  const totalQuestions = Object.values(setQuestions).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  const isDraftMcq = draft?.type === "mcq";
  const isDraftCode = draft?.type === "code";

  const manageFilterCounts = {
    all: myExams.length,
    draft: myExams.filter((e) => manageFilterKeyOf(e.status) === "draft").length,
    scheduled: myExams.filter(isScheduledExam).length,
    active: myExams.filter((e) => e.status === "active").length,
    ended: myExams.filter((e) => e.status === "ended").length,
  };
  const filteredMyExams =
    manageFilter === "all"
      ? myExams
      : manageFilter === "scheduled"
      ? myExams.filter(isScheduledExam)
      : myExams.filter((e) => manageFilterKeyOf(e.status) === manageFilter);

  // Search (title + class name) and sort (created_at) layer on top of the
  // status-filtered list — client-side over ~30 rows, so no debounce.
  const manageSearchQuery = manageSearch.trim().toLowerCase();
  const displayedExams = filteredMyExams
    .filter((e) => {
      if (!manageSearchQuery) return true;
      const inTitle = (e.title || "").toLowerCase().includes(manageSearchQuery);
      const inClass =
        Array.isArray(e.class_names) &&
        e.class_names.some((n) => (n || "").toLowerCase().includes(manageSearchQuery));
      return inTitle || inClass;
    })
    .sort((a, b) => {
      const diff = new Date(b.created_at) - new Date(a.created_at);
      return manageSort === "newest" ? diff : -diff;
    });

  // Pagination — slice the searched/sorted list. "All" collapses to a single
  // page; managePageSafe re-clamps in the frame before the reset effect runs
  // (e.g. right after a filter shrinks the result set).
  const managePageCount =
    managePageSize === "All"
      ? 1
      : Math.max(1, Math.ceil(displayedExams.length / managePageSize));
  const managePageSafe = Math.min(Math.max(1, managePage), managePageCount);
  const managePerPage = managePageSize === "All" ? displayedExams.length : managePageSize;
  const pagedExams =
    managePageSize === "All"
      ? displayedExams
      : displayedExams.slice(
          (managePageSafe - 1) * managePageSize,
          managePageSafe * managePageSize
        );
  const manageRangeStart = displayedExams.length === 0 ? 0 : (managePageSafe - 1) * managePerPage + 1;
  const manageRangeEnd =
    managePageSize === "All"
      ? displayedExams.length
      : Math.min(managePageSafe * managePageSize, displayedExams.length);

  const filteredClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(classSearch.trim().toLowerCase())
  );

  return (
    <PageShell>
      {/* Header — the page is the Manage Exams list; "Create Exam" opens the
          wizard in a right-side drawer. */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">Exam Manager</h1>
          <p className="text-sm text-text-muted mt-0.5 tnum">
            {myExams.length} exam{myExams.length === 1 ? "" : "s"}
          </p>
        </div>

        <Button onClick={openCreateDrawer} className="flex-shrink-0 bg-accent-600 hover:bg-accent-600/90 text-white">
          <SquarePlus className="w-4 h-4" strokeWidth={1.75} />
          Create Exam
        </Button>
      </div>

      {/* ── Wizard drawer — reuses the existing Step 1 → 2 → 3 flow; the
          two-column grid below collapses to one column at this width because
          the drawer never reaches the `lg` breakpoint. ── */}
      <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[680px] p-0 gap-0 bg-bg-base border-border flex flex-col"
        >
          <SheetHeader className="border-b border-border p-4 shrink-0">
            <SheetTitle className="text-text-primary">
              {drawerIsCreate ? "Create Exam" : `Manage Exam #${examId}`}
            </SheetTitle>
            <SheetDescription className="text-text-muted">
              {step === 1
                ? "Configure the core settings, then add questions."
                : step === 2
                ? "Add MCQ or code questions to each set."
                : "Review, then open the waiting room or schedule it."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
        {/* Single column inside the drawer — the step content, then the
            Parameters/Summary + Setup Progress sidebar stacked below it
            (the old two-column grid was viewport-width-driven and does not
            fit a drawer). */}
        <div className="flex flex-col gap-6">
          {/* Left: step content */}
          <div className="relative bg-bg-surface border border-border rounded-[var(--radius-lg)] p-6 pb-0 flex flex-col">
            {/* ── STEP 1: Settings ── */}
            {step === 1 && (
              <div className="space-y-6 pb-6">
                <StepHeader
                  index={1}
                  total={3}
                  title="Exam Settings"
                  subtitle="Configure the core parameters and structural elements of your new assessment session."
                />

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
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2">
                    <PencilQuestion className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />
                    Question Format
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {QUESTION_TYPES.map(({ value, label, icon: Icon, desc }) => {
                      const isSelected = settings.question_type === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSettings({ ...settings, question_type: value })}
                          aria-pressed={isSelected}
                          className={`relative p-3.5 rounded-[var(--radius-md)] border text-left transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.98] ${
                            isSelected
                              ? "border-accent-500/60 bg-accent-500/10"
                              : "border-border bg-bg-base hover:border-border-hover"
                          }`}
                        >
                          <span
                            className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors duration-150 ${
                              isSelected ? "border-accent-500" : "border-border"
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-accent-500" />}
                          </span>
                          <Icon
                            className={`w-5 h-5 mb-1.5 ${
                              isSelected ? "text-accent-500" : "text-text-muted"
                            }`}
                            strokeWidth={1.75}
                          />
                          <div
                            className={`text-sm font-medium pr-4 ${
                              isSelected ? "text-accent-500" : "text-text-primary"
                            }`}
                          >
                            {label}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5 pr-4">{desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <Chalkboard className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />
                      Target Classes
                    </h3>
                    <span className="text-[10px] text-text-muted uppercase tracking-[0.08em]">
                      Select multiple
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 p-3 bg-bg-base border border-border rounded-[var(--radius-md)] min-h-[52px]">
                    {selectedClassIds.length === 0 && (
                      <span className="text-xs text-text-muted italic self-center">
                        No classes selected yet
                      </span>
                    )}
                    {classes
                      .filter((c) => selectedClassIds.includes(c.id))
                      .map((cls) => (
                        <span
                          key={cls.id}
                          className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-[var(--radius-pill)] bg-accent-500/15 border border-accent-500/30 text-accent-500 text-xs font-medium"
                        >
                          {cls.name}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedClassIds(selectedClassIds.filter((id) => id !== cls.id))
                            }
                            aria-label={`Remove ${cls.name}`}
                            className="hover:text-accent-critical transition-colors"
                          >
                            <X className="w-3.5 h-3.5" strokeWidth={2.25} />
                          </button>
                        </span>
                      ))}
                  </div>

                  <div className="relative mt-2">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-muted pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <Input
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Search for more classes..."
                      className="pl-9 bg-bg-base border-border"
                    />
                  </div>

                  {filteredClasses.filter((c) => !selectedClassIds.includes(c.id)).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {filteredClasses
                        .filter((c) => !selectedClassIds.includes(c.id))
                        .map((cls) => (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => setSelectedClassIds([...selectedClassIds, cls.id])}
                            className="inline-flex items-center gap-1 pl-2.5 pr-3 py-1 rounded-[var(--radius-pill)] border border-border text-text-secondary text-xs hover:border-accent-500/50 hover:text-accent-500 transition-colors duration-150"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
                            {cls.name}
                          </button>
                        ))}
                    </div>
                  )}
                  {classes.length === 0 && (
                    <p className="text-xs text-text-muted mt-1">No classes found. Please create classes first.</p>
                  )}
                </div>
              </div>
            )}

            {/* Sticky footer CTA — pins to the bottom of the viewport while
                the step content scrolls above it, matching the reference's
                always-reachable primary action. */}
            {step === 1 && (
              <div className="sticky bottom-0 -mx-6 px-6 py-4 mt-2 bg-bg-surface border-t border-border rounded-b-[var(--radius-lg)]">
                <Button
                  onClick={handleCreateExam}
                  disabled={saving || !settings.title.trim()}
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.75} />
                  ) : (
                    <ChevronRight className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  )}
                  Create &amp; Continue to Questions
                </Button>
              </div>
            )}

            {/* ── STEP 2: Question Builder ── */}
            {step === 2 && (
              <div className="space-y-5 pb-6">
                <StepHeader
                  index={2}
                  total={3}
                  title="Question Builder"
                  subtitle={`Add MCQ or code questions to each set — Exam #${examId}`}
                />

                {/* Set switcher — a genuinely fixed, parallel set of items
                    (Set 1, Set 2, ...), so this is the one place in Step 2
                    where the browser-tab pattern applies directly. */}
                <div
                  className="h-11 px-1 bg-bg-surface-3/40 border-b border-border flex items-end gap-1 overflow-x-auto flex-shrink-0"
                  role="tablist"
                  aria-label="Question sets"
                >
                  {Array.from({ length: settings.num_sets }, (_, i) => i + 1).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={activeSet === s}
                      onClick={() => { setActiveSet(s); setDraft(null); }}
                      className={`flex items-center gap-1.5 px-3.5 h-9 rounded-t-[var(--radius-md)] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-150 ${
                        activeSet === s
                          ? "bg-bg-surface text-text-primary"
                          : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                      }`}
                    >
                      Set {s}
                      {(setQuestions[s]?.length ?? 0) > 0 && (
                        <span className="tnum text-[10px] px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-500">
                          {setQuestions[s].length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Question list for active set — the real, persisted
                    questions, each editable (reopens the dialog pre-filled)
                    and deletable (server DELETE, then local trim). */}
                <div className="space-y-2">
                  {(setQuestions[activeSet] || []).map((q, idx) => {
                    const QIcon = q.type === "code" ? Code2 : CheckSquare;
                    return (
                      <div
                        key={q.id}
                        className="flex items-start gap-3 p-3 bg-bg-base border border-border rounded-[var(--radius-md)]"
                      >
                        <span className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] border border-border bg-bg-surface text-accent-500">
                          <QIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {idx + 1}. {q.question_text}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5 tnum capitalize">
                            {q.type === "code"
                              ? `${q.language} · ${q.max_score} mark${q.max_score === 1 ? "" : "s"}`
                              : `${q.options?.length ?? 0} options · ${q.max_score ?? 1} mark · correct: ${q.options?.[q.correct_option] ?? "—"}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditDraft(q)}
                            className="text-text-muted hover:text-accent-500 transition-colors p-1"
                            title="Edit question"
                            aria-label={`Edit question ${idx + 1}: ${q.question_text}`}
                          >
                            <Edit3 className="w-[18px] h-[18px]" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(activeSet, q)}
                            className="text-text-muted hover:text-accent-critical transition-colors p-1"
                            title="Delete question"
                            aria-label={`Delete question ${idx + 1}: ${q.question_text}`}
                          >
                            <Trash2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(setQuestions[activeSet] || []).length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-border rounded-[var(--radius-md)] text-text-muted text-sm">
                      No questions yet for Set {activeSet}
                    </div>
                  )}
                </div>

                {/* Add question — opens the type-aware Question Editor dialog,
                    same modal-shell pattern used for Task Assignment. */}
                <div className="flex gap-2">
                  {(settings.question_type === "mcq" || settings.question_type === "both") && (
                    <Button variant="outline" size="sm" onClick={() => openNewDraft("mcq")}>
                      <Plus className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      Add MCQ
                    </Button>
                  )}
                  {(settings.question_type === "code" || settings.question_type === "both") && (
                    <Button variant="outline" size="sm" onClick={() => openNewDraft("code")}>
                      <Plus className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      Add Code
                    </Button>
                  )}
                </div>

                {/* Navigation */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    className="ml-auto"
                    onClick={handleSaveDraftAndClose}
                    title="Questions are already saved — this just closes the wizard, leaving the exam in Draft."
                  >
                    <CircleDashedCheck className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    Save as Draft
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={totalQuestions === 0}
                  >
                    Review &amp; Start
                    <ChevronRight className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Start ── */}
            {step === 3 && (
              <div className="space-y-5 pb-6">
                <StepHeader
                  index={3}
                  total={3}
                  title="Review & Start"
                  subtitle="Confirm your exam configuration before launching it to students."
                />

                <div className="p-4 bg-bg-base border border-border rounded-[var(--radius-md)] space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Title</span>
                    <span className="font-medium text-text-primary">{settings.title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Type</span>
                    <span className="tnum text-text-primary uppercase text-xs">
                      {settings.question_type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Sets</span>
                    <span className="tnum text-text-primary">{settings.num_sets}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Duration</span>
                    <span className="tnum text-text-primary">
                      {settings.time_limit_minutes} minutes
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Auto-lock after</span>
                    <span className="tnum text-text-primary">
                      {settings.violation_limit} violation(s)
                    </span>
                  </div>
                  <div className="border-t border-border pt-3 space-y-1">
                    {Array.from({ length: settings.num_sets }, (_, i) => i + 1).map((s) => (
                      <div key={s} className="flex items-center justify-between">
                        <span className="text-text-secondary">Set {s}</span>
                        <span className="tnum text-text-primary">
                          {setQuestions[s]?.length ?? 0} question(s)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-accent-warning/5 border border-accent-warning/20 rounded-[var(--radius-md)] text-xs text-text-secondary">
                  <strong className="text-accent-warning">Note:</strong> Once started, sets will be
                  distributed to students in roll-number order with an adjacency guard (no two
                  adjacent roll numbers get the same set). The timer starts immediately for all students.
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    Back to Questions
                  </Button>
                  {!examOpened ? (
                    <>
                      <Button
                        data-tour="teacher-open-exam"
                        onClick={handleOpenExam}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.75} /> : <CircleCheck className="w-[18px] h-[18px]" strokeWidth={1.75} />}
                        Open Exam
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setScheduleMode((m) => !m)}
                        aria-pressed={scheduleMode}
                      >
                        <CalendarClock className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        Schedule for Later
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <StatusBadge status="waiting_room" />
                      <span className="flex items-center gap-1 text-xs text-text-secondary tnum">
                        <Users className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
                        {waitingCount} connected
                      </span>
                    </div>
                  )}
                  <Button
                    data-tour="teacher-start-exam-now"
                    onClick={handleStartExam}
                    disabled={saving}
                    className="bg-accent-success hover:bg-accent-success/90 text-white"
                  >
                    {saving ? (
                      <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Play className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    )}
                    Start Exam Now
                  </Button>
                </div>

                {/* Schedule for Later (Option A) — sets a future auto-open
                    time; the exam stays a draft and the teacher still starts
                    it manually. Past times are rejected here and on the
                    server. */}
                {!examOpened && scheduleMode && (
                  <div className="p-3 bg-bg-base border border-border rounded-[var(--radius-md)] space-y-2">
                    <Label htmlFor="exam-schedule-at" className="text-xs flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0 text-accent-500" strokeWidth={1.75} />
                      Waiting room opens automatically at
                    </Label>
                    <Input
                      id="exam-schedule-at"
                      type="datetime-local"
                      value={scheduledAtLocal}
                      min={toLocalInputValue(new Date(Date.now() + 60000))}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      className="bg-bg-surface border-border tnum"
                    />
                    <div className="flex gap-2 pt-0.5">
                      <Button size="sm" onClick={handleScheduleExam} disabled={saving || !scheduledAtLocal}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <Check className="w-4 h-4" strokeWidth={2} />}
                        Confirm Schedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setScheduleMode(false); setScheduledAtLocal(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      You still click "Start Exam Now" yourself once students have joined.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: live parameters (step 1, editable) / summary (steps 2–3,
              read-only) + setup progress — a sequential authoring flow, not
              a set of parallel items, so progress stays step-based rather
              than becoming a tab strip. */}
          <div className="space-y-4">
            {step === 1 ? (
              <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] space-y-4">
                <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.08em] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-accent-500" strokeWidth={1.75} />
                  Parameters
                </h3>
                <div>
                  <Label htmlFor="time-limit" className="text-xs flex items-center gap-1.5">
                    <Alarm className="w-3.5 h-3.5 shrink-0" />
                    Duration (min)
                  </Label>
                  <Input
                    id="time-limit"
                    type="number"
                    min={1}
                    value={settings.time_limit_minutes}
                    onChange={(e) =>
                      setSettings({ ...settings, time_limit_minutes: parseInt(e.target.value) || 30 })
                    }
                    className="mt-1 bg-bg-base border-border tnum"
                  />
                </div>
                <div>
                  <Label htmlFor="num-sets" className="text-xs flex items-center gap-1.5">
                    <FileStack className="w-3.5 h-3.5 shrink-0" />
                    Question Sets
                  </Label>
                  <Input
                    id="num-sets"
                    type="number"
                    min={1}
                    max={10}
                    value={settings.num_sets}
                    onChange={(e) =>
                      setSettings({ ...settings, num_sets: parseInt(e.target.value) || 1 })
                    }
                    className="mt-1 bg-bg-base border-border tnum"
                  />
                  <p className="text-[11px] text-text-muted mt-1">Different versions of the exam</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="violation-limit" className="text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Violation Limit
                    </Label>
                    {settings.violation_limit <= 2 ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-accent-warning uppercase tracking-wide">
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.25} />
                        High Sensitivity
                      </span>
                    ) : settings.violation_limit >= 6 ? (
                      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                        Lenient
                      </span>
                    ) : null}
                  </div>
                  <Input
                    id="violation-limit"
                    type="number"
                    min={1}
                    max={10}
                    value={settings.violation_limit}
                    onChange={(e) =>
                      setSettings({ ...settings, violation_limit: parseInt(e.target.value) || 3 })
                    }
                    className="mt-1 bg-bg-base border-border tnum"
                  />
                  <p className="text-[11px] text-text-muted mt-1">Auto-locks after this many</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] text-sm space-y-2">
                <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.08em] mb-2">
                  Summary
                </h3>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Type</span>
                  <span className="tnum text-text-primary uppercase text-xs">
                    {settings.question_type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Sets</span>
                  <span className="tnum text-text-primary">{settings.num_sets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Duration</span>
                  <span className="tnum text-text-primary">{settings.time_limit_minutes}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Violations</span>
                  <span className="tnum text-text-primary">{settings.violation_limit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Questions</span>
                  <span className="tnum text-text-primary">{totalQuestions}</span>
                </div>
              </div>
            )}

            <div className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.08em] mb-3">
                Setup Progress
              </h3>
              <div className="space-y-1">
                {SETUP_STEPS.map((s, i) => (
                  <div key={s.id} className="relative flex items-start gap-3 px-1 py-1.5">
                    {i < SETUP_STEPS.length - 1 && (
                      <span
                        className="absolute left-[9px] top-7 bottom-[-4px] w-px bg-border"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        step > s.id
                          ? "bg-accent-success text-white"
                          : step === s.id
                          ? "text-accent-500"
                          : "text-text-muted"
                      }`}
                    >
                      {step > s.id ? (
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      ) : step === s.id ? (
                        <s.activeIcon className="w-5 h-5" />
                      ) : (
                        <s.dashedIcon className="w-5 h-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium ${
                          step === s.id
                            ? "text-text-primary"
                            : step > s.id
                            ? "text-accent-success"
                            : "text-text-muted"
                        }`}
                      >
                        {s.label}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Manage Exams list — the page itself ── */}
      <div className="space-y-4">
          {/* Status filter — the same pill/count chip pattern used for the
              live exam roster filter (ActiveExam.jsx), not the reference's
              nav-bar tab styling. */}
          {!loadingExams && myExams.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter exams by status">
              {MANAGE_FILTERS.map((f) => {
                const isActiveFilter = manageFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={isActiveFilter}
                    onClick={() => setManageFilter(f.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-[var(--radius-pill)] border text-xs font-semibold transition-colors duration-150",
                      isActiveFilter
                        ? "bg-accent-500/15 border-accent-500/30 text-accent-500"
                        : "bg-transparent border-border text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary"
                    )}
                  >
                    <f.icon className="w-3.5 h-3.5 shrink-0" />
                    {f.label}
                    <span
                      className={cn(
                        "tnum text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-[var(--radius-sm)]",
                        isActiveFilter ? "bg-accent-500/20" : "bg-bg-surface-3 text-text-muted"
                      )}
                    >
                      {manageFilterCounts[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + sort — free-text search over title/class name and a
              two-state created_at sort, both client-side on top of the
              status-filtered list. Sits directly below the status chips as
              a finer-grained complement to them. */}
          {!loadingExams && myExams.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-muted pointer-events-none"
                  strokeWidth={1.75}
                />
                <Input
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  placeholder="Search exams by title or class..."
                  aria-label="Search exams by title or class"
                  className="pl-9 pr-9 bg-bg-base border-border"
                />
                {manageSearch && (
                  <button
                    type="button"
                    onClick={() => setManageSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setManageSort((s) => (s === "newest" ? "oldest" : "newest"))}
                aria-label={`Sort by created date, currently ${
                  manageSort === "newest" ? "newest first" : "oldest first"
                }. Click to toggle.`}
                className="inline-flex items-center justify-center gap-1.5 pl-3 pr-3 h-9 rounded-[var(--radius-pill)] border border-border bg-transparent text-xs font-semibold text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary transition-colors duration-150 whitespace-nowrap flex-shrink-0"
              >
                <ArrowsSort className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                {manageSort === "newest" ? "Newest first" : "Oldest first"}
              </button>
            </div>
          )}

          {loadingExams ? (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="min-h-[8rem] max-h-[calc(100dvh-31rem)] sm:max-h-[calc(100dvh-22rem)] overflow-x-auto overflow-y-auto">
                <table className="w-full">
                  <tbody className="divide-y divide-border">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-40" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-12 rounded-[var(--radius-sm)]" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-8" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-10" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-7 w-24 ml-auto" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : myExams.length === 0 ? (
            <div className="p-12 text-center text-text-muted italic bg-bg-surface border border-border rounded-[var(--radius-lg)]">
              No exams created yet.
            </div>
          ) : displayedExams.length === 0 ? (
            <div className="py-12 text-center text-text-muted italic bg-bg-surface border border-border rounded-[var(--radius-lg)]">
              No exams match this filter.
            </div>
          ) : (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
              {/* Row area scrolls inside the card (sticky header) once it
                  gets tall — with page size 10/20/All the list would
                  otherwise push the whole page into a scroll and carry the
                  pagination controls off-screen. The cap leaves room for the
                  header stack above (taller when it wraps on narrow) plus
                  the pagination bar, so the card itself never forces a
                  page scroll. min-h keeps ~2 rows visible on short screens. */}
              <div className="min-h-[8rem] max-h-[calc(100dvh-31rem)] sm:max-h-[calc(100dvh-22rem)] overflow-x-auto overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-bg-elevated">
                    <tr className="border-b border-border bg-bg-elevated">
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Class</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Sets</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedExams.map((exam) => (
                      <ExamManageRow key={exam.id} exam={exam} onOpen={handleExamClick} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ManagePaginationBar
                total={displayedExams.length}
                rangeStart={manageRangeStart}
                rangeEnd={manageRangeEnd}
                page={managePageSafe}
                pageCount={managePageCount}
                pageSize={managePageSize}
                onPageChange={setManagePage}
                onPageSizeChange={setManagePageSize}
              />
            </div>
          )}
      </div>

      {/* ── Question Editor Dialog — type-aware modal shell, mirroring the
          pattern built for Task Assignment: one shared dialog whose body
          switches by question type rather than two separate one-off forms. ── */}
      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="bg-bg-surface border-border text-text-primary sm:max-w-lg z-[60]">
          <DialogHeader>
            <DialogTitle className="text-text-primary flex items-center gap-2">
              {isDraftCode ? <Code2 className="w-[18px] h-[18px] text-accent-500" /> : <CheckSquare className="w-[18px] h-[18px] text-accent-500" />}
              {draft?.id ? "Edit" : "New"} {isDraftCode ? "Code" : "MCQ"} Question — Set {activeSet}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4 py-1">
              <div>
                <Label>{isDraftCode ? "Question Title" : "Question Text"}</Label>
                <Input
                  value={draft.question_text}
                  onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                  placeholder={isDraftCode ? "e.g. Reverse a linked list" : "Enter your question..."}
                  className="mt-1 bg-bg-base border-border"
                />
              </div>

              {isDraftCode && (
                <div>
                  <Label htmlFor="code-description">Description</Label>
                  <Textarea
                    id="code-description"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Explain the problem, constraints, and expected input/output..."
                    className="mt-1 bg-bg-base border-border min-h-24"
                  />
                </div>
              )}

              {isDraftMcq && (
                <div className="space-y-2">
                  <Label>Options (select correct answer)</Label>
                  {draft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, correct_option: i })}
                        aria-label={`Mark option ${["A", "B", "C", "D"][i]} as correct`}
                        aria-pressed={draft.correct_option === i}
                        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 ${
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
                        className="bg-bg-base border-border"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-text-muted">
                      Circle = correct answer (index {draft.correct_option})
                    </p>
                    <span className="tnum text-xs px-2 py-0.5 bg-bg-base border border-border rounded-[var(--radius-sm)] text-text-secondary">
                      1 mark (auto)
                    </span>
                  </div>
                </div>
              )}

              {isDraftCode && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Language</Label>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setDraft({ ...draft, language: lang })}
                          className={`px-3 py-1 rounded-[var(--radius-sm)] text-xs tnum border transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.95] ${
                            draft.language === lang
                              ? "border-accent-500/60 bg-accent-500/10 text-accent-500"
                              : "border-border text-text-muted hover:border-border-hover"
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="code-max-score">Max Score (Marks)</Label>
                    <Input
                      id="code-max-score"
                      type="number"
                      min={1}
                      max={100}
                      value={draft.max_score ?? 10}
                      onChange={(e) =>
                        setDraft({ ...draft, max_score: parseInt(e.target.value) || 1 })
                      }
                      className="mt-1 bg-bg-base border-border tnum w-32 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={draft?.id ? handleUpdateQuestion : handleSaveQuestion}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.75} /> : <Plus className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              {draft?.id ? "Save changes" : `Add to Set ${activeSet}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm before discarding unsaved wizard work (app-wide AlertDialog
          pattern — see TimetableSetup). Only raised when wizardIsDirty(). */}
      <AlertDialog open={confirmCloseOpen} onOpenChange={(open) => !open && setConfirmCloseOpen(false)}>
        <AlertDialogContent className="bg-bg-elevated border-border text-text-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">Discard this exam setup?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the exam wizard. Closing now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={closeDrawer}
              className="bg-accent-critical hover:bg-accent-critical/90 text-white"
            >
              Discard &amp; close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
