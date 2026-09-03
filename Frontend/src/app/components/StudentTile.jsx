import { useState, useEffect } from "react";
import { cn } from "../components/ui/utils";

// Compact text-only card — matches the design (EduSync_Monitor v03.svg):
// name | roll, a live mm:ss "connected for" pill + a Violations line on
// viewing/active students only, dimmed to a plain border with just the
// name and last-seen time once a student drops to idle/offline.
//
// Note: the design shows a roll number next to the name (e.g. "Mrugank
// Darji | 09"). The live roster endpoint (GET /sessions/:id/students)
// doesn't currently return roll_no, so `rollNo` renders only when present
// — ask before wiring that through on the backend.
export function StudentTile({ student, onClick, className, children }) {
  const displayName = student.name?.trim() || "Unnamed student";
  const isActive = student.status === "active";

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive || !student.joinedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive, student.joinedAt]);

  const connectedFor = (() => {
    if (!isActive || !student.joinedAt) return null;
    const secs = Math.max(0, Math.floor((now - new Date(student.joinedAt).getTime()) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  const lastSeenTime = student.status === "idle" && student.lastExitAt
    ? student.lastExitAt
    : student.joinedAt;

  const Container = onClick ? "button" : "div";

  return (
    <Container
      {...(onClick && { type: "button", onClick, "aria-label": `View ${displayName} — ${student.status || "unknown"}` })}
      className={cn(
        "relative text-left p-3.5 rounded-[var(--radius-lg)] bg-bg-surface border transition-colors duration-150",
        isActive ? "border-accent-500" : "border-border",
        onClick && "cursor-pointer w-full hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
        className
      )}
    >
      {connectedFor && (
        <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-bg-elevated text-accent-500 text-[11px] font-bold tnum">
          {connectedFor}
        </span>
      )}

      <div className={cn("text-sm font-medium truncate", isActive ? "text-text-primary" : "text-text-secondary")} title={displayName}>
        {displayName}
        {student.rollNo && (
          <>
            <span className="mx-1.5 text-text-muted">|</span>
            <span className="tnum">{student.rollNo}</span>
          </>
        )}
      </div>

      <div className="flex items-end justify-between mt-1.5 min-h-[16px]">
        {isActive && student.violations !== undefined ? (
          <span className="text-xs text-text-muted">
            Violations: <span className="tnum">{String(student.violations).padStart(2, "0")}</span>
          </span>
        ) : (
          <span />
        )}
        {lastSeenTime && (
          <span className="text-xs text-text-muted tnum">
            {new Date(lastSeenTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {student.status === "offline" && (
        <div className="text-xs text-text-muted mt-1">Disconnected</div>
      )}

      {children}
    </Container>
  );
}
