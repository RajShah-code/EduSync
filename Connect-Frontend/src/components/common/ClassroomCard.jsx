import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseClassroomDisplayName, getClassMonogram } from "@/lib/utils";
import { deleteOwnClassroom, ApiError } from "@/data/mockClassrooms";
import {
  Users,
  MessageSquare,
  ArrowUpRight,
  Lock,
  Calendar,
  Archive,
  Trash2,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";

export function ClassroomCard({
  classroom,
  role = "teacher",
  onSelect,
  onDeleted,
}) {
  const {
    id,
    display_name,
    class_name,
    subject_name,
    teacher_name,
    unread_messages = 0,
    created_at,
    status = "active",
  } = classroom;

  const isArchived = status === "archived";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteOwnClassroom(id);
      setConfirmingDelete(false);
      onDeleted && onDeleted(id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete classroom.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Parse compound display_name (e.g. "FYBCA(Data Structures)", "Math(Teacher1)", "SYBCA", "Data Structures")
  const parsed = parseClassroomDisplayName(display_name || subject_name || class_name || "Classroom");
  const monogram = getClassMonogram(parsed.title);

  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Card
      className={`flex flex-col justify-between border border-border bg-bg-surface overflow-hidden relative group transition-[opacity,filter] duration-200 ${
        isArchived ? "opacity-60 grayscale-[0.35] hover:opacity-80" : "card-hover"
      }`}
    >
      {/* Top role-accent border indicator */}
      <div
        className={`h-[2px] w-full transition-colors ${
          isArchived ? "bg-text-muted/30" : "bg-accent-500/40 group-hover:bg-accent-500"
        }`}
      />

      <div>
        <CardHeader className="p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Monogram Badge */}
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-bg-surface-3 border border-border flex items-center justify-center font-semibold text-sm text-text-primary tracking-wider group-hover:border-accent-500/40 transition-colors shrink-0">
                {monogram}
              </div>

              <div>
                <CardTitle className="text-base font-semibold text-text-primary leading-tight">
                  {parsed.title}
                </CardTitle>

                {/* Subtitle / Subject or Instructor Detail */}
                <div className="flex items-center gap-2 mt-1">
                  {parsed.detail ? (
                    <span className="text-xs font-medium text-accent-500">
                      {parsed.detail}
                    </span>
                  ) : null}

                  {role === "teacher" && class_name && !parsed.detail && (
                    <span className="text-xs text-text-secondary">
                      {class_name}
                    </span>
                  )}

                  {role === "student" && teacher_name && !parsed.detail && (
                    <span className="text-xs text-text-secondary">
                      Instructor: {teacher_name}
                    </span>
                  )}

                  {role === "student" && teacher_name && parsed.detail && (
                    <span className="text-xs text-text-muted">
                      • {teacher_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Archived badge takes priority over unread — an archived
                room is read-only, so unread count is moot. */}
            {isArchived ? (
              <Badge variant="outline" className="gap-1 text-[10px] py-0 px-2 h-4 shrink-0 font-normal text-text-muted border-border">
                <Archive className="w-3 h-3" />
                Archived
              </Badge>
            ) : unread_messages > 0 ? (
              <Badge variant="default" className="gap-1 font-semibold tnum shrink-0">
                <MessageSquare className="w-3 h-3" />
                {unread_messages}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] py-0 px-2 h-4 shrink-0 font-normal">
                Broadcast
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-5 py-3 space-y-3">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary pt-2 border-t border-border">
            {/* Subject info */}
            <div className="flex items-center gap-1.5 text-text-secondary truncate">
              <span className="text-text-muted font-medium">Subject:</span>
              <span className="text-text-primary truncate font-medium">{subject_name || parsed.detail || "General"}</span>
            </div>

            {/* Channel mode — every classroom is faculty broadcast only,
                except an archived one which is read-only for everyone. */}
            <div className="flex items-center gap-1.5 text-text-secondary">
              {isArchived ? (
                <div className="flex items-center gap-1 text-text-muted">
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Read-only</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-text-muted">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Faculty only</span>
                </div>
              )}
            </div>

            {/* Created date */}
            {formattedDate && (
              <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Created {formattedDate}</span>
              </div>
            )}
          </div>
        </CardContent>
      </div>

      <CardFooter className="p-5 pt-3 border-t border-border bg-bg-surface-3/30 flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">
          Channel #{id}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Delete is teacher-only, and only once archived — a student
              sharing this room never gets a way to destroy it for everyone. */}
          {role === "teacher" && isArchived && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setDeleteError(null);
                setConfirmingDelete(true);
              }}
              title="Delete this archived classroom"
              aria-label="Delete this archived classroom"
              className="h-8 w-8 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSelect && onSelect(classroom)}
            className="h-8 px-3 text-xs gap-1.5 group-hover:border-accent-500/40 group-hover:text-text-primary"
          >
            <span>Open Room</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-500 transition-colors" />
          </Button>
        </div>
      </CardFooter>

      {/* Delete confirmation — matches the confirm-modal pattern already
          established in AdminAllotments.jsx */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in zoom-in duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-accent-critical/30 bg-bg-surface shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-accent-critical">
              <div className="w-10 h-10 rounded-full bg-accent-critical/10 border border-accent-critical/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-text-primary">Delete this classroom?</h3>
                <p className="text-xs text-text-muted">This permanently removes channel #{id} and its history.</p>
              </div>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="p-1 text-text-muted hover:text-text-primary rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed bg-bg-base p-3 rounded-[var(--radius-md)] border border-border">
              This classroom was archived because its curriculum allotment was removed. Deleting it also permanently
              removes all its messages, polls, assignments, and materials for every member — this cannot be undone.
            </p>

            {deleteError && (
              <p className="text-xs text-accent-critical bg-accent-critical/10 border border-accent-critical/25 rounded-[var(--radius-md)] p-2.5">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} disabled={isDeleting} className="h-8 text-xs text-text-secondary">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="h-8 text-xs font-semibold gap-1.5 px-3 bg-accent-critical hover:bg-accent-critical/90 text-white"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? "Deleting…" : "Confirm Delete"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
