import React, { useState } from "react";
import { submitAssignmentWork, ApiError } from "@/data/mockClassrooms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Award,
  X,
  Paperclip,
  RefreshCw,
  Clock,
  ExternalLink,
  MessageSquare,
} from "lucide-react";

export function StudentSubmissionModal({
  assignment,
  onClose,
  onSubmissionSuccess,
}) {
  const {
    id,
    title,
    description,
    attachment_url,
    due_at,
    submission_status,
    my_submission,
  } = assignment;

  const [textContent, setTextContent] = useState(my_submission?.text_content || "");
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(!my_submission);

  const hasSubmitted = !!my_submission;
  const isGraded = my_submission?.grade !== null && my_submission?.grade !== undefined;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("File size exceeds maximum limit of 20MB.");
      return;
    }

    setFileName(file.name);
    setFileType(file.type || "application/octet-stream");

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result); // Base64 data URI
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!textContent.trim() && !fileData && !my_submission?.file_url) {
      setError("Please enter a text response or attach a solution file.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        text_content: textContent.trim(),
      };
      if (fileData) {
        payload.file_data = fileData;
        payload.file_filename = fileName;
        payload.file_content_type = fileType;
      }

      const updated = await submitAssignmentWork(id, payload);
      if (onSubmissionSuccess) {
        onSubmissionSuccess(id, updated);
      }
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Failed to submit assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] max-w-2xl w-full p-6 space-y-6 relative shadow-2xl page-enter my-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold text-accent-500 border-accent-500/30">
                Assignment #{id}
              </Badge>
              {due_at && (
                <span className="text-xs text-text-muted flex items-center gap-1 tnum">
                  <Clock className="w-3 h-3" />
                  Due {new Date(due_at).toLocaleDateString()}
                </span>
              )}
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

        {/* Assignment Brief */}
        <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-bg-base/70 border border-border">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Instructions
          </h4>
          <p className="text-xs sm:text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {description || "No specific instructions provided by instructor."}
          </p>

          {attachment_url && (
            <div className="pt-2">
              <a
                href={attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-accent-500 bg-accent-500/10 border border-accent-500/30 px-3 py-1.5 rounded-[var(--radius-sm)] hover:underline"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Download Teacher Attachment Material</span>
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          )}
        </div>

        {/* Existing Graded Result Callout */}
        {isGraded && (
          <div className="p-4 rounded-[var(--radius-md)] border border-accent-success/30 bg-accent-success/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-accent-success" />
                <span className="text-xs font-semibold text-accent-success">
                  Evaluated by Faculty
                </span>
              </div>
              <span className="text-sm font-bold text-accent-success tnum">
                Grade: {my_submission.grade}/100
              </span>
            </div>
            {my_submission.feedback && (
              <div className="text-xs text-text-primary bg-bg-base/60 p-2.5 rounded-[var(--radius-sm)] border border-border/80 mt-1">
                <span className="font-semibold text-text-secondary block mb-0.5">Faculty Feedback:</span>
                <p className="whitespace-pre-wrap">{my_submission.feedback}</p>
              </div>
            )}
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-md)] text-xs text-accent-critical flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submitted Work Overview (When NOT in editing mode) */}
        {hasSubmitted && !isEditing ? (
          <div className="space-y-4 p-4 rounded-[var(--radius-md)] border border-border bg-bg-surface-3/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-success" />
                <span className="text-xs font-semibold text-text-primary">
                  Your Current Submission
                </span>
                {my_submission?.is_late && (
                  <Badge variant="warning" className="text-[10px] py-0 px-1.5">Late</Badge>
                )}
              </div>
              <span className="text-[11px] text-text-muted tnum">
                Submitted {new Date(my_submission?.submitted_at).toLocaleString()}
              </span>
            </div>

            {my_submission?.text_content && (
              <div className="text-xs text-text-primary bg-bg-base p-3 rounded-[var(--radius-sm)] border border-border">
                <p className="whitespace-pre-wrap">{my_submission.text_content}</p>
              </div>
            )}

            {my_submission?.file_url && (
              <div>
                <a
                  href={my_submission.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-500 hover:underline"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>View Attached Solution File</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="text-xs h-8 px-3 gap-1.5 border-border"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Resubmit Work</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Submission Form (New or Resubmission) */
          <form onSubmit={handleSubmit} className="space-y-4">
            {hasSubmitted && (
              <div className="p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-[var(--radius-md)] flex items-start gap-2.5 text-xs text-accent-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Resubmission Notice: </span>
                  Submitting new work will overwrite your previous submission and reset any existing grading for re-evaluation.
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-primary block">
                Text Response / Solution Write-Up
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Type your response, approach explanation, or paste git repository links..."
                rows={4}
                className="w-full rounded-[var(--radius-md)] border border-border bg-bg-base p-3 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20"
              />
            </div>

            {/* File Attachment Upload */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-primary block">
                Attach Solution File (Optional, max 20MB)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 border border-border border-dashed rounded-[var(--radius-md)] bg-bg-base hover:bg-bg-surface-3 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-colors">
                  <UploadCloud className="w-4 h-4 text-accent-500" />
                  <span>{fileName ? `Change File (${fileName})` : "Choose File to Attach"}</span>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                {fileName && (
                  <span className="text-xs text-text-muted truncate max-w-xs">
                    {fileName}
                  </span>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              {hasSubmitted && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="h-8 text-xs text-text-secondary"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={submitting}
                className="h-9 px-4 text-xs font-semibold gap-1.5 btn-press"
              >
                {submitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>{hasSubmitted ? "Confirm & Resubmit" : "Submit Assignment"}</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
