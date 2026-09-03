import { useState, useEffect } from "react";
import { useTimeFormat } from "../utils/timeFormat";
import "./StudentTile.css";

// Compact roster card for the Student Monitor, rebuilt from the Figma
// "Teacher | Monitor" frame (EduSync -v01). All styling lives in
// StudentTile.css — three states keyed by a modifier class:
//
//   "violating"  status: idle  — out of the lecture right now. Bright violet
//                border + a live mm:ss pill counting how long they've been out.
//   "flagged"    status: active + violations > 0 — back in the lecture but
//                carrying a violation history. Dim violet border, no pill.
//   "clean"      status: active + no violations (also the offline / left
//                fallback). Near-black border, dimmed name, no Violations line.
//
// Note: the design shows a roll number next to the name ("Mrugank Darji | 09").
// The live roster endpoint (GET /sessions/:id/students) doesn't return roll_no
// yet, so `rollNo` renders only when present.
export function StudentTile({ student, onClick, className, children }) {
  const displayName = student.name?.trim() || "Unnamed student";
  const { formatTimeOfDay } = useTimeFormat();

  const isViolating = student.status === "idle";
  const hasViolations = Number(student.violations) > 0;
  const variant = isViolating ? "violating" : hasViolations ? "flagged" : "clean";

  // Live-counting timer for the violating state: time since they dropped out
  // of the lecture (last fullscreen / tab exit), falling back to join time.
  const violatingSince = isViolating
    ? student.lastExitAt || student.joinedAt
    : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!violatingSince) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [violatingSince]);

  const outFor = (() => {
    if (!violatingSince) return null;
    const secs = Math.max(0, Math.floor((now - new Date(violatingSince).getTime()) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  const lastSeenTime =
    isViolating && student.lastExitAt ? student.lastExitAt : student.joinedAt;
  const timeLabel = lastSeenTime ? formatTimeOfDay(lastSeenTime) : null;

  const Container = onClick ? "button" : "div";

  return (
    <Container
      {...(onClick && {
        type: "button",
        onClick,
        "aria-label": `View ${displayName} — ${student.status || "unknown"}`,
      })}
      className={["st-card", `st-card--${variant}`, className].filter(Boolean).join(" ")}
    >
      {outFor && <span className="st-card__pill">{outFor}</span>}

      <div
        className="st-card__name"
        title={student.rollNo ? `${displayName} · ${student.rollNo}` : displayName}
      >
        <span className="st-card__name-text">{displayName}</span>
        {student.rollNo && (
          <>
            <span className="st-card__sep" aria-hidden="true" />
            <span className="st-card__roll">{student.rollNo}</span>
          </>
        )}
      </div>

      {variant !== "clean" && student.violations !== undefined && (
        <div className="st-card__violations">
          Violations: <span>{String(student.violations).padStart(2, "0")}</span>
        </div>
      )}

      {timeLabel && <span className="st-card__time">{timeLabel}</span>}

      {student.status === "offline" && (
        <div className="st-card__disconnected">Disconnected</div>
      )}

      {children}
    </Container>
  );
}
