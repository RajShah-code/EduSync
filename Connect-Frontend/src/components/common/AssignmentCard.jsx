import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Clock,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Award,
  Users,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export function AssignmentCard({
  assignment,
  role = "student",
  onOpenAction,
}) {
  const {
    id,
    title,
    description,
    attachment_url,
    due_at,
    created_at,
    submission_status,
    my_submission,
    submission_count = 0,
  } = assignment;

  const isTeacher = role === "teacher";

  // Calculate Due Date Status
  const now = new Date();
  const dueDate = due_at ? new Date(due_at) : null;
  const isPastDue = dueDate ? dueDate < now : false;
  const isApproachingDue = dueDate && !isPastDue ? dueDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000 : false;

  const formattedDueDate = dueDate
    ? dueDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Student Status Configuration
  const getStatusBadge = () => {
    if (isTeacher) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs py-0.5 px-2 bg-bg-surface-3 text-text-secondary">
          <Users className="w-3 h-3" />
          <span className="tnum font-semibold">{submission_count}</span>
          <span>{submission_count === 1 ? "submission" : "submissions"}</span>
        </Badge>
      );
    }

    switch (submission_status) {
      case "graded":
        return (
          <Badge
            variant="success"
            className="gap-1 text-xs py-0.5 px-2 bg-accent-success/15 text-accent-success border-accent-success/30 font-semibold"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Graded: {my_submission?.grade}/100</span>
          </Badge>
        );
      case "late":
        return (
          <Badge
            variant="warning"
            className="gap-1 text-xs py-0.5 px-2 bg-accent-warning/15 text-accent-warning border-accent-warning/30 font-medium"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Submitted Late</span>
          </Badge>
        );
      case "submitted":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-xs py-0.5 px-2 bg-accent-500/10 text-accent-500 border-accent-500/30 font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Submitted</span>
          </Badge>
        );
      default:
        return (
          <Badge
            variant={isPastDue ? "destructive" : "secondary"}
            className={`gap-1 text-xs py-0.5 px-2 font-medium ${
              isPastDue
                ? "bg-accent-critical/15 text-accent-critical border-accent-critical/30"
                : isApproachingDue
                ? "bg-accent-warning/15 text-accent-warning border-accent-warning/30"
                : "bg-bg-surface-3 text-text-secondary"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isPastDue ? "Missing / Overdue" : isApproachingDue ? "Due Soon" : "Assigned"}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="p-5 rounded-[var(--radius-lg)] border border-border bg-bg-surface text-text-primary card-hover transition-colors flex flex-col justify-between gap-4 relative overflow-hidden">
      {/* Top Accent Strip */}
      <div
        className={`h-[2px] w-full absolute top-0 left-0 ${
          submission_status === "graded"
            ? "bg-accent-success"
            : isPastDue && submission_status === "not_submitted"
            ? "bg-accent-critical"
            : isApproachingDue
            ? "bg-accent-warning"
            : "bg-accent-500"
        }`}
      />

      {/* Header Info */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold text-accent-500 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Task #{id}
            </span>

            {getStatusBadge()}
          </div>

          <h3 className="text-base font-semibold text-text-primary leading-snug">
            {title}
          </h3>

          {description && (
            <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Action Button */}
        <div className="shrink-0 pt-1">
          <Button
            size="sm"
            onClick={() => onOpenAction && onOpenAction(assignment)}
            className="h-8 px-3 text-xs font-semibold gap-1.5 btn-press"
          >
            <span>
              {isTeacher
                ? "Grade & Submissions"
                : submission_status === "graded"
                ? "View Feedback"
                : submission_status === "submitted" || submission_status === "late"
                ? "View / Resubmit"
                : "Submit Work"}
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Footer Info Row */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60 text-xs text-text-muted">
        {/* Due date visual */}
        <div className="flex items-center gap-1.5">
          <Clock className={`w-3.5 h-3.5 ${isPastDue ? "text-accent-critical" : isApproachingDue ? "text-accent-warning" : "text-text-muted"}`} />
          <span className="tnum">
            {formattedDueDate ? `Due ${formattedDueDate}` : "No deadline"}
          </span>
        </div>

        {/* Attachment link if available */}
        {attachment_url && (
          <a
            href={attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent-500 hover:underline text-xs"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Teacher Attachment</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
