import React, { useState, useEffect } from "react";
import {
  fetchAssignmentSubmissions,
  gradeStudentSubmission,
  ApiError,
} from "@/data/mockClassrooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  Award,
  AlertTriangle,
  CheckCircle2,
  X,
  Paperclip,
  RefreshCw,
  ExternalLink,
  Search,
  MessageSquare,
} from "lucide-react";

export function TeacherGradingModal({ assignment, onClose }) {
  const { id, title, due_at } = assignment;
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Selected submission for grading
  const [selectedSub, setSelectedSub] = useState(null);
  const [gradeInput, setGradeInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssignmentSubmissions(id);
      setSubmissions(data);
      if (data.length > 0 && !selectedSub) {
        setSelectedSub(data[0]);
        setGradeInput(data[0].grade !== null && data[0].grade !== undefined ? String(data[0].grade) : "");
        setFeedbackInput(data[0].feedback || "");
      }
    } catch (err) {
      setError(err.message || "Failed to load student submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadSubmissions();
    }
  }, [id]);

  const handleSelectSubmission = (sub) => {
    setSelectedSub(sub);
    setGradeInput(sub.grade !== null && sub.grade !== undefined ? String(sub.grade) : "");
    setFeedbackInput(sub.feedback || "");
    setSaveSuccess(false);
  };

  const handleSaveGrade = async (e) => {
    if (e) e.preventDefault();
    if (!selectedSub || gradeInput === "" || savingGrade) return;

    setSavingGrade(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated = await gradeStudentSubmission(selectedSub.id, {
        grade: Number(gradeInput),
        feedback: feedbackInput,
      });

      if (updated) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === selectedSub.id ? { ...s, ...updated } : s))
        );
        setSelectedSub((prev) => ({ ...prev, ...updated }));
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setError(err.message || "Failed to save grade.");
    } finally {
      setSavingGrade(false);
    }
  };

  const filteredSubmissions = submissions.filter((sub) =>
    sub.student_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] max-w-4xl w-full p-6 space-y-6 relative shadow-2xl page-enter my-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold text-accent-500 border-accent-500/30">
                Evaluation Panel • Assignment #{id}
              </Badge>
              <span className="text-xs text-text-muted">
                {submissions.length} {submissions.length === 1 ? "submission" : "submissions"} received
              </span>
            </div>
            <h2 className="text-lg font-bold text-text-primary leading-snug">
              {title}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-md)] text-xs text-accent-critical flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Two-Column Workspace: Left Submission List, Right Grading Detail */}
        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-[var(--radius-md)] border border-border bg-bg-surface-3 animate-pulse"
              />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-md)] bg-bg-base/40 flex flex-col items-center justify-center">
            <Users className="w-8 h-8 text-text-muted mb-2" />
            <p className="text-sm font-semibold text-text-primary">No submissions turned in yet</p>
            <p className="text-xs text-text-secondary mt-1 max-w-sm">
              When students submit their solutions or code attachments, they will appear here for grading and feedback.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[380px]">
            {/* Left Column: Submissions List */}
            <div className="md:col-span-5 space-y-3 border-r border-border pr-4">
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search students..."
                  className="pl-8 bg-bg-base border-border text-xs h-8"
                />
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>

              <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                {filteredSubmissions.map((sub) => {
                  const isSelected = selectedSub?.id === sub.id;
                  const isGraded = sub.grade !== null && sub.grade !== undefined;

                  return (
                    <div
                      key={sub.id}
                      onClick={() => handleSelectSubmission(sub)}
                      className={`p-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors space-y-1.5 ${
                        isSelected
                          ? "border-accent-500 bg-accent-500/10 text-text-primary"
                          : "border-border bg-bg-base hover:border-border-hover text-text-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-primary">
                          {sub.student_name}
                        </span>

                        {isGraded ? (
                          <Badge
                            variant="success"
                            className="text-[10px] py-0 px-1.5 bg-accent-success/15 text-accent-success border-accent-success/30 font-semibold tnum"
                          >
                            {sub.grade}/100
                          </Badge>
                        ) : sub.is_late ? (
                          <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                            Late
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            Submitted
                          </Badge>
                        )}
                      </div>

                      <span className="text-[10px] text-text-muted block tnum">
                        {new Date(sub.submitted_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Selected Submission Detail & Grade Box */}
            {selectedSub && (
              <div className="md:col-span-7 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {selectedSub.student_name}&apos;s Work
                    </h3>
                    <span className="text-[11px] text-text-muted tnum">
                      Submitted {new Date(selectedSub.submitted_at).toLocaleString()}
                    </span>
                  </div>

                  {selectedSub.is_late && (
                    <Badge variant="warning" className="text-[10px]">
                      Turned in Late
                    </Badge>
                  )}
                </div>

                {/* Submission Content */}
                <div className="space-y-2 p-3.5 rounded-[var(--radius-md)] bg-bg-base border border-border">
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
                    Student Response
                  </span>
                  <p className="text-xs sm:text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {selectedSub.text_content || "No text write-up provided."}
                  </p>

                  {selectedSub.file_url && (
                    <div className="pt-2 border-t border-border/70 mt-2">
                      <a
                        href={selectedSub.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-accent-500 hover:underline"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Download Student Attached File</span>
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Success Feedback */}
                {saveSuccess && (
                  <div className="p-2.5 bg-accent-success/10 border border-accent-success/30 rounded-[var(--radius-md)] text-xs text-accent-success flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Grade and feedback recorded successfully!</span>
                  </div>
                )}

                {/* Grading Form */}
                <form onSubmit={handleSaveGrade} className="space-y-3 pt-1">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1 space-y-1">
                      <label className="text-[11px] font-medium text-text-secondary">
                        Score (0-100)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={gradeInput}
                        onChange={(e) => setGradeInput(e.target.value)}
                        placeholder="e.g. 95"
                        className="bg-bg-base border-border text-xs h-8 tnum font-semibold"
                        required
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] font-medium text-text-secondary">
                        Feedback & Remarks
                      </label>
                      <Input
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        placeholder="e.g. Clean solution, good test coverage!"
                        className="bg-bg-base border-border text-xs h-8"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      disabled={gradeInput === "" || savingGrade}
                      className="h-8 px-3 text-xs font-semibold gap-1.5 btn-press"
                    >
                      {savingGrade ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Award className="w-3.5 h-3.5" />
                          <span>Save Evaluation</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
