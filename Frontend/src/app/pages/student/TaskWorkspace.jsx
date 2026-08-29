import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router";
import { CodeEditor } from "./CodeEditor";
import { getSocket } from "../../store/socket";
import { IconFileCode as FileCode, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { toast } from "sonner";
import { Skeleton } from "../../components/ui/skeleton";

export function TaskWorkspace() {
  const { joinedSession } = useOutletContext();
  const { taskId: urlTaskId } = useParams();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taskFetchError, setTaskFetchError] = useState(false);

  // Active task's editor state
  const [activeCode, setActiveCode] = useState("");
  const [activeLanguage, setActiveLanguage] = useState("javascript");
  const [doubt, setDoubt] = useState(null); // current doubt for active task
  const [showHintHighlight, setShowHintHighlight] = useState(true);
  const [submittingDoubt, setSubmittingDoubt] = useState(false);

  const lastSavedCodeRef = useRef("");
  const activeTaskRef = useRef(null);

  // Fetch all tasks for the current session
  const fetchTasks = async (autoSelectId = null) => {
    if (!joinedSession) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/session/${joinedSession.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const sortedTasks = data.tasks || [];
        setTasks(sortedTasks);
        setTaskFetchError(false);

        if (sortedTasks.length > 0) {
          // Determine which task to select
          let selected = null;
          if (autoSelectId) {
            selected = sortedTasks.find(t => t.id === parseInt(autoSelectId));
          } else if (urlTaskId) {
            selected = sortedTasks.find(t => t.id === parseInt(urlTaskId));
          }

          // Fallback to first unlocked, incomplete task
          if (!selected) {
            selected = sortedTasks.find(t => {
              const isLocked = isTaskLocked(t, sortedTasks);
              const isDone = t.submission_status === 'submitted' || t.submission_status === 'auto_submitted';
              return !isLocked && !isDone;
            });
          }

          // Ultimate fallback to first task
          if (!selected) {
            selected = sortedTasks[0];
          }

          if (selected) {
            const isLocked = isTaskLocked(selected, sortedTasks);
            if (!isLocked) {
              selectTask(selected);
            } else {
              // Find first unlocked task
              const firstUnlocked = sortedTasks.find(t => !isTaskLocked(t, sortedTasks));
              if (firstUnlocked) {
                selectTask(firstUnlocked);
              } else {
                selectTask(selected); // fallback even if locked
              }
            }
          }
        }
      } else {
        setTaskFetchError(true);
      }
    } catch (err) {
      console.error("[TaskWorkspace] Error fetching tasks:", err);
      setTaskFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if task is locked
  const isTaskLocked = (taskItem, allTasks) => {
    const preceding = allTasks.filter(t => t.sequence_order < taskItem.sequence_order);
    return preceding.some(t => {
      const isManualSubmitted = t.submission_status === 'submitted';
      const isAutoSubmittedAndClosed = t.submission_status === 'auto_submitted' && t.status === 'closed';
      return !isManualSubmitted && !isAutoSubmittedAndClosed;
    });
  };

  // Load a task into the workspace
  const selectTask = (task) => {
    setActiveTaskId(task.id);
    setActiveCode(task.submission_code || "");
    setActiveLanguage(task.submission_language || task.allowed_languages?.[0] || "javascript");
    lastSavedCodeRef.current = task.submission_code || "";
    activeTaskRef.current = task;
    setShowHintHighlight(true);
    fetchDoubtStatus(task.id);
  };

  // Fetch doubt status for the active task (fallback check)
  const fetchDoubtStatus = async (taskId) => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/doubts/student/task/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.doubts && data.doubts.length > 0) {
          setDoubt(data.doubts[0]); // most recent doubt
        } else {
          setDoubt(null);
        }
      }
    } catch (err) {
      console.error("[Doubt] Error fetching doubt status:", err);
    }
  };

  // Handle doubt resolution from socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleDoubtResolved = (payload) => {
      console.log("[Socket] doubt:resolved received:", payload);
      // Payload: { doubt_id, task_id, teacher_response_text, hint_line_start, hint_line_end }
      if (payload.task_id === activeTaskId) {
        setDoubt({
          status: "resolved",
          teacher_response_text: payload.teacher_response_text,
          hint_line_start: payload.hint_line_start,
          hint_line_end: payload.hint_line_end
        });
        setShowHintHighlight(true);
        toast.success("Your instructor resolved your doubt with a hint!");
      }
    };

    socket.on("doubt:resolved", handleDoubtResolved);
    return () => {
      socket.off("doubt:resolved", handleDoubtResolved);
    };
  }, [activeTaskId]);

  // Initial Fetch on mount and session check
  useEffect(() => {
    if (!joinedSession) {
      navigate("/student");
      return;
    }
    fetchTasks();
  }, [joinedSession?.id, urlTaskId]);

  // Fetch fallback check on socket reconnect
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleReconnect = () => {
      console.log("[Socket] Reconnected, fetching tasks & doubt fallback status...");
      fetchTasks(activeTaskId);
    };

    socket.on("connect", handleReconnect);
    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [activeTaskId, joinedSession?.id]);

  // Listen to socket task:assigned or task:closed and deadline updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleTaskAssigned = () => {
      fetchTasks(activeTaskId);
    };

    const handleTaskClosed = () => {
      fetchTasks(activeTaskId);
    };

    const handleDeadlineUpdated = () => {
      fetchTasks(activeTaskId);
    };

    const handleDeadlineReached = () => {
      fetchTasks(activeTaskId);
    };

    socket.on("task:assigned", handleTaskAssigned);
    socket.on("task:closed", handleTaskClosed);
    socket.on("task:deadline_updated", handleDeadlineUpdated);
    socket.on("task:deadline_reached", handleDeadlineReached);

    return () => {
      socket.off("task:assigned", handleTaskAssigned);
      socket.off("task:closed", handleTaskClosed);
      socket.off("task:deadline_updated", handleDeadlineUpdated);
      socket.off("task:deadline_reached", handleDeadlineReached);
    };
  }, [activeTaskId]);

  // Debounced Autosave (5 seconds)
  useEffect(() => {
    if (!activeTaskId) return;
    const activeTask = tasks.find(t => t.id === activeTaskId);
    if (!activeTask) return;

    const isDone = activeTask.submission_status === 'submitted' || activeTask.submission_status === 'auto_submitted';
    if (isDone) return;

    const saveTimer = setTimeout(() => {
      handleAutosave(activeTaskId, activeCode, activeLanguage);
    }, 5000);

    return () => clearTimeout(saveTimer);
  }, [activeCode, activeLanguage, activeTaskId]);

  const handleAutosave = async (taskId, codeVal, langVal) => {
    if (codeVal === lastSavedCodeRef.current) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/autosave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: codeVal, language: langVal })
      });
      if (res.ok) {
        lastSavedCodeRef.current = codeVal;
        // Quietly update local tasks list state without full reload
        setTasks(prev => prev.map(t => t.id === taskId ? { 
          ...t, 
          submission_code: codeVal, 
          submission_language: langVal,
          submission_status: t.submission_status === 'not_started' ? 'in_progress' : t.submission_status 
        } : t));
      }
    } catch (err) {
      console.error("[Autosave] Failed to autosave:", err);
    }
  };

  // Submit Task handler
  const handleSubmitTask = async () => {
    if (!activeTaskId) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/tasks/${activeTaskId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: activeCode, language: activeLanguage })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to submit task.");
        return;
      }
      toast.success("Task submitted successfully!");
      lastSavedCodeRef.current = activeCode;
      fetchTasks(activeTaskId);
    } catch (err) {
      toast.error("Network error during submit.");
    }
  };

  // Raise Doubt handler
  // Raises a doubt for the active task. Returns true on success so the
  // composer (in CodeEditor) knows whether to close itself.
  const handleRaiseDoubt = async (questionText) => {
    if (!activeTaskId || !questionText.trim()) return false;
    setSubmittingDoubt(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/doubts/raise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          task_id: activeTaskId,
          code_snapshot: activeCode,
          question_text: questionText.trim(),
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to raise doubt.");
        return false;
      }
      toast.info("Doubt raised. Waiting for instructor response.");
      setDoubt(data.doubt);
      return true;
    } catch (err) {
      toast.error("Network error raising doubt.");
      return false;
    } finally {
      setSubmittingDoubt(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-bg-base overflow-hidden">
        {/* Browser-tab strip skeleton */}
        <div className="h-11 px-2 bg-bg-surface border-b border-border flex items-end gap-1 flex-shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 w-32 flex items-center px-3">
              <Skeleton className="h-3.5 w-full" />
            </div>
          ))}
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-72 border-r border-border bg-bg-surface p-4 space-y-3 flex-shrink-0">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="h-12 px-3 border-b border-border bg-bg-surface flex items-center justify-between gap-4 flex-shrink-0">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-40" />
            </div>
            <div className="flex-1 p-4">
              <Skeleton className="h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (taskFetchError) {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-14 h-14 text-accent-critical" />
        <h3 className="text-base font-medium text-text-primary">
          Couldn't load your tasks
        </h3>
        <p className="text-sm text-text-secondary">
          A network error occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchTasks(); }}
          className="mt-2 px-4 py-2 bg-accent-info hover:bg-accent-info/90 text-white text-sm font-medium rounded-[var(--radius-md)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Try again
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-3">
        <FileCode className="w-14 h-14 text-text-muted" />
        <h3 className="text-base font-medium text-text-primary">
          No active task right now
        </h3>
        <p className="text-sm text-text-secondary">
          Your instructor has not assigned any tasks yet.
        </p>
      </div>
    );
  }

  const activeTask = tasks.find(t => t.id === activeTaskId);
  const activeTaskIsSubmitted = activeTask?.submission_status === 'submitted' || activeTask?.submission_status === 'auto_submitted';

  // Calculate timer remaining seconds for the active task
  let timerSeconds = null;
  if (activeTask && activeTask.deadline_at && activeTask.status === 'active') {
    const diff = Math.max(0, Math.round((new Date(activeTask.deadline_at).getTime() - Date.now()) / 1000));
    timerSeconds = diff;
  }

  // Check if all tasks in the session are completed
  const allTasksCompleted = tasks.every(t => t.submission_status === 'submitted' || t.submission_status === 'auto_submitted');

  // Task-switching now happens via the browser-tab strip inside CodeEditor's
  // own header, rather than a separate left sidebar — precompute each row's
  // lock/done state here (isTaskLocked already lives in this file) so the
  // strip doesn't need to duplicate the sequential-lock logic.
  const tasksForTabs = tasks.map(t => ({
    ...t,
    locked: isTaskLocked(t, tasks),
    done: t.submission_status === 'submitted' || t.submission_status === 'auto_submitted',
  }));

  return (
    <div className="h-screen bg-bg-base overflow-hidden">
      <CodeEditor
        mode="task"
        task={activeTask}
        tasks={tasksForTabs}
        activeTaskId={activeTaskId}
        onSelectTask={selectTask}
        allTasksCompleted={allTasksCompleted}
        code={activeCode}
        setCode={setActiveCode}
        language={activeLanguage}
        setLanguage={setActiveLanguage}
        isSubmitted={activeTaskIsSubmitted}
        onSubmit={handleSubmitTask}
        onAskDoubt={handleRaiseDoubt}
        submittingDoubt={submittingDoubt}
        doubt={doubt}
        hintRange={
          showHintHighlight && doubt?.status === "resolved"
            ? { startLine: doubt.hint_line_start, endLine: doubt.hint_line_end }
            : null
        }
        onDismissHint={() => setShowHintHighlight(false)}
        timerSeconds={timerSeconds}
      />
    </div>
  );
}
