import { useState, useEffect, useRef } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router";
import { CodeEditor } from "./CodeEditor";
import { getSocket } from "../../store/socket";
import { Lock, Unlock, CheckCircle, FileCode, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function TaskWorkspace() {
  const { joinedSession } = useOutletContext();
  const { taskId: urlTaskId } = useParams();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Active task's editor state
  const [activeCode, setActiveCode] = useState("");
  const [activeLanguage, setActiveLanguage] = useState("javascript");
  const [doubt, setDoubt] = useState(null); // current doubt for active task
  const [showHintHighlight, setShowHintHighlight] = useState(true);

  const lastSavedCodeRef = useRef("");
  const activeTaskRef = useRef(null);

  // Fetch all tasks for the current session
  const fetchTasks = async (autoSelectId = null) => {
    if (!joinedSession) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/session/${joinedSession.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const sortedTasks = data.tasks || [];
        setTasks(sortedTasks);

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
      }
    } catch (err) {
      console.error("[TaskWorkspace] Error fetching tasks:", err);
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
      const res = await fetch(`http://localhost:3000/doubts/student/task/${taskId}`, {
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
      const res = await fetch(`http://localhost:3000/tasks/${taskId}/autosave`, {
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
      const res = await fetch(`http://localhost:3000/tasks/${activeTaskId}/submit`, {
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
  const handleRaiseDoubt = async () => {
    if (!activeTaskId) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/doubts/raise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ task_id: activeTaskId, code_snapshot: activeCode })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to raise doubt.");
        return;
      }
      toast.info("Doubt raised. Waiting for instructor response.");
      setDoubt(data.doubt);
    } catch (err) {
      toast.error("Network error raising doubt.");
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-bg-base flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-info animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-3">
        <FileCode className="w-12 h-12 text-text-muted" />
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

  return (
    <div className="h-screen flex bg-bg-base overflow-hidden">
      {/* Task Queue Left Sidebar */}
      <aside className="w-64 border-r border-border bg-bg-surface flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">
            Session Tasks
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Complete tasks in sequential order
          </p>
        </div>

        {allTasksCompleted && (
          <div className="mx-3 my-2 p-2.5 bg-accent-success/15 border border-accent-success/30 rounded flex gap-2 items-center">
            <CheckCircle className="w-4 h-4 text-accent-success flex-shrink-0" />
            <span className="text-[10px] font-semibold text-accent-success">
              All tasks completed!
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tasks.map((t, idx) => {
            const isLocked = isTaskLocked(t, tasks);
            const isSelected = t.id === activeTaskId;
            const isDone = t.submission_status === 'submitted' || t.submission_status === 'auto_submitted';
            
            return (
              <button
                key={t.id}
                disabled={isLocked}
                onClick={() => selectTask(t)}
                className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${
                  isLocked 
                    ? "opacity-40 cursor-not-allowed" 
                    : isSelected
                      ? "bg-accent-info/10 border border-accent-info/30"
                      : "hover:bg-bg-elevated border border-transparent"
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${
                    isSelected ? "text-accent-info" : "text-text-primary"
                  }`}>
                    {idx + 1}. {t.title}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5 capitalize">
                    Status: {t.submission_status?.replace('_', ' ') || 'not started'}
                  </div>
                </div>

                <div className="flex-shrink-0 ml-2">
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                  ) : isDone ? (
                    <CheckCircle className="w-3.5 h-3.5 text-accent-success" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-accent-info" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor & Console Workspace */}
      <div className="flex-1 min-w-0 relative">
        <CodeEditor
          mode="task"
          task={activeTask}
          code={activeCode}
          setCode={setActiveCode}
          language={activeLanguage}
          setLanguage={setActiveLanguage}
          isSubmitted={activeTaskIsSubmitted}
          onSubmit={handleSubmitTask}
          onAskDoubt={handleRaiseDoubt}
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
    </div>
  );
}
