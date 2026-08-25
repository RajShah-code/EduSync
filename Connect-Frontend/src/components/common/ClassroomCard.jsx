import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseClassroomDisplayName, getClassMonogram } from "@/lib/utils";
import { Users, MessageSquare, ArrowUpRight, Lock, MessagesSquare, Calendar } from "lucide-react";

export function ClassroomCard({
  classroom,
  role = "teacher",
  onSelect,
}) {
  const {
    id,
    display_name,
    class_name,
    subject_name,
    teacher_name,
    posting_mode = "teacher_only",
    unread_messages = 0,
    created_at,
  } = classroom;

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
    <Card className="flex flex-col justify-between border border-border bg-bg-surface card-hover overflow-hidden relative group">
      {/* Top role-accent border indicator */}
      <div className="h-[2px] w-full bg-accent-500/40 group-hover:bg-accent-500 transition-colors" />

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

            {/* Unread WhatsApp-style message count badge */}
            {unread_messages > 0 ? (
              <Badge variant="default" className="gap-1 font-semibold tnum shrink-0">
                <MessageSquare className="w-3 h-3" />
                {unread_messages}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] py-0 px-2 h-4 shrink-0 font-normal">
                {posting_mode === "open" ? "Open" : "Broadcast"}
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

            {/* Channel mode */}
            <div className="flex items-center gap-1.5 text-text-secondary">
              {posting_mode === "open" ? (
                <div className="flex items-center gap-1 text-accent-success">
                  <MessagesSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-medium">Open chat</span>
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

        <Button
          size="sm"
          variant="secondary"
          onClick={() => onSelect && onSelect(classroom)}
          className="h-8 px-3 text-xs gap-1.5 group-hover:border-accent-500/40 group-hover:text-text-primary"
        >
          <span>Open Room</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-500 transition-colors" />
        </Button>
      </CardFooter>
    </Card>
  );
}
