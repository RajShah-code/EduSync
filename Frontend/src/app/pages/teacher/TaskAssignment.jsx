import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { StatusBadge } from "../../components/StatusBadge";
import { Code, Clock, Send, Check, Users, List, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = ["JavaScript", "Python", "HTML", "CSS", "Plaintext"];

export function TaskAssignment() {
  const navigate = useNavigate();
  const { sessionInfo } = useOutletContext();

  const [activeTab, setActiveTab] = useState("assign"); // "assign" | "list"
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    languages: ["javascript"], // default
    hasTimeLimit: false,
    timeLimitMinutes: 15,
  });
  const [isPushing, setIsPushing] = useState(false);

  // Fetch active tasks for this session
  const fetchTasks = async () => {
    if (!sessionInfo) return;
    setLoadingTasks(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/session/${sessionInfo.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error("Failed to fetch session tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (sessionInfo && activeTab === "list") {
      fetchTasks();
    }
  }, [sessionInfo, activeTab]);

  const toggleLanguage = (lang) => {
    const langLower = lang.toLowerCase();
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

      const res = await fetch("http://localhost:3000/tasks/create", {
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
      // Redirect to progress page for this task
      navigate(`/teacher/task/progress/${data.task.id}`);
    } catch (err) {
      toast.error("Network error creating task.");
    } finally {
      setIsPushing(false);
    }
  };

  const isFormValid =
    formData.title.trim() &&
    formData.description.trim() &&
    formData.languages.length > 0 &&
    (!formData.hasTimeLimit || formData.timeLimitMinutes > 0);

  if (!sessionInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-base">
        <div className="text-center p-8">
          <AlertCircle className="w-16 h-16 text-text-muted mx-auto mb-4" />
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

  return (
    <div className="h-full overflow-auto bg-bg-base">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header and Tabs */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Task Manager</h1>
            <p className="text-sm text-text-secondary">
              Create coding tasks and track student submissions in real-time
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex bg-bg-surface p-1 rounded border border-border">
            <button
              onClick={() => setActiveTab("assign")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded transition-all ${
                activeTab === "assign"
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Send className="w-4 h-4" />
              Assign Task
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded transition-all ${
                activeTab === "list"
                  ? "bg-accent-info/10 text-accent-info"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <List className="w-4 h-4" />
              Active Tasks List ({tasks.length})
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === "assign" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* Form */}
            <form onSubmit={handlePushTask} className="space-y-6">
              <div className="p-6 bg-bg-surface border border-border rounded-lg space-y-5">
                <div>
                  <Label htmlFor="title" className="text-text-secondary text-xs font-bold uppercase tracking-wider">
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
                  <Label htmlFor="description" className="text-text-secondary text-xs font-bold uppercase tracking-wider">
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
                  <Label className="text-text-secondary text-xs font-bold uppercase tracking-wider">
                    Allowed Programming Languages
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => {
                      const isSelected = formData.languages.includes(lang.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={lang}
                          onClick={() => toggleLanguage(lang)}
                          className={`px-3 py-1.5 text-xs font-mono border rounded transition-all ${
                            isSelected
                              ? "bg-accent-info/10 border-accent-info/40 text-accent-info"
                              : "border-border text-text-secondary hover:border-accent-info/40"
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Limit Setting */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasTimeLimit"
                      checked={formData.hasTimeLimit}
                      onChange={(e) => setFormData({ ...formData, hasTimeLimit: e.target.checked })}
                      className="rounded border-border text-accent-info focus:ring-accent-info bg-bg-base w-4 h-4 cursor-pointer"
                    />
                    <Label htmlFor="hasTimeLimit" className="text-text-primary text-sm font-medium cursor-pointer">
                      Enable Time Limit
                    </Label>
                  </div>

                  {formData.hasTimeLimit && (
                    <div className="flex items-center gap-3 pl-6">
                      <Label htmlFor="timeLimitMinutes" className="text-text-secondary text-xs font-semibold whitespace-nowrap">
                        Limit in Minutes:
                      </Label>
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
                        className="w-24 bg-bg-base border-border text-text-primary font-mono text-sm focus-visible:ring-accent-info"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Push Button */}
              <Button
                type="submit"
                disabled={!isFormValid || isPushing}
                className="w-full bg-accent-info hover:bg-accent-info/90 text-white font-bold py-3 text-sm h-11"
              >
                {isPushing ? (
                  <>Assigning Task...</>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Assign & Broadcast Task to Students
                  </>
                )}
              </Button>
            </form>

            {/* Preview Column */}
            <div className="sticky top-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Student View Preview
              </h3>
              
              <div className="p-6 bg-bg-surface border border-border rounded-lg space-y-4 shadow-xl">
                {formData.title ? (
                  <>
                    <div className="flex items-start justify-between border-b border-border pb-4 gap-4">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-text-primary truncate">
                          {formData.title}
                        </h2>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {formData.languages.map((lang) => (
                            <span
                              key={lang}
                              className="px-2 py-0.5 text-[10px] font-mono border border-accent-info/20 bg-accent-info/5 text-accent-info rounded-sm uppercase"
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {formData.hasTimeLimit && (
                        <div className="flex items-center gap-1.5 text-accent-warning flex-shrink-0 bg-accent-warning/5 border border-accent-warning/20 px-2 py-1 rounded">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-mono text-xs font-semibold">
                            {String(formData.timeLimitMinutes).padStart(2, "0")}:00
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-bg-base rounded border border-border">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Instructions</h4>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                        {formData.description}
                      </p>
                    </div>

                    <div className="p-8 bg-bg-base rounded border border-dashed border-border flex flex-col items-center justify-center gap-2">
                      <Code className="w-8 h-8 text-text-muted" />
                      <p className="text-xs text-text-muted text-center italic">
                        Student Monaco Code Workspace goes here
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-text-muted text-sm italic">
                      Fill in the task details on the left to see the live preview.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          /* Active Tasks List Tab */
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border bg-bg-elevated">
              <h3 className="text-sm font-semibold text-text-primary">
                Tasks Assigned in Current Session
              </h3>
            </div>

            {loadingTasks ? (
              <div className="p-12 text-center text-text-muted">Loading session tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center text-text-muted italic">
                No tasks have been assigned during this session yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 flex items-center justify-between hover:bg-bg-elevated transition-colors"
                  >
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-text-primary">
                        Task #{task.sequence_order}: {task.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span className="font-mono">
                          Allowed: {task.allowed_languages?.join(", ").toUpperCase()}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-text-muted" />
                          {task.time_limit_seconds 
                            ? `${Math.round(task.time_limit_seconds / 60)} mins`
                            : "No limit"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={task.status === "active" ? "live" : "locked"} />
                      <Button
                        onClick={() => navigate(`/teacher/task/progress/${task.id}`)}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                      >
                        Track Progress
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
