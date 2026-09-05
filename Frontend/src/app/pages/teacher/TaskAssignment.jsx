import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { TaskStatusModal } from "../../components/TaskStatusModal";
import { CreateTaskDialog } from "../../components/CreateTaskDialog";
import { cn } from "../../components/ui/utils";
import { IconAlertCircle as AlertCircle, IconAlertTriangle as AlertTriangle, IconClipboardList as ClipboardListIcon, IconLayoutGrid as LayoutGrid, IconClipboardCheck as ClipboardCheck, IconClipboardText as ClipboardTextIcon, IconClipboardX as ClipboardX, IconMessageQuestion as MessageQuestion, IconCircleDashed as CircleDashed, IconCircleCheck as CheckCircle2, IconFilePencil as FilePencil, IconClipboardPlus as ClipboardPlus } from "@tabler/icons-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import PageShell from "../../components/PageShell";
import { getSocket } from "../../store/socket";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import "./TaskAssignment.css";

const BLANK_TASK_FORM = {
  title: "",
  description: "",
  languages: ["javascript"],
  timeLimitMinutes: "",
};

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

// Corner badge for a raised doubt — a dark chip with a wobbling
// message-question glyph, matching the reference mockup's card badge.
function DoubtBadgeIcon({ reduceMotion }) {
  if (reduceMotion) {
    return <MessageQuestion className="w-[15px] h-[15px]" strokeWidth={2.25} />;
  }
  return (
    <motion.div
      style={{ transformOrigin: "50% 50%" }}
      animate={{ rotate: [0, -10, 0, -10, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
    >
      <MessageQuestion className="w-[15px] h-[15px]" strokeWidth={2.25} />
    </motion.div>
  );
}

// Corner badge for a submission — solid accent fill, spring-in checkmark
// clipboard glyph.
function SubmittedBadgeIcon({ reduceMotion }) {
  if (reduceMotion) {
    return <ClipboardCheck className="w-[15px] h-[15px]" strokeWidth={2.25} />;
  }
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 16 }}
    >
      <ClipboardCheck className="w-[15px] h-[15px]" strokeWidth={2.25} />
    </motion.div>
  );
}

const PRESENCE_DOT = {
  live: "bg-accent-live",
  active: "bg-accent-live",
  idle: "bg-accent-warning",
  left: "bg-accent-locked",
  offline: "bg-accent-locked",
};

const CARD_CAPTION = {
  not_started: "Not Working",
  in_progress: "Working",
  doubt: "Needs a reply",
};

const PRESENCE_LABEL = {
  live: "Active",
  active: "Active",
  idle: "Not viewing",
  left: "Disconnected",
  offline: "Offline",
};

// Doubt is kept out of this array and rendered after a divider — it's an
// actionable alert, not just another status, so it reads as its own
// cluster in the filter bar rather than one more chip in the row.
const FILTERS = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "submitted", label: "Submitted", icon: ClipboardCheck },
  { key: "in_progress", label: "Working", icon: ClipboardTextIcon },
  { key: "not_started", label: "Not Working", icon: ClipboardX },
];
const DOUBT_FILTER = { key: "doubt", label: "Doubt", icon: MessageQuestion };

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

  const Container = clickable ? "button" : "div";

  return (
    <Container
      {...(clickable
        ? {
            type: "button",
            onClick,
            "aria-label": `Review ${row.student_name} — ${row.status.replace("_", " ")}`,
          }
        : {})}
      className={cn("tc-card", row.status === "doubt" && "tc-card--doubt")}
    >
      {/* Corner badge — the doubt/submitted alert, straddling the top-right
          corner, matching the Monitor reference's card badge. */}
      {row.status === "doubt" && (
        <span className="tc-badge tc-badge--doubt" aria-hidden="true" title="Doubt raised">
          <DoubtBadgeIcon reduceMotion={reduceMotion} />
        </span>
      )}
      {row.status === "submitted" && (
        <span className="tc-badge tc-badge--submitted" aria-hidden="true" title="Submitted">
          <SubmittedBadgeIcon reduceMotion={reduceMotion} />
        </span>
      )}

      {/* Identity row — name | roll, presence dot pinned to the end */}
      <div className="tc-identity">
        <span className="tc-name" title={row.student_name}>{row.student_name}</span>
        <span className="tc-sep" aria-hidden="true" />
        <span className="tc-roll">{row.roll_no}</span>
        <span
          className={cn("tc-presence", PRESENCE_DOT[row.presence] || "bg-accent-locked")}
          aria-hidden="true"
          title={PRESENCE_LABEL[row.presence] || "Offline"}
        />
      </div>

      {/* Caption — plain status text, with the one in-progress micro-interaction */}
      <div className="tc-caption">
        <span className="truncate">{caption}</span>
        {row.status === "in_progress" && <TypingIndicator reduceMotion={reduceMotion} />}
      </div>
    </Container>
  );
}

