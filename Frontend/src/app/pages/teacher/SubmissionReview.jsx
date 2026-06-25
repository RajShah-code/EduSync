import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { StatusBadge } from "../../components/StatusBadge";
import { 
  ChevronLeft, Code, FileCode, CheckCircle, 
  Award, Clock, Loader2, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";

export function SubmissionReview() {
  const navigate = useNavigate();
  const { taskId } = useParams();

  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(false);

  // Scoring form state
  const [scoreInput, setScoreInput] = useState("");
  const [savingScore, setSavingScore] = useState(false);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/submissions/task/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const subs = data.submissions || [];
        setSubmissions(subs);
        
        // Auto select first submission if none selected yet
        if (subs.length > 0 && !selectedSubmission) {
          selectSubmission(subs[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
      toast.error("Error loading submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [taskId]);

  const selectSubmission = (sub) => {
    setSelectedSubmission(sub);
    setScoreInput(sub.score !== null ? String(sub.score) : "");
  };

  const handleSaveScore = async (e) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    setSavingScore(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/tasks/submissions/${selectedSubmission.id}/score`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ score: scoreInput ? parseFloat(scoreInput) : null })
      });
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.message || "Failed to update score.");
        return;
      }

      toast.success("Score updated successfully!");
      
      // Update locally in the list
      setSubmissions(prev => prev.map(s => s.id === selectedSubmission.id ? { 
        ...s, 
        score: scoreInput ? parseFloat(scoreInput) : null 
      } : s));
      
      // Update selected
      setSelectedSubmission(prev => ({
        ...prev,
        score: scoreInput ? parseFloat(scoreInput) : null
      }));
    } catch (err) {
      toast.error("Network error updating score.");
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      
      {/* Top Header */}
      <div className="h-14 px-4 border-b border-border bg-bg-surface flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate(`/teacher/task/progress/${taskId}`)}
            variant="ghost"
            size="sm"
            className="text-xs text-text-secondary hover:text-text-primary px-2"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Progress
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-accent-info" />
            Submission Reviews
          </h1>
        </div>

        <Button
          onClick={fetchSubmissions}
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Main Panel splitting List & Code viewer */}
      {loading && submissions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent-info animate-spin" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Code className="w-12 h-12 text-text-muted" />
          <p className="text-base font-semibold text-text-primary">
            No Submissions Found
          </p>
          <p className="text-sm text-text-secondary">
            No students have started or saved their code for this task yet.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          
          {/* Submissions Sidebar List */}
          <aside className="w-72 border-r border-border bg-bg-surface flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-border bg-bg-elevated text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Student List
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {submissions.map(sub => {
                const isSelected = selectedSubmission?.id === sub.id;
                
                let subBadge = "pending";
                if (sub.status === "submitted") subBadge = "submitted";
                else if (sub.status === "in_progress") subBadge = "in-progress";
                else if (sub.status === "auto_submitted") subBadge = "absent";

                return (
                  <button
                    key={sub.id}
                    onClick={() => selectSubmission(sub)}
                    className={`w-full text-left p-3.5 flex flex-col gap-1 transition-all ${
                      isSelected 
                        ? "bg-accent-info/10 border-l-4 border-l-accent-info" 
                        : "hover:bg-bg-elevated border-l-4 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-text-primary truncate">
                        {sub.student_name}
                      </span>
                      <StatusBadge status={subBadge} />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-text-muted font-mono mt-1">
                      <span>Roll No: {sub.roll_no}</span>
                      {sub.score !== null ? (
                        <span className="text-accent-success font-bold">
                          Score: {sub.score}
                        </span>
                      ) : (
                        <span className="italic text-text-muted">Unscored</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Code Review & Scoring Panel */}
          <main className="flex-1 flex flex-col min-w-0 bg-bg-base">
            {selectedSubmission ? (
              <div className="flex-1 flex flex-col min-h-0">
                
                {/* Header Sub-Info */}
                <div className="p-4 bg-bg-surface border-b border-border flex items-center justify-between flex-shrink-0">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-text-primary">
                      Reviewing: {selectedSubmission.student_name}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <span className="font-mono bg-bg-base/60 px-1.5 py-0.5 rounded text-[10px] uppercase">
                        {selectedSubmission.language || "Plain Text"}
                      </span>
                      {selectedSubmission.submitted_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-text-muted" />
                          Finalized: {new Date(selectedSubmission.submitted_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-bg-elevated border border-border px-3 py-1 rounded">
                    <span className="text-xs text-text-muted">Status:</span>
                    <span className="text-xs font-semibold capitalize text-text-primary">
                      {selectedSubmission.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Monaco Editor Code Display */}
                <div className="flex-1 overflow-hidden relative border-b border-border">
                  <Editor
                    height="100%"
                    language={selectedSubmission.language?.toLowerCase() || "plaintext"}
                    value={selectedSubmission.code || ""}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      domReadOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>

                {/* Scoring Actions Bar */}
                <div className="p-4 bg-bg-surface border-t border-border flex-shrink-0 flex items-center justify-between">
                  <form onSubmit={handleSaveScore} className="flex items-center gap-4 w-full max-w-lg">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="score" className="text-xs font-bold text-text-secondary uppercase whitespace-nowrap">
                        Grade / Score:
                      </Label>
                      <Input
                        id="score"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        placeholder="e.g. 85.5"
                        className="w-28 bg-bg-base border-border font-mono text-sm text-text-primary focus-visible:ring-accent-info"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={savingScore}
                      size="sm"
                      className="bg-accent-info hover:bg-accent-info/90 text-white font-bold h-9"
                    >
                      {savingScore ? "Saving..." : "Save Score"}
                    </Button>
                  </form>

                  {selectedSubmission.score !== null && (
                    <div className="flex items-center gap-2 text-accent-success font-semibold text-sm bg-accent-success/5 border border-accent-success/20 px-3 py-1.5 rounded">
                      <CheckCircle className="w-4 h-4" />
                      <span>Graded: {selectedSubmission.score} / 100</span>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-text-muted text-xs italic gap-1.5">
                <FileCode className="w-8 h-8 text-text-muted" />
                Select a student submission to review code and assign grades.
              </div>
            )}
          </main>

        </div>
      )}

    </div>
  );
}
