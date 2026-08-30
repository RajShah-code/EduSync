import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { TaskStatusModal } from "../../components/TaskStatusModal";
import { cn } from "../../components/ui/utils";
import { IconCode as Code, IconClock as Clock, IconAlertCircle as AlertCircle, IconAlertTriangle as AlertTriangle, IconClipboardList as ClipboardListIcon, IconLayoutGrid as LayoutGrid, IconClipboardCheck as ClipboardCheck, IconClipboardText as ClipboardTextIcon, IconClipboardX as ClipboardX, IconMessageReport as MessageReport, IconCircleDot as CircleDot, IconCircle as CircleIcon, IconHandStop as Hand, IconCircleCheck as CheckCircle2, IconFilePencil as FilePencil, IconFileDescription as FileDescription, IconBracketsAngle as BracketsAngle, IconBrandJavascript as BrandJavascript, IconBrandPython as BrandPython, IconBrandHtml5 as BrandHtml5, IconBrandCss3 as BrandCss3, IconTypography as Typography, IconAlarm as Alarm, IconSquarePlus as SquarePlus, IconMenu2 as Menu2 } from "@tabler/icons-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import PageShell from "../../components/PageShell";
import { getSocket } from "../../store/socket";
import { deriveConnectionStatus } from "../../utils/statusHelper";

const LANGUAGES = [
  { name: "JavaScript", dot: "#E8C547", icon: BrandJavascript },
  { name: "Python", dot: "#4B8BBE", icon: BrandPython },
  { name: "HTML", dot: "#E0723C", icon: BrandHtml5 },
  { name: "CSS", dot: "#4D7CE0", icon: BrandCss3 },
  { name: "Plaintext", dot: "#9A9AA2", icon: Typography },
];

// ── Progress-view pieces — merged in from the old standalone Task Progress
// page. Carried over as-is: same cards, same statuses, same modal. ──

// Card micro-interactions — signal state, never decorate. Each is a small,
// bounded animation that respects prefers-reduced-motion by rendering the
// static end-state.
function TypingIndicator({ reduceMotion }) {
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) =>
        reduceMotion ? (
          <span key={i} className="w-1 h-1 rounded-full bg-accent-500" />
        ) : (
          <motion.span
            key={i}
            className="w-1 h-1 rounded-full bg-accent-500"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        )
      )}
    </div>
  );
}

function DoubtHandIcon({ reduceMotion }) {
  if (reduceMotion) {
    return <Hand className="w-4 h-4 text-accent-warning" strokeWidth={2.25} />;
  }
  return (
    <motion.div
      style={{ transformOrigin: "70% 90%" }}
      animate={{ rotate: [0, -14, 0, -14, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
    >
      <Hand className="w-4 h-4 text-accent-warning" strokeWidth={2.25} />
    </motion.div>
  );
}

function SubmittedCheck({ reduceMotion }) {
  if (reduceMotion) {
    return <CheckCircle2 className="w-4 h-4 text-accent-success" strokeWidth={2.25} />;
  }
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 16 }}
    >
      <CheckCircle2 className="w-4 h-4 text-accent-success" strokeWidth={2.25} />
    </motion.div>
  );
}

const CARD_BADGE_STATUS = {
  not_started: "pending",
  in_progress: "in-progress",
  doubt: "doubt",
  submitted: "submitted",
};

const PRESENCE_DOT = {
  live: "bg-accent-live",
  active: "bg-accent-live",
  idle: "bg-accent-warning",
  left: "bg-accent-locked",
  offline: "bg-accent-locked",
};

const CARD_CAPTION = {
  not_started: "Waiting to begin",
  in_progress: "Working right now",
  doubt: "Needs a reply",
};

const PRESENCE_LABEL = {
  live: "Active",
  active: "Active",
  idle: "Not viewing",
  left: "Disconnected",
  offline: "Offline",
};