export function TaskAssignment() {
  const { sessionInfo } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  // Flips true after the first /tasks fetch settles (ok or error). The landing
  // effect must not decide "no ongoing task → open the pop-up" off the empty
  // initial state before that fetch has returned.
  const [tasksFetched, setTasksFetched] = useState(false);

  // Form State
  const [formData, setFormData] = useState(BLANK_TASK_FORM);
  const [isPushing, setIsPushing] = useState(false);

  // ── Create-task pop-up + provisional "New Task" tab ─────────────────────
  // The create form is a modal now, not an inline tab. Opening it drops a
  // provisional tab into the strip: Cancel removes it and restores whichever
  // task tab was open before; Submit turns it into the real task's tab.
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [hasDraftTab, setHasDraftTab] = useState(false);
  const [autoPromptDismissed, setAutoPromptDismissed] = useState(false);
  const prevTaskIdRef = useRef(null);
  const createdRef = useRef(false);

  // ── Active Tasks — the browser-tab task selector + filter bar + roster
  // IS the Active Tasks pane now (no separate plain list). Which task's tab
  // is open is driven by the `task` URL param rather than local state, so
  // it survives a refresh and is linkable from other pages, the way the
  // old dedicated route used to be. ──
  const progressTaskIdParam = searchParams.get("task");
  const progressTaskId = progressTaskIdParam ? parseInt(progressTaskIdParam, 10) : null;
  const progressTaskIdRef = useRef(null);
  useEffect(() => {
    progressTaskIdRef.current = progressTaskId;
  }, [progressTaskId]);

  const openProgress = (taskId) => {
    setSearchParams({ task: String(taskId) });
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
      setTasksFetched(true);
    }
  };

  useEffect(() => {
    if (sessionInfo) {
      fetchTasks();
    }
  }, [sessionInfo]);

  // Landing on the page with no tab chosen: prefer the first task that hasn't
  // ended yet ("ongoing" = status "active"); if nothing is running, surface
  // the create pop-up once (like the Live Lecture setup modal); only after
  // that's dismissed do we fall back to the most recent ended task. A tab
  // that's already chosen, or a provisional "New Task" tab in play, is left
  // untouched.
  useEffect(() => {
    if (hasDraftTab || showCreateDialog || progressTaskId) return;
    if (!sessionInfo || !tasksFetched || loadingTasks || tasksError) return;

    const firstOngoing = tasks.find((t) => t.status === "active");
    if (firstOngoing) {
      setSearchParams({ task: String(firstOngoing.id) });
      return;
    }
    if (!autoPromptDismissed) {
      openCreateDialog();
      return;
    }
    if (tasks.length > 0) {
      setSearchParams({ task: String(tasks[tasks.length - 1].id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tasks,
    progressTaskId,
    hasDraftTab,
    showCreateDialog,
    sessionInfo,
    tasksFetched,
    loadingTasks,
    tasksError,
    autoPromptDismissed,
  ]);

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

  useEffect(() => {
    if (sessionInfo) {
      fetchRoster();
      fetchDoubts();
    }
  }, [sessionInfo]);

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

  const patchForm = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  // Open the create-task pop-up and drop a provisional tab into the strip.
  const openCreateDialog = () => {
    prevTaskIdRef.current = progressTaskId;
    setFormData(BLANK_TASK_FORM);
    setHasDraftTab(true);
    setSearchParams({}); // deselect real tabs so the draft tab reads as active
    setShowCreateDialog(true);
  };

  // Fired on Cancel / Esc / overlay / X. A successful create closes the
  // dialog directly (Radix doesn't call this for a controlled close), so the
  // createdRef guard is only belt-and-suspenders — the genuine-cancel path
  // is what removes the draft tab and restores the previously open task.
  const handleCreateDialogOpenChange = (open) => {
    if (open) {
      setShowCreateDialog(true);
      return;
    }
    setShowCreateDialog(false);
    if (createdRef.current) {
      createdRef.current = false;
      setHasDraftTab(false);
      return;
    }
    setHasDraftTab(false);
    const prev = prevTaskIdRef.current;
    if (prev && tasks.some((t) => t.id === prev)) {
      setSearchParams({ task: String(prev) });
    } else {
      // Nothing running to fall back to — don't re-prompt; the landing
      // effect will pick the latest ended task (or show the empty state).
      setAutoPromptDismissed(true);
      setSearchParams({});
    }
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
      const timeLimitSeconds = formData.timeLimitMinutes
        ? Number(formData.timeLimitMinutes) * 60
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
      // Close the pop-up without running the cancel-cleanup, refresh the tab
      // strip, then land on the brand-new task's tab.
      createdRef.current = true;
      setShowCreateDialog(false);
      setHasDraftTab(false);
      setAutoPromptDismissed(false);
      await fetchTasks();
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
    (formData?.timeLimitMinutes === "" ||
      formData?.timeLimitMinutes === undefined ||
      Number(formData?.timeLimitMinutes) > 0);

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
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Task Manager</h1>
            <p className="text-sm text-text-secondary">
              Create coding tasks and track student submissions in real-time
            </p>
          </div>
        </div>

        {/* Expired Task Alerts — session-wide, shown above the Active Tasks pane. */}
        {expiredAlerts.length > 0 && (
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

        {/* Active Tasks — the only view; the create form is a pop-up now. */}
        {(
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
            <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-3">
              <ClipboardListIcon className="w-14 h-14 text-text-muted" />
              <div>
                <h2 className="text-base font-semibold text-text-primary">No tasks yet</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Assign a coding task to start tracking student progress.
                </p>
              </div>
              <Button
                onClick={openCreateDialog}
                size="sm"
                className="btn-press bg-accent-info hover:bg-accent-info/90 text-white text-xs font-semibold"
              >
                <ClipboardPlus className="w-3.5 h-3.5" />
                Create Task
              </Button>
            </div>
          ) : (
          <div>
            {/* Task tab strip — floats freely above the panel (not attached
                to it) as a row of pill tabs: dashed-ring/number/title,
                mirroring the reference "Task Manager" frame. overflow-x-auto
                only shows a scrollbar once tabs overflow the available
                width; it stays invisible while everything fits. */}
            <div className="ta-tabs overflow-x-auto" role="tablist" aria-label="Session tasks">
              {tasks.map(t => {
                const isSelected = t.id === progressTaskId;
                const isLive = t.status === "active";
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSearchParams({ task: String(t.id) })}
                    className={cn("ta-tab", isSelected && "is-active")}
                  >
                    {t.status === "closed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" strokeWidth={2.5} />
                    ) : (
                      <CircleDashed
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: isLive ? "var(--accent-500)" : "var(--text-muted)" }}
                        strokeWidth={2.5}
                      />
                    )}
                    <span className="ta-tab-num">{String(t.sequence_order).padStart(2, "0")}</span>
                    <span className="ta-tab-sep">|</span>
                    <span className="ta-tab-title">{t.title}</span>
                  </button>
                );
              })}

              {/* Provisional tab — present only while the create pop-up is
                  open; dashed + italic so it never reads as a saved task. */}
              {hasDraftTab && (
                <span role="tab" aria-selected={!progressTaskId} className="ta-tab-draft">
                  <FilePencil className="w-3.5 h-3.5 flex-shrink-0 text-accent-500" strokeWidth={2.5} />
                  New Task
                </span>
              )}

              {/* Trailing "new tab" affordance. Hidden while a draft tab is
                  already in play so drafts can't stack. */}
              {!hasDraftTab && (
                <button
                  type="button"
                  onClick={openCreateDialog}
                  aria-label="Create a new task"
                  className="btn-press ta-tab-new"
                >
                  <ClipboardPlus className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                  Create Task
                </button>
              )}
            </div>

            {/* Panel — a full four-corner-rounded surface below the floating
                tab strip. */}
            <div className="bg-bg-elevated border border-border rounded-[var(--radius-lg)] p-5 mt-3">
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
                      <div className="ta-filters" role="tablist" aria-label="Filter students by status">
                        {FILTERS.map(f => (
                          <button
                            key={f.key}
                            role="tab"
                            aria-selected={statusFilter === f.key}
                            onClick={() => setStatusFilter(f.key)}
                            className={cn("ta-filter", statusFilter === f.key && "is-active")}
                          >
                            <f.icon />
                            {f.label}
                            <span className="ta-filter__div">|</span>
                            <span className="ta-filter__count">{filterCounts[f.key]}</span>
                          </button>
                        ))}

                        {/* Doubt sits behind a divider — an actionable alert,
                            not just another status filter. */}
                        <span className="ta-filter-sep" aria-hidden="true" />
                        <button
                          key={DOUBT_FILTER.key}
                          role="tab"
                          aria-selected={statusFilter === DOUBT_FILTER.key}
                          onClick={() => setStatusFilter(DOUBT_FILTER.key)}
                          className={cn("ta-filter", statusFilter === DOUBT_FILTER.key && "is-active")}
                        >
                          <DOUBT_FILTER.icon />
                          {DOUBT_FILTER.label}
                          <span className="ta-filter__div">|</span>
                          <span className="ta-filter__count">{filterCounts[DOUBT_FILTER.key]}</span>
                        </button>
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
                          <div key={i} className="p-5 bg-bg-surface border border-border rounded-[18px] space-y-4">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-2.5 w-1/3" />
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
                ) : hasDraftTab ? (
                  <div className="py-12 text-center text-text-muted text-xs italic">
                    Fill in the form to create this task.
                  </div>
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

      <CreateTaskDialog
        open={showCreateDialog}
        onOpenChange={handleCreateDialogOpenChange}
        formData={formData}
        onFieldChange={patchForm}
        onToggleLanguage={toggleLanguage}
        onSubmit={handlePushTask}
        submitting={isPushing}
        canSubmit={isFormValid}
      />

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
