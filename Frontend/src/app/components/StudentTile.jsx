import { useState } from "react";
import { cn } from "../components/ui/utils";
import { StatusBadge } from "./StatusBadge";
import { IconUser as User, IconEyeX as EyeX } from "@tabler/icons-react";

export function StudentTile({ student, onClick, className, children }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const displayName = student.name?.trim() || "Unnamed student";
  const showPreview = student.screenPreview && !previewFailed;

  const getTileStyle = () => {
    switch (student.status) {
      case "idle":
        return {
          border: "1.5px solid color-mix(in srgb, var(--accent-warning) 35%, transparent)",
          background: "color-mix(in srgb, var(--accent-warning) 3%, transparent)",
        };
      case "offline":
        return { border: "1px solid var(--border)" };
      case "submitted":
        return { border: "1px solid color-mix(in srgb, var(--accent-success) 25%, transparent)" };
      default:
        return { border: "1px solid var(--border)" };
    }
  };

  const getOverlay = () => {
    if (student.status === "offline") {
      return "bg-bg-base/80";
    }
    if (student.status === "idle") {
      return "bg-accent-warning/5";
    }
    return "";
  };

  const Container = onClick ? "button" : "div";

  return (
    <Container
      {...(onClick && { type: "button", onClick, "aria-label": `View ${displayName}'s screen — ${student.status || "unknown"}` })}
      className={cn(
        "relative flex flex-col text-left bg-bg-surface overflow-hidden group card-hover rounded-[var(--radius-lg)]",
        onClick && "cursor-pointer w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
        className
      )}
      style={getTileStyle()}
    >
      {/* Screen Preview */}
      <div className="relative h-24 bg-bg-base flex items-center justify-center rounded-t-[var(--radius-lg)]">
        {showPreview ? (
          <img
            src={student.screenPreview}
            alt={`${displayName}'s screen`}
            className="w-full h-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <User className="w-9 h-9 text-text-muted" aria-hidden="true" />
        )}
        {getOverlay() && (
          <div className={cn("absolute inset-0", getOverlay())} />
        )}

        {/* Status Badge - Top Right. Icon/dot suppressed here so the monitor
            grid reads as clean text pills (badge label only). */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={student.status} className="[&>span:first-child]:hidden" />
        </div>
      </div>

      {/* Student Info */}
      <div className="p-3 space-y-1">
        <div className="font-medium text-sm text-text-primary truncate" title={displayName}>
          {displayName}
        </div>
        {student.joinedAt && (
          <div className="text-xs text-text-muted tnum">
            Joined: {new Date(student.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {student.status === "idle" && student.lastExitAt && (
          <div className="text-xs text-accent-warning tnum">
            Away since: {new Date(student.lastExitAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
        {student.status === "idle" && student.idleTime !== undefined && (
          <div className="text-xs text-accent-warning tnum flex items-center gap-1">
            <EyeX className="w-3 h-3 shrink-0" />
            Not Viewing: {Math.floor(student.idleTime / 60)}m {student.idleTime % 60}s
          </div>
        )}
        {student.status === "offline" && (
          <div className="text-xs text-text-muted">Disconnected</div>
        )}
        {children}
      </div>

      {/* Hover Effect */}
      {onClick && (
        <div className="absolute inset-0 bg-accent-info/0 group-hover:bg-accent-info/5 transition-colors pointer-events-none" />
      )}
    </Container>
  );
}
