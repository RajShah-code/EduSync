import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { StatusBadge } from "../../components/StatusBadge";
import { Code, Clock, Send, List, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { name: "JavaScript", dot: "#E8C547" },
  { name: "Python", dot: "#4B8BBE" },
  { name: "HTML", dot: "#E0723C" },
  { name: "CSS", dot: "#4D7CE0" },
  { name: "Plaintext", dot: "#9A9AA2" },
];

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
      const res = await fetch(`${API_BASE_URL}/tasks/session/${sessionInfo.id}`, {
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
      // Redirect to progress page for this task
      navigate(`/teacher/task/progress/${data.task.id}`);
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
            <h1 className="text-2xl font-semibold text-text-primary">Task Manager</h1>
            <p className="text-sm text-text-secondary">
              Create coding tasks and track student submissions in real-time
            </p>
          </div>

          {/* Segmented tab control */}
          <div className="flex bg-bg-surface p-1 rounded-[var(--radius-md)] border border-border">
            <button
              onClick={() => setActiveTab("assign")}
              className={`btn-press flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors duration-150 ${
                activeTab === "assign"
                  ? "bg-accent-info text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              Assign Task
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`btn-press flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors duration-150 ${
                activeTab === "list"
                  ? "bg-accent-info text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Active Tasks ({tasks.length})
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === "assign" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* Form */}
            <form onSubmit={handlePushTask} className="space-y-6">
              <div className="p-6 bg-bg-surface border border-border rounded-[var(--radius-lg)] space-y-5">
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
                      const isSelected = formData.languages.includes(lang.name.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={lang.name}
                          onClick={() => toggleLanguage(lang.name)}
                          className={`btn-press flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border rounded-[var(--radius-sm)] transition-colors duration-150 ${
                            isSelected
                              ? "bg-accent-info/10 border-accent-info/40 text-accent-info"
                              : "border-border text-text-secondary hover:border-border-hover"
                          }`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: lang.dot }}
                          />
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
                      <Label htmlFor="timeLimitMinutes" className="text-text-secondary text-xs font-semibold whitespace-nowrap">
                        Limit:
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
                          className="w-24 bg-bg-base border-border text-text-primary font-mono text-sm pr-10 focus-visible:ring-accent-info"
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
                    <Send className="w-4 h-4 mr-2" />
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
                  <span className="text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider ml-1">
                    Student View
                  </span>
                  {formData.title && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-accent-live">
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
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-border bg-bg-base text-text-secondary rounded-[var(--radius-sm)] uppercase"
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
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-mono text-xs font-semibold">
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
                        <Code className="w-7 h-7 text-text-muted" />
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
          /* Active Tasks List Tab */
          <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
            <div className="p-4 border-b border-border bg-bg-elevated">
              <h3 className="text-sm font-semibold text-text-primary">
                Tasks Assigned in Current Session
              </h3>
            </div>

            {loadingTasks ? (
              <div className="p-12 text-center text-text-muted">Loading session tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center text-text-muted">
                No tasks have been assigned during this session yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((task) => {
                  const isActive = task.status === "active";
                  return (
                    <div
                      key={task.id}
                      className={`pl-4 pr-4 py-3.5 border-l-2 flex items-center justify-between gap-4 transition-colors hover:bg-bg-elevated ${
                        isActive ? "border-l-accent-live" : "border-l-border"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-sm font-semibold text-text-primary truncate">
                          Task #{task.sequence_order}: {task.title}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-text-secondary">
                          <span className="font-mono">
                            {task.allowed_languages?.join(", ").toUpperCase()}
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-text-muted" />
                            {task.time_limit_seconds
                              ? `${Math.round(task.time_limit_seconds / 60)} mins`
                              : "No limit"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={isActive ? "live" : "locked"} />
                        <Button
                          onClick={() => navigate(`/teacher/task/progress/${task.id}`)}
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 flex items-center gap-1.5"
                        >
                          Track Progress
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
