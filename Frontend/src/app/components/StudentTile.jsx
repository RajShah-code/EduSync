import { useState, useEffect } from "react";
import { cn } from "../components/ui/utils";
import { useTimeFormat } from "../utils/timeFormat";

// Compact text-only monitor card with three visual states, matching the
// v03 monitor design references. Every card is a fixed 276.79×80.68 with a
// 19.75px radius and a 1pt border; only the surface / border / text colours
// change per state:
//
//   1. "violating"  — student is currently Not Viewing (status: idle).
//      #1e1e1e surface, #996ed7 border, a live mm:ss pill top-right
//      (62×27, #2b2b2b) counting how long they've been out of the lecture.
//   2. "flagged"    — back to viewing (status: active) but has a violation
//      history. #171717 surface, dim #503970 border, no pill; Violations
//      line still shown.
//   3. "clean"      — viewing with zero violations (also the fallback for
//      offline/left). #121212 surface, near-black #1f162b border, dimmer
//      name, no Violations line.
//
// Type is Manrope throughout: name / roll / "Violations:" / count at weight
// 500, the bottom-right time at 400. Sizes are the design's pt values
// converted to px (×4/3).
//
// Note: the design shows a roll number next to the name (e.g. "Mrugank
// Darji | 09"). The live roster endpoint (GET /sessions/:id/students)
// doesn't currently return roll_no, so `rollNo` renders only when present
// — ask before wiring that through on the backend.
export function StudentTile({ student, onClick, className, children }) {
  const displayName = student.name?.trim() || "Unnamed student";
  const { formatTimeOfDay } = useTimeFormat();

  const isViolating = student.status === "idle";
  const hasViolations = Number(student.violations) > 0;
  const variant = isViolating ? "violating" : hasViolations ? "flagged" : "clean";

  // Live-counting timer for the violating state: time since they dropped
  // out of the lecture (last fullscreen/tab exit), falling back to join time.
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

  const lastSeenTime = student.status === "idle" && student.lastExitAt
    ? student.lastExitAt
    : student.joinedAt;

  const Container = onClick ? "button" : "div";

  return (
    <Container
      {...(onClick && { type: "button", onClick, "aria-label": `View ${displayName} — ${student.status || "unknown"}` })}
      className={cn(
        "relative flex flex-col justify-center overflow-hidden text-left w-[276.7928px] h-[80.6809px] px-4 rounded-[19.745px] border-[1.333px]",
        "transition-[border-color,color,transform,background-color] duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none",
        variant === "violating" && "bg-[#1e1e1e] border-[#996ed7]",
        variant === "flagged" && "bg-[#171717] border-[#503970]",
        variant === "clean" && "bg-[#121212] border-[#1f162b]",
        onClick &&
          "cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        onClick && variant === "violating" && "hover:border-[#b28fe0]",
        onClick && variant === "flagged" && "hover:border-[#6a4d94]",
        onClick && variant === "clean" && "hover:border-[#33264a]",
        className
      )}
    >
      {outFor && (
        <span className="absolute -top-3 right-4 flex items-center justify-center w-[62px] h-[27px] rounded-[12px] bg-[#2b2b2b] text-[#996ed7] text-[13px] font-normal leading-none tnum">
          {outFor}
        </span>
      )}

      {/* Primary line — name (28px) is the focal point; roll (26.2px) trails
          it behind a thin 12px separator rule. Manrope Medium (500). */}
      <div
        className="flex items-baseline gap-1.5 min-w-0 font-medium leading-tight tracking-[-0.01em]"
        title={student.rollNo ? `${displayName} · ${student.rollNo}` : displayName}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            variant === "clean" ? "text-[28.2px]" : "text-[28px]",
            variant === "violating" && "text-[#d4d4d4]",
            variant === "flagged" && "text-[#b4b4b4]",
            variant === "clean" && "text-[#949494]"
          )}
        >
          {displayName}
        </span>
        {student.rollNo && (
          <span
            className={cn(
              "shrink-0 flex items-center gap-1.5 text-[26.23px] tnum",
              variant === "violating" ? "text-[#909090]" : "text-text-muted"
            )}
          >
            <span
              className={cn(
                "inline-block h-[12.041px] w-0 border-l-[0.888px]",
                variant === "violating" ? "border-[#6b6b78]" : "border-text-muted/70"
              )}
              aria-hidden="true"
            />
            {student.rollNo}
          </span>
        )}
      </div>

      {/* Meta line — "Violations:" 19.7px + its count 16.6px at weight 500,
          both #5e5e5e; the bottom-right time is 14.9px / weight 400 /
          #595959 on every card. */}
      <div className="flex items-baseline justify-between gap-3 mt-2 min-h-[20px]">
        {variant !== "clean" && student.violations !== undefined ? (
          <span className="text-[19.693px] font-medium text-[#5e5e5e]">
            Violations:{" "}
            <span className="text-[16.6px] tnum">{String(student.violations).padStart(2, "0")}</span>
          </span>
        ) : (
          <span />
        )}
        {lastSeenTime && (
          <span className="shrink-0 text-[14.893px] font-normal text-[#595959] tnum">
            {formatTimeOfDay(lastSeenTime)}
          </span>
        )}
      </div>

      {student.status === "offline" && (
        <div className="text-[14.893px] font-normal text-[#595959] mt-1">Disconnected</div>
      )}

      {children}
    </Container>
  );
}