const FILTERS = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "submitted", label: "Submitted", icon: ClipboardCheck },
  { key: "in_progress", label: "In Progress", icon: ClipboardTextIcon },
  { key: "not_started", label: "Not Started", icon: ClipboardX },
  { key: "doubt", label: "Doubt", icon: MessageReport },
];

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// One card, exactly one status, one purposeful micro-interaction — never a
// separate mock card per status, always driven by the merged roster row.
// Laid out in three distinct rows (identity / status / activity) so long
// names and badges never fight each other for the same line.
function TaskStudentCard({ row, onClick, reduceMotion }) {
  const clickable = row.status !== "not_started";
  const caption =
    row.status === "submitted"
      ? row.submission.score !== null && row.submission.score !== undefined
        ? <>Graded <span className="tnum text-text-primary font-semibold">{row.submission.score}</span></>
        : "Awaiting grade"
      : CARD_CAPTION[row.status];

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={clickable ? `Review ${row.student_name} — ${row.status.replace("_", " ")}` : undefined}
      className={cn(
        "flex flex-col gap-4 p-5 bg-bg-surface border rounded-[var(--radius-lg)] card-hover h-full",
        clickable
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          : "cursor-default",
        row.status === "doubt" ? "border-accent-warning/30" : "border-border"
      )}
    >
      {/* Identity row — avatar with a presence dot pinned to its corner,
          name and roll number stacked so a long name never touches the badge. */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-xs font-semibold text-text-secondary">
            {initialsOf(row.student_name)}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-surface",
              PRESENCE_DOT[row.presence] || "bg-accent-locked"
            )}
            aria-hidden="true"
            title={PRESENCE_LABEL[row.presence] || "Offline"}
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate leading-tight" title={row.student_name}>
            {row.student_name}
          </div>
          <div className="text-[11px] text-text-muted tnum mt-0.5">Roll {row.roll_no}</div>
        </div>
      </div>

      {/* Status row — its own line, full width, never squeezed */}
      <div>
        <StatusBadge status={CARD_BADGE_STATUS[row.status]} />
      </div>

      {/* Activity row — caption + the one status-specific micro-interaction */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-border/60">
        <span className="text-[11px] text-text-secondary truncate">{caption}</span>
        <span className="flex-shrink-0">
          {row.status === "not_started" && <CircleIcon className="w-4 h-4 text-text-muted" strokeWidth={1.75} />}
          {row.status === "in_progress" && <TypingIndicator reduceMotion={reduceMotion} />}
          {row.status === "doubt" && <DoubtHandIcon reduceMotion={reduceMotion} />}
          {row.status === "submitted" && <SubmittedCheck reduceMotion={reduceMotion} />}
        </span>
      </div>
    </div>
  );
}

