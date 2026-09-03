import { useState, useRef, useEffect } from "react";
import { IconUserExclamation as UserExclamation, IconCheck as Check, IconX as X } from "@tabler/icons-react";
import { cn } from "./ui/utils";

// Waiting Room — the badge+popover pair that replaces the old inline banner
// on the Monitor page. Design calls for this on BOTH the Live Lecture
// control bar and the Monitor page's top bar, so it's a shared component
// rather than duplicated JSX. `pendingRejoins` must already be filtered to
// the current session by the caller.
export function WaitingRoomBadge({ pendingRejoins, onApprove, onDeny, align = "left", direction = "down", className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const count = pendingRejoins.length;

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Waiting room — ${count} student${count !== 1 ? "s" : ""} waiting to rejoin`}
        title="Waiting Room"
        className="flex items-center gap-1.5 h-[29px] px-2.5 bg-bg-surface rounded-full text-xs text-text-secondary font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        <UserExclamation className="w-4 h-4 text-accent-500" />
        <span className="tnum">{String(count).padStart(2, "0")}</span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute w-72 max-h-96 overflow-y-auto bg-bg-elevated border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-dropdown)] z-[150] p-2 space-y-1.5",
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="px-1.5 py-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <UserExclamation className="w-3.5 h-3.5 text-accent-500" />
            Waiting Room
          </div>
          {count === 0 ? (
            <div className="py-6 text-center text-xs text-text-muted">
              No students waiting to rejoin.
            </div>
          ) : (
            pendingRejoins.map((r) => (
              <div
                key={r.student_id}
                className="p-2.5 bg-bg-base border border-border rounded-[var(--radius-md)] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">
                    {r.student_name}
                  </div>
                  <div className="text-[10px] text-text-secondary">
                    Rejoin attempt #{r.rejoin_count ?? "?"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onApprove(r.student_id, r.session_id)}
                    className="p-1 bg-accent-success/15 hover:bg-accent-success/25 text-accent-success border border-accent-success/30 rounded-[var(--radius-sm)] transition-colors"
                    title="Approve Rejoin"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeny(r.student_id, r.session_id)}
                    className="p-1 bg-accent-critical/15 hover:bg-accent-critical/25 text-accent-critical border border-accent-critical/30 rounded-[var(--radius-sm)] transition-colors"
                    title="Reject Rejoin"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
