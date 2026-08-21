import { cn } from "../components/ui/utils";
import { StatusBadge } from "./StatusBadge";
import { User } from "lucide-react";

export function StudentTile({ student, onClick, className, children }) {
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

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex flex-col bg-bg-surface overflow-hidden group card-hover rounded-[var(--radius-lg)]",
        onClick && "cursor-pointer",
        className
      )}
      style={getTileStyle()}
    >
      {/* Screen Preview */}
      <div className="relative h-24 bg-bg-base flex items-center justify-center rounded-t-[var(--radius-lg)]">
        {student.screenPreview ? (
          <img
            src={student.screenPreview}
            alt={`${student.name}'s screen`}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-8 h-8 text-text-muted" />
        )}
        {getOverlay() && (
          <div className={cn("absolute inset-0", getOverlay())} />
        )}

        {/* Status Badge - Top Right */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={student.status} />
        </div>
      </div>

      {/* Student Info */}
      <div className="p-3 space-y-1">
        <div className="font-medium text-sm text-text-primary truncate">
          {student.name}
        </div>
        {student.joinedAt && (
          <div className="text-xs text-text-muted font-mono">
            Joined: {new Date(student.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {student.status === "idle" && student.lastExitAt && (
          <div className="text-xs font-mono text-accent-warning">
            Away since: {new Date(student.lastExitAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
        {student.status === "idle" && student.idleTime !== undefined && (
          <div className="text-xs font-mono text-accent-warning">
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
    </div>
  );
}
