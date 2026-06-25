import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";
import { StatusBadge } from "../../components/StatusBadge";
import { StudentTile } from "../../components/StudentTile";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { 
  ClipboardList, Users, Clock, HelpCircle, Code, 
  AlertTriangle, Check, ArrowRight, Play, Loader2, ChevronRight
} from "lucide-react";
import { getSocket } from "../../store/socket";
import { deriveConnectionStatus } from "../../utils/statusHelper";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";

export function TaskProgress() {
  const navigate = useNavigate();
  const { sessionInfo } = useOutletContext();
  const { taskId: routeTaskId } = useParams();

  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  
  // Roster and Submissions
  const [roster, setRoster] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Doubt Queue State
  const [doubts, setDoubts] = useState([]);
  const [selectedDoubt, setSelectedDoubt] = useState(null);
  const [resolveForm, setResolveForm] = useState({
    responseText: "",
    lineStart: "",
    lineEnd: "",
  });
  const [resolving, setResolving] = useState(false);

  // Expired Alerts State (Timer expired decisions)
  const [expiredAlerts, setExpiredAlerts] = useState([]);
  const [extensionMinutes, setExtensionMinutes] = useState({}); // task_id -> minutes

  const activeTaskIdRef = useRef(null);

  // Fetch list of session tasks
  const fetchTasks = async (selectId = null) => {
    if (!sessionInfo) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/session/${sessionInfo.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const sessionTasks = data.tasks || [];
        setTasks(sessionTasks);

        // Pick active task
        let targetId = selectId || routeTaskId;
        if (!targetId && sessionTasks.length > 0) {
          targetId = sessionTasks[sessionTasks.length - 1].id; // default to latest
        }

        if (targetId) {
          setActiveTaskId(parseInt(targetId));
          activeTaskIdRef.current = parseInt(targetId);
        }
      }
    } catch (err) {
      console.error("Error fetching tasks:", err);
    }
  };

  // Fetch student roster (connected students)
  const fetchRoster = async () => {
    if (!sessionInfo) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/sessions/${sessionInfo.id}/students`, {
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

  // Fetch progress (submissions list for active task)
  const fetchProgress = async (taskId) => {
    if (!taskId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/${taskId}/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error("Error fetching progress:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Doubts Queue
  const fetchDoubts = async () => {
    if (!sessionInfo) return;
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/doubts/session/${sessionInfo.id}`, {
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

  // Load everything on mount/session check
  useEffect(() => {
    if (sessionInfo) {
      fetchTasks();
      fetchRoster();
      fetchDoubts();
    }
  }, [sessionInfo, routeTaskId]);

  // Load progress when active task changes
  useEffect(() => {
    if (activeTaskId) {
      fetchProgress(activeTaskId);
    }
  }, [activeTaskId]);

  // Live Socket listeners
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

    // Submissions updates (auto-saved or manual submit)
    const handleTaskStudentStatus = (payload) => {
      // payload: { task_id, student_id, student_name, submission: { status, code, language, score, submitted_at } }
      if (payload.task_id === activeTaskIdRef.current) {
        setSubmissions(prev => {
          const index = prev.findIndex(s => s.student_id === payload.student_id);
          const newSub = {
            student_id: payload.student_id,
            status: payload.submission.status,
            code: payload.submission.code,
            language: payload.submission.language,
            score: payload.submission.score,
            submitted_at: payload.submission.submitted_at,
            updated_at: new Date()
          };
          if (index >= 0) {
            return prev.map((s, idx) => idx === index ? newSub : s);
          } else {
            return [...prev, newSub];
          }
        });
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
      fetchTasks(activeTaskIdRef.current);
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
      const res = await fetch(`http://localhost:3000/tasks/${taskId}/extend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ additional_seconds: minutes * 60 })
      });
      if (res.ok) {
        toast.success(`Task deadline extended by ${minutes} minutes!`);
        // Remove from alerts
        setExpiredAlerts(prev => prev.filter(a => a.task_id !== taskId));
        // Refresh tasks and progress
        fetchTasks(taskId);
        fetchProgress(taskId);
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
      const res = await fetch(`http://localhost:3000/tasks/${taskId}/move_on`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast.info("Task status marked as closed.");
        // Remove from alerts
        setExpiredAlerts(prev => prev.filter(a => a.task_id !== taskId));
        // Refresh tasks
        fetchTasks(activeTaskId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Failed to close task.");
      }
    } catch (err) {
      toast.error("Failed to close task.");
    }
  };

  // Handle resolving a student doubt
  const handleResolveDoubt = async (e) => {
    e.preventDefault();
    if (!selectedDoubt) return;
    if (!resolveForm.responseText.trim()) {
      toast.error("Please enter a response for the student.");
      return;
    }

    setResolving(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/doubts/${selectedDoubt.id}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teacher_response_text: resolveForm.responseText,
          hint_line_start: resolveForm.lineStart ? parseInt(resolveForm.lineStart) : null,
          hint_line_end: resolveForm.lineEnd ? parseInt(resolveForm.lineEnd) : null,
        })
      });
      if (res.ok) {
        toast.success("Doubt resolved successfully.");
        setSelectedDoubt(null);
        setResolveForm({ responseText: "", lineStart: "", lineEnd: "" });
        fetchDoubts();
      }
    } catch (err) {
      toast.error("Failed to resolve doubt.");
    } finally {
      setResolving(false);
    }
  };

  // Check initial task timers expiry on load
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

  if (!sessionInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-base">
        <div className="text-center p-8">
          <AlertCircle className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            No Active Session
          </h2>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            Start a broadcast session first to track task progress.
          </p>
        </div>
      </div>
    );
  }

  const activeTask = tasks.find(t => t.id === activeTaskId);
  
  // Merge Roster and Submissions Data client-side
  const progressGrid = roster.map(student => {
    const sub = submissions.find(s => s.student_id === student.student_id);
    const presenceStatus = deriveConnectionStatus(student);
    
    return {
      student_id: student.student_id,
      student_name: student.student_name,
      roll_no: student.roll_no || student.rollNo || "N/A",
      presence: presenceStatus,
      submission: sub || {
        status: "not_started",
        code: "",
        language: "",
        score: null,
        submitted_at: null
      }
    };
  });

  return (
    <div className="h-full flex bg-bg-base overflow-hidden">
      
      {/* Task Selector Sidebar */}
      <aside className="w-60 border-r border-border bg-bg-surface flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex-shrink-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
            Session Tasks
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tasks.map(t => {
            const isSelected = t.id === activeTaskId;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTaskId(t.id);
                  activeTaskIdRef.current = t.id;
                }}
                className={`w-full text-left p-3 rounded-lg flex items-center justify-between border transition-all ${
                  isSelected 
                    ? "bg-accent-info/10 border-accent-info/30" 
                    : "hover:bg-bg-elevated border-transparent"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">
                    #{t.sequence_order}: {t.title}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5 capitalize">
                    {t.status}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main progress tracking panel */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
        
        {/* Expired Task Alerts (Stacked Alerts) */}
        {expiredAlerts.length > 0 && (
          <div className="space-y-3">
            {expiredAlerts.map(alert => (
              <div 
                key={alert.task_id} 
                className="p-4 bg-accent-warning/10 border border-accent-warning/20 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-accent-warning mt-0.5 flex-shrink-0" />
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
                      className="w-16 h-8 text-xs font-mono text-center bg-bg-base border-border"
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

        {/* Task Grid Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {activeTask ? activeTask.title : "No Active Task"}
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Roster grid merging real-time presence with submissions status
            </p>
          </div>

          {activeTask && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Task Status:</span>
              <StatusBadge status={activeTask.status === "active" ? "live" : "locked"} />
            </div>
          )}
        </div>

        {/* Roster & Progress Status Grid */}
        {activeTask ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {progressGrid.map(row => {
              const subStatus = row.submission.status;
              
              let subBadgeType = "pending";
              if (subStatus === "submitted") subBadgeType = "submitted";
              else if (subStatus === "in_progress") subBadgeType = "in-progress";
              else if (subStatus === "auto_submitted") subBadgeType = "absent"; // auto-submitted gets Red indicator

              const tileStudent = {
                id: row.student_id,
                name: row.student_name,
                status: row.presence, // active, idle, offline, left
              };

              return (
                <StudentTile
                  key={row.student_id}
                  student={tileStudent}
                  onClick={() => {
                    if (row.submission.code) {
                      navigate(`/teacher/task/review/${activeTaskId}`);
                    } else {
                      toast.info("No code submitted yet for this student.");
                    }
                  }}
                >
                  <div className="flex flex-col gap-1 mt-1 border-t border-border/40 pt-2">
                    <div className="text-[10px] text-text-muted font-mono">
                      Roll: {row.roll_no}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-text-secondary">Progress:</span>
                      <StatusBadge status={subBadgeType} />
                    </div>
                  </div>
                </StudentTile>
              );
            })}

            {progressGrid.length === 0 && (
              <div className="col-span-full py-12 text-center text-text-muted italic">
                No students currently connected to the session.
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-2">
            <ClipboardList className="w-12 h-12 text-text-muted" />
            <h2 className="text-base font-semibold text-text-primary">No Session Tasks</h2>
            <p className="text-xs text-text-secondary">Assign a coding task to monitor student progress.</p>
          </div>
        )}

        {/* Doubt Queue Panel */}
        {activeTask && (
          <div className="border border-border bg-bg-surface rounded-lg overflow-hidden mt-6 shadow-sm">
            <div className="p-4 border-b border-border bg-bg-elevated flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-accent-info" />
                Doubt Resolution Queue ({doubts.filter(d => d.status === "pending").length} Pending)
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border max-h-[550px]">
              
              {/* Doubts List */}
              <div className="lg:col-span-1 overflow-y-auto max-h-[550px] divide-y divide-border">
                {doubts.map(d => {
                  const isPending = d.status === "pending";
                  const isSelected = selectedDoubt?.id === d.id;
                  
                  return (
                    <button
                      key={d.id}
                      onClick={() => {
                        setSelectedDoubt(d);
                        setResolveForm({
                          responseText: d.teacher_response_text || "",
                          lineStart: d.hint_line_start ? String(d.hint_line_start) : "",
                          lineEnd: d.hint_line_end ? String(d.hint_line_end) : "",
                        });
                      }}
                      className={`w-full text-left p-3 flex flex-col gap-1 transition-all ${
                        isSelected 
                          ? "bg-accent-info/10" 
                          : "hover:bg-bg-elevated"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-text-primary">
                          {d.student_name}
                        </span>
                        <StatusBadge status={isPending ? "idle" : "present"} />
                      </div>
                      <div className="text-[10px] text-text-muted truncate">
                        Task: {d.task_title}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono mt-0.5">
                        Raised: {new Date(d.raised_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  );
                })}

                {doubts.length === 0 && (
                  <div className="p-8 text-center text-xs text-text-muted italic">
                    No doubts raised in this session.
                  </div>
                )}
              </div>

              {/* Doubt Detail & Monaco Editor code snapshot viewer */}
              <div className="lg:col-span-2 p-4 flex flex-col gap-4 max-h-[550px] overflow-y-auto">
                {selectedDoubt ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">
                          Doubt raised by {selectedDoubt.student_name}
                        </h4>
                        <p className="text-xs text-text-secondary mt-0.5">
                          Review code snapshot and provide lines/hints to resolve
                        </p>
                      </div>
                      <StatusBadge status={selectedDoubt.status === "pending" ? "idle" : "present"} />
                    </div>

                    {/* Monaco code snapshot view */}
                    <div className="h-64 border border-border rounded overflow-hidden relative">
                      <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-black/60 text-[9px] font-mono text-white rounded">
                        Read-only Snapshot
                      </div>
                      <Editor
                        height="100%"
                        language="javascript"
                        value={selectedDoubt.code_snapshot}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          domReadOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    </div>

                    {/* Resolution Form */}
                    {selectedDoubt.status === "pending" ? (
                      <form onSubmit={handleResolveDoubt} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="lineStart" className="text-[10px] text-text-secondary font-bold uppercase">
                              Hint Start Line (Optional)
                            </Label>
                            <Input
                              id="lineStart"
                              type="number"
                              min="1"
                              value={resolveForm.lineStart}
                              onChange={(e) => setResolveForm({ ...resolveForm, lineStart: e.target.value })}
                              placeholder="e.g. 5"
                              className="mt-1 bg-bg-base border-border text-xs text-text-primary"
                            />
                          </div>

                          <div>
                            <Label htmlFor="lineEnd" className="text-[10px] text-text-secondary font-bold uppercase">
                              Hint End Line (Optional)
                            </Label>
                            <Input
                              id="lineEnd"
                              type="number"
                              min="1"
                              value={resolveForm.lineEnd}
                              onChange={(e) => setResolveForm({ ...resolveForm, lineEnd: e.target.value })}
                              placeholder="e.g. 8"
                              className="mt-1 bg-bg-base border-border text-xs text-text-primary"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="responseText" className="text-[10px] text-text-secondary font-bold uppercase">
                            Teacher Response / Hint Text (Mandatory)
                          </Label>
                          <Textarea
                            id="responseText"
                            value={resolveForm.responseText}
                            onChange={(e) => setResolveForm({ ...resolveForm, responseText: e.target.value })}
                            placeholder="Write instructions or highlight issues for the student..."
                            className="mt-1 bg-bg-base border-border text-xs text-text-primary min-h-[60px]"
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={resolving || !resolveForm.responseText.trim()}
                          className="w-full bg-accent-info hover:bg-accent-info/90 text-white font-semibold text-xs h-9"
                        >
                          {resolving ? "Resolving Doubt..." : "Send Hint & Resolve Doubt"}
                        </Button>
                      </form>
                    ) : (
                      <div className="p-3 bg-bg-base border border-border rounded text-xs text-text-secondary space-y-1">
                        <div className="font-semibold text-accent-success flex items-center gap-1.5 mb-1">
                          <Check className="w-4 h-4" /> Resolved Hint
                        </div>
                        <div className="font-mono bg-bg-surface p-2 border border-border/40 rounded text-text-primary">
                          {selectedDoubt.teacher_response_text}
                        </div>
                        {selectedDoubt.hint_line_start && (
                          <div className="text-[10px] font-mono text-text-muted mt-1.5">
                            Highlighted lines: {selectedDoubt.hint_line_start} - {selectedDoubt.hint_line_end || selectedDoubt.hint_line_start}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-text-muted text-xs italic gap-1.5">
                    <HelpCircle className="w-8 h-8 text-text-muted" />
                    Select a student doubt from the list to resolve
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}