export function TaskAssignment() {
  const { sessionInfo } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState("assign"); // "assign" | "list"
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    languages: ["javascript"], // default
    hasTimeLimit: false,
    timeLimitMinutes: 15,
  });
  const [isPushing, setIsPushing] = useState(false);

  // ── Active Tasks — the browser-tab task selector + filter bar + roster
  // IS the Active Tasks pane now (no separate plain list). Which task's tab
  // is open is driven by the `task` URL param rather than local state, so
  // it survives a refresh and is linkable from other pages, the way the
  // old dedicated route used to be. ──
  const progressTaskIdParam = searchParams.get("task");
  const progressTaskId = progressTaskIdParam ? parseInt(progressTaskIdParam, 10) : null;
  // The `task` param, when present, always wins over the clicked segmented
  // tab — this is what makes a deep link like ?task=5 land on Active Tasks
  // even if "Assign Task" was the last tab clicked.
  const effectiveTab = progressTaskId ? "list" : activeTab;
  const progressTaskIdRef = useRef(null);
  useEffect(() => {
    progressTaskIdRef.current = progressTaskId;
  }, [progressTaskId]);

  const openProgress = (taskId) => {
    setActiveTab("list");
    setSearchParams({ task: String(taskId) });
  };
  const closeProgress = () => {
    setSearchParams({});
  };

  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [progressError, setProgressError] = useState(false);
  const [doubts, setDoubts] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiredAlerts, setExpiredAlerts] = useState([]);
  const [extensionMinutes, setExtensionMinutes] = useState({}); // task_id -> minutes
  const prefersReducedMotion = useReducedMotion();

  // Fetch active tasks for this session — needed by both the plain list and
  // the progress tab bar, so it fires whenever either is in view.
  const fetchTasks = async () => {
    if (!sessionInfo) return;
    setLoadingTasks(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/session/${sessionInfo.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setTasksError(false);
      } else {
        setTasksError(true);
      }
    } catch (err) {
      console.error("Failed to fetch session tasks:", err);
      setTasksError(true);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (sessionInfo && effectiveTab === "list") {
      fetchTasks();
    }
  }, [sessionInfo, effectiveTab]);

  // Auto-select a task's tab the moment Active Tasks is opened without one
  // chosen yet — mirrors the old standalone page's "default to latest" rule,
  // since the tab bar now *is* the Active Tasks pane, not a separate list.
  useEffect(() => {
    if (effectiveTab === "list" && !progressTaskId && tasks.length > 0) {
      setSearchParams({ task: String(tasks[tasks.length - 1].id) });
    }
  }, [effectiveTab, progressTaskId, tasks]);

  // Fetch student roster (connected students) — only needed once a progress view is open
  const fetchRoster = async () => {
    if (!sessionInfo) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionInfo.id}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoster(data.students || []);
      }
    } catch (err) {
      console.error("Error fetching roster:", err);
    }
  };

  // Fetch progress (submissions list for the open task). Uses the
  // submissions/task/:id endpoint (also used by SubmissionReview) rather
  // than /tasks/:id/progress, because it's the one that returns each
  // submission's own `id` — needed to save a score from the modal.
  const fetchProgress = async (taskId) => {
    if (!taskId) return;
    setLoadingProgress(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/submissions/task/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
        setProgressError(false);
      } else {
        setProgressError(true);
      }
    } catch (err) {
      console.error("Error fetching progress:", err);
      setProgressError(true);
    } finally {
      setLoadingProgress(false);
    }
  };

  // Fetch Doubts Queue
  const fetchDoubts = async () => {
    if (!sessionInfo) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/doubts/session/${sessionInfo.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDoubts(data.doubts || []);
      }
    } catch (err) {
      console.error("Error fetching doubts:", err);
    }
  };

  // Roster + doubts are only relevant on the Active Tasks pane
  useEffect(() => {
    if (sessionInfo && effectiveTab === "list") {
      fetchRoster();
      fetchDoubts();
    }
  }, [sessionInfo, effectiveTab]);

  // Load progress when the open task changes; reset the filter so a status
  // selected on one task doesn't silently hide everyone on the next.
  useEffect(() => {
    if (progressTaskId) {
      fetchProgress(progressTaskId);
      setStatusFilter("all");
    }
  }, [progressTaskId]);

  // Live Socket listeners (merged from Task Progress)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Student status / Focus changes
    const handleStudentStatusUpdate = ({ session_id, students }) => {
      if (sessionInfo && session_id === sessionInfo.id) {
        setRoster(prev => {
          const incoming = students || [];
          // Update existing rows in-place; append students not yet in the roster.
          // Never remove a row — disconnected students must stay visible with their submissions.
          const merged = prev.map(existing => {
            const update = incoming.find(s => s.student_id === existing.student_id);
            return update ? { ...existing, ...update } : existing;
          });
          const newStudents = incoming.filter(
            s => !prev.some(existing => existing.student_id === s.student_id)
          );
          return [...merged, ...newStudents];
        });
      }
    };

    // Submissions updates (auto-saved or manual submit) — refetch rather than
    // hand-merge so a first-time save picks up its real submission `id`
    // (needed by the Submitted modal's grading form).
    const handleTaskStudentStatus = (payload) => {
      if (payload.task_id === progressTaskIdRef.current) {
        fetchProgress(progressTaskIdRef.current);
      }
    };

    // Live Doubt notification
    const handleNewDoubt = (doubtPayload) => {
      toast.info(`New Doubt raised by ${doubtPayload.student_name}!`);
      fetchDoubts();
    };

    // Timer expired summary alert
    const handleTimeExpiredSummary = (summary) => {
      // summary: { task_id, title, incomplete_count }
      setExpiredAlerts(prev => {
        // Prevent duplicate alerts
        if (prev.some(a => a.task_id === summary.task_id)) return prev;
        return [...prev, summary];
      });
      // Refresh tasks list status
      fetchTasks();
    };

    socket.on("teacher:student_status_update", handleStudentStatusUpdate);
    socket.on("task:student_status", handleTaskStudentStatus);
    socket.on("doubt:new", handleNewDoubt);
    socket.on("task:time_expired_summary", handleTimeExpiredSummary);

    return () => {
      socket.off("teacher:student_status_update", handleStudentStatusUpdate);
      socket.off("task:student_status", handleTaskStudentStatus);
      socket.off("doubt:new", handleNewDoubt);
      socket.off("task:time_expired_summary", handleTimeExpiredSummary);
    };
  }, []);

  // Handle task extension
  const handleExtendTask = async (taskId) => {
    const minutes = extensionMinutes[taskId] || 5;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/extend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ additional_seconds: minutes * 60 })
      });
      if (res.ok) {
        toast.success(`Task deadline extended by ${minutes} minutes!`);
        setExpiredAlerts(prev => prev.filter(a => a.task_id !== taskId));
        fetchTasks();
        if (taskId === progressTaskId) fetchProgress(taskId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Failed to extend task.");
      }
    } catch (err) {
      toast.error("Failed to extend task.");
    }
  };

  // Handle task closure
  const handleMoveOnTask = async (taskId) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/move_on`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast.info("Task status marked as closed.");
        setExpiredAlerts(prev => prev.filter(a => a.task_id !== taskId));
        fetchTasks();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Failed to close task.");
      }
    } catch (err) {
      toast.error("Failed to close task.");
    }
  };

  // Handle resolving a student doubt (invoked from the doubt modal)
  const handleResolveDoubt = async (doubtId, payload) => {
    if (!doubtId || !payload.responseText.trim()) {
      toast.error("Please enter a response for the student.");
      return;
    }

    setResolving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/doubts/${doubtId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teacher_response_text: payload.responseText,
          hint_line_start: payload.lineStart ? parseInt(payload.lineStart) : null,
          hint_line_end: payload.lineEnd ? parseInt(payload.lineEnd) : null,
        })
      });
      if (res.ok) {
        toast.success("Doubt resolved successfully.");
        setSelectedCard(null);
        fetchDoubts();
      }
    } catch (err) {
      toast.error("Failed to resolve doubt.");
    } finally {
      setResolving(false);
    }
  };

  // Handle saving a submission's score (invoked from the submitted modal)
  const handleSaveScore = async (submissionId, scoreValue) => {
    if (!submissionId) return;
    setSavingScore(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/submissions/${submissionId}/score`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ score: scoreValue ? parseFloat(scoreValue) : null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "Failed to update score.");
        return;
      }
      toast.success("Score updated successfully!");
      const nextScore = scoreValue ? parseFloat(scoreValue) : null;
      setSubmissions(prev => prev.map(s => s.id === submissionId ? { ...s, score: nextScore } : s));
      setSelectedCard(prev =>
        prev && prev.submission?.id === submissionId
          ? { ...prev, submission: { ...prev.submission, score: nextScore } }
          : prev
      );
    } catch (err) {
      toast.error("Network error updating score.");
    } finally {
      setSavingScore(false);
    }
  };

  // Check task timers expiry whenever the task list refreshes
  useEffect(() => {
    if (tasks.length > 0) {
      const expired = tasks.filter(t => t.deadline_at && new Date(t.deadline_at) < new Date() && t.status === 'active');
      setExpiredAlerts(expired.map(t => ({
        task_id: t.id,
        title: t.title,
        incomplete_count: "some"
      })));
    }
  }, [tasks]);

  const toggleLanguage = (langName) => {
    const langLower = langName.toLowerCase();
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.includes(langLower)
        ? prev.languages.filter((l) => l !== langLower)
        : [...prev.languages, langLower],
    }));
  };

  const handlePushTask = async (e) => {
    e.preventDefault();
    if (!sessionInfo) {
      toast.error("No active session found. Please start a session first.");
      return;
    }

    setIsPushing(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const timeLimitSeconds = formData.hasTimeLimit
        ? formData.timeLimitMinutes * 60
        : null;

      const res = await fetch(`${API_BASE_URL}/tasks/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionInfo.id,
          title: formData.title,
          description: formData.description,
          allowed_languages: formData.languages,
          time_limit_seconds: timeLimitSeconds
        })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create task.");
        return;
      }

      toast.success("Task assigned and broadcasted successfully!");
      // Jump straight into that task's progress view instead of navigating away
      openProgress(data.task.id);
    } catch (err) {
      toast.error("Network error creating task.");
    } finally {
      setIsPushing(false);
    }
  };

  const isFormValid =
    (formData?.title || "").trim() &&
    (formData?.description || "").trim() &&
    (formData?.languages || []).length > 0 &&
    (!formData?.hasTimeLimit || formData?.timeLimitMinutes > 0);

  if (!sessionInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-base">
        <div className="text-center p-8">
          <AlertCircle className="w-[72px] h-[72px] text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            No Active Session
          </h2>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            You must start a live broadcast session before you can assign tasks to students.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived progress data (only meaningful once a task's tab is open) ──
  const activeTask = tasks.find(t => t.id === progressTaskId);

  // Pending doubts for the open task, keyed by student — a pending doubt is
  // the most actionable signal for the teacher, so it overrides whatever the
  // submission status would otherwise show.
  const pendingDoubtByStudent = new Map();
  doubts
    .filter(d => d.task_id === progressTaskId && d.status === "pending")
    .forEach(d => pendingDoubtByStudent.set(d.student_id, d));

  // Merge Roster and Submissions Data client-side into exactly one status
  // per student — never a separate mock card per status.
  const cardsData = roster.map(student => {
    const sub = submissions.find(s => s.student_id === student.student_id);
    const presence = deriveConnectionStatus(student);
    const doubt = pendingDoubtByStudent.get(student.student_id) || null;
    const submission = sub || { status: "not_started", code: "", language: "", score: null, submitted_at: null, updated_at: null, id: null };

    let status = "not_started";
    if (submission.status === "submitted" || submission.status === "auto_submitted") status = "submitted";
    else if (submission.status === "in_progress") status = "in_progress";
    if (doubt) status = "doubt";

    return {
      student_id: student.student_id,
      student_name: student.student_name,
      roll_no: student.roll_no || student.rollNo || "N/A",
      presence,
      submission,
      doubt,
      status,
    };
  });

  // Per-status counts live on the filter bar instead of a separate stat card.
  const filterCounts = {
    all: cardsData.length,
    submitted: cardsData.filter(r => r.status === "submitted").length,
    in_progress: cardsData.filter(r => r.status === "in_progress").length,
    doubt: cardsData.filter(r => r.status === "doubt").length,
  };
  filterCounts.not_started = cardsData.length - filterCounts.submitted - filterCounts.in_progress - filterCounts.doubt;

  const filteredCards = statusFilter === "all" ? cardsData : cardsData.filter(r => r.status === statusFilter);

  return (
    <PageShell>
        {/* Header and Tabs */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Task Manager</h1>
            <p className="text-sm text-text-secondary">
              Create coding tasks and track student submissions in real-time
            </p>
          </div>

          {/* Segmented tab control */}
          <div className="flex bg-bg-surface p-1 rounded-[var(--radius-md)] border border-border">
            <button
              onClick={() => {
                setActiveTab("assign");
                closeProgress();
              }}
              aria-pressed={effectiveTab === "assign"}
              className={`btn-press flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-strong)] ${
                effectiveTab === "assign"
                  ? "bg-accent-info text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <SquarePlus className="w-4 h-4" />
              Assign Task
            </button>
            <button
              onClick={() => setActiveTab("list")}
              aria-pressed={effectiveTab === "list"}
              className={`btn-press flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-strong)] ${
                effectiveTab === "list"
                  ? "bg-accent-info text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Menu2 className="w-4 h-4" />
              Active Tasks ({tasks.length})
            </button>
          </div>
        </div>

        {/* Expired Task Alerts — session-wide, shown above the Active Tasks pane. */}
        {effectiveTab === "list" && expiredAlerts.length > 0 && (
          <div className="space-y-3">
            {expiredAlerts.map(alert => (
              <div
                key={alert.task_id}
                className="p-4 bg-accent-warning/10 border border-accent-warning/20 rounded-[var(--radius-lg)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-[22px] h-[22px] text-accent-warning mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">
                      Time Expired: {alert.title}
                    </h4>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Choose to extend time or lock submissions to move on.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={extensionMinutes[alert.task_id] || 5}
                      onChange={(e) => setExtensionMinutes({
                        ...extensionMinutes,
                        [alert.task_id]: parseInt(e.target.value) || 5
                      })}
                      className="w-16 h-8 text-xs tnum text-center bg-bg-base border-border"
                    />
                    <Button
                      onClick={() => handleExtendTask(alert.task_id)}
                      size="sm"
                      className="bg-accent-warning text-black hover:bg-accent-warning/90 text-xs h-8 px-3"
                    >
                      Extend
                    </Button>
                  </div>

                  <Button
                    onClick={() => handleMoveOnTask(alert.task_id)}
                    size="sm"
                    variant="outline"
                    className="border-accent-critical text-accent-critical hover:bg-accent-critical/10 text-xs h-8 px-3"
                  >
                    Lock & Move On
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Contents */}
        {effectiveTab === "assign" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

            {/* Form */}
            <form onSubmit={handlePushTask} className="space-y-6">
              <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)] space-y-5">
                <div>
                  <Label htmlFor="title" className="text-text-secondary text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <FilePencil className="w-3.5 h-3.5 shrink-0" />
                    Task Title
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="mt-1 bg-bg-base border-border text-text-primary focus-visible:ring-accent-info"
                    placeholder="e.g., Implement Binary Search"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-text-secondary text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <FileDescription className="w-3.5 h-3.5 shrink-0" />
                    Description / Instructions
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="mt-1 bg-bg-base border-border text-text-primary min-h-[140px] focus-visible:ring-accent-info"
                    placeholder="Write details, requirements, example input/output, etc."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <BracketsAngle className="w-3.5 h-3.5 shrink-0" />
                    Allowed Programming Languages
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => {
                      const isSelected = formData.languages.includes(lang.name.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={lang.name}
                          onClick={() => toggleLanguage(lang.name)}
                          className={`btn-press flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wide border rounded-[var(--radius-sm)] transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] ${
                            isSelected
                              ? "bg-accent-info/10 border-accent-info/40 text-accent-info"
                              : "border-border text-text-secondary hover:border-border-hover"
                          }`}
                        >
                          <lang.icon className="w-3.5 h-3.5 shrink-0" style={{ color: lang.dot }} />
                          {lang.name.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Limit Setting */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="hasTimeLimit" className="text-text-primary text-sm font-medium cursor-pointer">
                        Enable Time Limit
                      </Label>
                      <p className="text-xs text-text-muted mt-0.5">
                        Students see a countdown; submissions lock automatically at zero.
                      </p>
                    </div>
                    <Switch
                      id="hasTimeLimit"
                      checked={formData.hasTimeLimit}
                      onCheckedChange={(checked) => setFormData({ ...formData, hasTimeLimit: checked })}
                    />
                  </div>

                  {formData.hasTimeLimit && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="timeLimitMinutes" className="text-text-secondary text-xs font-semibold whitespace-nowrap flex items-center gap-1">
                        <Alarm className="w-3.5 h-3.5 shrink-0" />
                        Duration:
                      </Label>
                      <div className="relative">
                        <Input
                          id="timeLimitMinutes"
                          type="number"
                          min="1"
                          max="180"
                          value={formData.timeLimitMinutes}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              timeLimitMinutes: parseInt(e.target.value) || 15,
                            })
                          }
                          className="w-24 bg-bg-base border-border text-text-primary tnum text-sm pr-10 focus-visible:ring-accent-info"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">
                          min
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Push Button */}
              <Button
                type="submit"
                disabled={!isFormValid || isPushing}
                className="w-full bg-accent-info hover:bg-accent-info/90 text-white font-semibold py-3 text-sm h-11"
              >
                {isPushing ? (
                  <>Assigning Task...</>
                ) : (
                  <>
                    <SquarePlus className="w-[18px] h-[18px] mr-2" />
                    Assign & Broadcast Task to Students
                  </>
                )}
              </Button>
            </form>

            {/* Preview Column — framed as a literal device window so it reads as
                "this is exactly what lands on student screens", not a generic card. */}
            <div className="sticky top-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Live Preview
              </h3>

              <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-bg-elevated">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-bg-surface-3" />
                    <span className="w-2 h-2 rounded-full bg-bg-surface-3" />
                    <span className="w-2 h-2 rounded-full bg-bg-surface-3" />
                  </div>
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider ml-1">
                    Student View
                  </span>
                  {formData.title && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold tracking-wide text-accent-live">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-accent-live pulse-dot" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-live" />
                      </span>
                      LIVE ON SEND
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {formData.title ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-base font-semibold text-text-primary truncate">
                            {formData.title}
                          </h2>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {formData.languages.map((langLower) => {
                              const lang = LANGUAGES.find((l) => l.name.toLowerCase() === langLower);
                              return (
                                <span
                                  key={langLower}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wide border border-border bg-bg-base text-text-secondary rounded-[var(--radius-sm)] uppercase"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: lang?.dot || "var(--text-muted)" }}
                                  />
                                  {langLower}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {formData.hasTimeLimit && (
                          <div className="flex items-center gap-1.5 text-accent-warning flex-shrink-0 bg-accent-warning/10 border border-accent-warning/20 px-2 py-1 rounded-[var(--radius-sm)]">
                            <Clock className="w-4 h-4" />
                            <span className="tnum text-xs font-semibold">
                              {String(formData.timeLimitMinutes).padStart(2, "0")}:00
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-bg-base rounded-[var(--radius-md)] border border-border">
                        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Instructions</h4>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                          {formData.description || (
                            <span className="italic text-text-muted">No description yet — students will see this section once you add one.</span>
                          )}
                        </p>
                      </div>

                      <div className="p-6 bg-bg-base rounded-[var(--radius-md)] border border-border border-dashed flex flex-col items-center justify-center gap-2">
                        <Code className="w-8 h-8 text-text-muted" />
                        <p className="text-xs text-text-muted text-center">
                          Student's Monaco code workspace renders here
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-16">
                      <p className="text-text-muted text-sm">
                        Fill in the task details to see the live preview.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* ── Active Tasks — the browser-tab task selector + filter bar +
              roster IS this pane now (the old plain list is gone; a task's
              tab is auto-selected the moment this pane opens). ── */
          tasksError ? (
            <div className="p-12 text-center flex flex-col items-center gap-3 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
              <p className="text-sm text-text-secondary">Couldn't load this session's tasks.</p>
              <Button
                onClick={fetchTasks}
                variant="outline"
                size="sm"
                className="text-xs font-semibold"
              >
                Try again
              </Button>
            </div>
          ) : loadingTasks && tasks.length === 0 ? (
            <div className="py-16 text-center text-text-muted text-xs italic">
              Loading tasks…
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-2">
              <ClipboardListIcon className="w-14 h-14 text-text-muted" />
              <h2 className="text-base font-semibold text-text-primary">No Session Tasks</h2>
              <p className="text-xs text-text-secondary">Assign a coding task to monitor student progress.</p>
            </div>
          ) : (
          <div>
            {/* Browser-tab task selector — a full-width bar so inactive tabs
                sit on a proper surface (not raw page black), rounded top
                corners only; the active tab shares the panel's bg and has
                no bottom padding under it, so it reads as physically
                attached to the panel rather than floating above it.
                overflow-x-auto only shows a scrollbar once tabs overflow the
                available width; it stays invisible while everything fits. */}
            <div
              className="flex items-end gap-1 overflow-x-auto bg-bg-surface border border-b-0 border-border rounded-t-[var(--radius-lg)] px-2 pt-2"
              role="tablist"
              aria-label="Session tasks"
            >
              {tasks.map(t => {
                const isSelected = t.id === progressTaskId;
                const isLive = t.status === "active";
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSearchParams({ task: String(t.id) })}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-t-[var(--radius-md)] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-150",
                      isSelected
                        ? "bg-bg-elevated text-text-primary"
                        : "text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary"
                    )}
                  >
                    <CircleDot
                      className={cn("w-3.5 h-3.5 flex-shrink-0", isLive ? "text-accent-live" : "text-text-muted")}
                      strokeWidth={2.5}
                    />
                    <span className="max-w-[180px] truncate">#{t.sequence_order}: {t.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Panel — connected to the tab bar above (shares its background
                exactly, no top border, so the two read as one piece) */}
            <div className="bg-bg-elevated border border-t-0 border-border rounded-b-[var(--radius-lg)] p-5">
              <AnimatePresence mode="wait">
                {activeTask ? (
                  <motion.div
                    key={activeTask.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className="space-y-5"
                  >
                    {/* Filter bar — each chip carries the live count for that status;
                        the task's own status + End Task action share this row on the
                        right instead of wasting a separate row above the tabs. */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter students by status">
                        {FILTERS.map(f => {
                          const isActiveFilter = statusFilter === f.key;
                          return (
                            <button
                              key={f.key}
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
                              <f.icon className="w-3.5 h-3.5 shrink-0" />
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

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {activeTask.status === "active" && (
                          <Button
                            onClick={() => handleMoveOnTask(activeTask.id)}
                            size="sm"
                            variant="outline"
                            className="border-accent-critical text-accent-critical hover:bg-accent-critical/10 text-xs h-8 px-3 font-semibold flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            End Task
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Progress fetch error — roster still loads independently, so this
                        is a narrow inline banner rather than a full takeover. */}
                    {progressError && !loadingProgress && (
                      <div className="p-3 bg-accent-critical/10 border border-accent-critical/25 rounded-[var(--radius-md)] flex items-center justify-between gap-3">
                        <span className="text-xs text-text-secondary">
                          Couldn't load submission progress — statuses below may be stale.
                        </span>
                        <Button
                          onClick={() => fetchProgress(progressTaskId)}
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-3 font-semibold flex-shrink-0"
                        >
                          Retry
                        </Button>
                      </div>
                    )}

                    {/* Student card grid — one card per student, exactly one status each.
                        Clicking a card opens the shared status modal; Not Started cards
                        stay inert since there's nothing yet to review. */}
                    {loadingProgress ? (
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
                    ) : filteredCards.length > 0 ? (
                      // Bounded height — scrolls internally once the roster outgrows
                      // this box; stays plain (no scrollbar) at low student counts.
                      <div className="max-h-[32rem] overflow-y-auto pr-1">
                        <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                          {filteredCards.map(row => (
                            <TaskStudentCard
                              key={row.student_id}
                              row={row}
                              reduceMotion={prefersReducedMotion}
                              onClick={() => setSelectedCard(row)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : cardsData.length === 0 ? (
                      <div className="py-12 text-center text-text-muted italic bg-bg-surface border border-border rounded-[var(--radius-lg)]">
                        No students currently connected to the session.
                      </div>
                    ) : (
                      <div className="py-12 text-center text-text-muted italic bg-bg-surface border border-border rounded-[var(--radius-lg)]">
                        No students match this filter.
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="py-10 text-center text-text-muted text-xs italic">
                    {loadingTasks ? "Loading task…" : "Task not found."}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
          )
        )}

      <TaskStatusModal
        open={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        variant={selectedCard?.status}
        student={selectedCard ? {
          student_name: selectedCard.student_name,
          roll_no: selectedCard.roll_no,
          presence: selectedCard.presence,
        } : null}
        task={activeTask}
        submission={selectedCard?.submission}
        doubt={selectedCard?.doubt}
        onResolveDoubt={(payload) => selectedCard?.doubt && handleResolveDoubt(selectedCard.doubt.id, payload)}
        resolving={resolving}
        onSaveScore={(score) => selectedCard?.submission?.id && handleSaveScore(selectedCard.submission.id, score)}
        savingScore={savingScore}
      />
    </PageShell>
  );
}
