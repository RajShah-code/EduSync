import React from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getClassMonogram } from "@/lib/utils";
import { Megaphone, Pin, Globe, Calendar, ShieldCheck, Sparkles } from "lucide-react";

export function AnnouncementCard({ announcement }) {
  const { id, author_name, author_role, content, is_global, created_at } = announcement;
  const monogram = getClassMonogram(author_name || (author_role === "admin" ? "Admin" : "Teacher"));
  const isAdmin = author_role === "admin";
  const isTeacher = author_role === "teacher";

  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const formattedTime = created_at
    ? new Date(created_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      className={`p-5 rounded-[var(--radius-lg)] border bg-bg-surface text-text-primary card-hover transition-colors relative overflow-hidden flex flex-col justify-between gap-3 ${
        is_global
          ? "border-admin-500/40 bg-gradient-to-br from-admin-900/20 via-bg-surface to-bg-surface"
          : "border-teacher-500/30 bg-gradient-to-br from-teacher-900/20 via-bg-surface to-bg-surface"
      }`}
    >
      {/* Top Accent Strip */}
      <div
        className={`h-[2px] w-full absolute top-0 left-0 ${
          is_global ? "bg-admin-500" : "bg-teacher-500"
        }`}
      />

      {/* Header Info */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-border shrink-0">
            <AvatarFallback
              className={`text-xs font-semibold ${
                isAdmin
                  ? "bg-admin-500/20 text-admin-500"
                  : "bg-teacher-500/20 text-teacher-500"
              }`}
            >
              {monogram}
            </AvatarFallback>
          </Avatar>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {author_name || (isAdmin ? "System Administrator" : "Faculty Member")}
              </span>

              <Badge
                variant={isAdmin ? "default" : "secondary"}
                className={`text-[10px] py-0 px-1.5 h-4 tracking-wider uppercase font-semibold ${
                  isAdmin
                    ? "bg-admin-500/20 text-admin-300 border-admin-500/40"
                    : "bg-teacher-500/20 text-teacher-300 border-teacher-500/40"
                }`}
              >
                {isAdmin ? "Admin" : "Faculty"}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
              <Calendar className="w-3 h-3 shrink-0" />
              <span className="tnum">
                {formattedDate} {formattedTime ? `• ${formattedTime}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Global or Pinned Tag */}
        <div className="shrink-0">
          {is_global ? (
            <Badge
              variant="outline"
              className="gap-1 text-[11px] font-medium bg-admin-500/10 text-admin-300 border-admin-500/40 py-0.5 px-2.5"
            >
              <Globe className="w-3 h-3 text-admin-500" />
              <span>Campus Global Notice</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-[11px] font-medium bg-teacher-500/10 text-teacher-300 border-teacher-500/40 py-0.5 px-2.5"
            >
              <Pin className="w-3 h-3 text-teacher-500" />
              <span>Classroom Announcement</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-3.5 px-4 rounded-[var(--radius-md)] bg-bg-base/60 border border-border/80 text-xs sm:text-sm text-text-primary leading-relaxed">
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>

      {/* Footer Tag */}
      <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
        <span>Notice #{id}</span>
        <span className="text-text-muted/70">Delivered to classroom stream</span>
      </div>
    </div>
  );
}
