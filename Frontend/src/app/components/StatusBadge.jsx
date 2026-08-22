import { Check, X, Circle, CircleDot, Lock, TriangleAlert, Undo2, MoreHorizontal, Minus, Hand } from "lucide-react";
import { cn } from "../components/ui/utils";

// Colors are drawn from the locked token set (theme.css) via CSS var references,
// so badges follow the app's palette automatically. `solid: true` renders a
// filled chip (white text) instead of a tinted wash — reserved for statuses
// that need to read as decisive/high-stakes (present/absent/active), not
// applied everywhere so it stays meaningful rather than loud by default.
const statusConfig = {
  live: { label: "LIVE", Icon: Circle, token: "accent-live", livePulse: true },
  active: { label: "ACTIVE", Icon: Check, token: "accent-success", solid: true },
  idle: { label: "NOT VIEWING", Icon: Circle, token: "accent-warning", pulse: true },
  offline: { label: "OFFLINE", Icon: Minus, token: "text-muted" },
  submitted: { label: "SUBMITTED", Icon: Check, token: "accent-info" },
  "in-progress": { label: "IN PROGRESS", Icon: CircleDot, token: "accent-info", pulse: true },
  doubt: { label: "DOUBT RAISED", Icon: Hand, token: "accent-warning", pulse: true },
  locked: { label: "LOCKED", Icon: Lock, token: "accent-locked" },
  "exam-live": { label: "EXAM LIVE", Icon: TriangleAlert, token: "accent-critical", livePulse: true },
  absent: { label: "ABSENT", Icon: X, token: "accent-critical", solid: true },
  present: { label: "PRESENT", Icon: Check, token: "accent-success", solid: true },
  partial: { label: "PARTIAL", Icon: Circle, token: "accent-warning" },
  pending: { label: "PENDING", Icon: MoreHorizontal, token: "text-muted" },
  graded: { label: "GRADED", Icon: Check, token: "accent-info" },
  returned: { label: "RETURNED", Icon: Undo2, token: "accent-success" },
  draft: { label: "DRAFT", Icon: MoreHorizontal, token: "text-muted" },
  waiting_room: { label: "WAITING ROOM", Icon: MoreHorizontal, token: "accent-warning", pulse: true },
  ended: { label: "ENDED", Icon: Lock, token: "accent-locked" },
};

export function StatusBadge({ status, className }) {
  const cfg = statusConfig[status] || {
    label: String(status || "UNKNOWN").toUpperCase(),
    Icon: MoreHorizontal,
    token: "text-muted",
  };
  const colorVar = `var(--${cfg.token})`;
  const Icon = cfg.Icon;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 tnum", className)}
      style={{
        padding: "3px 10px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderRadius: "var(--radius-pill)",
        color: cfg.solid ? "#fff" : colorVar,
        background: cfg.solid ? colorVar : `color-mix(in srgb, ${colorVar} 12%, transparent)`,
        border: cfg.solid ? "1px solid color-mix(in srgb, black 15%, transparent)" : `1px solid color-mix(in srgb, ${colorVar} 28%, transparent)`,
      }}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          cfg.livePulse && "live-pulse",
          cfg.pulse && "pulse-dot"
        )}
        style={{
          borderRadius: cfg.livePulse ? "50%" : undefined,
          width: cfg.livePulse ? "7px" : undefined,
          height: cfg.livePulse ? "7px" : undefined,
          background: cfg.livePulse ? (cfg.solid ? "#fff" : colorVar) : undefined,
        }}
      >
        {cfg.livePulse ? null : (
          <Icon className="w-3 h-3" strokeWidth={2.25} />
        )}
      </span>
      <span>{cfg.label}</span>
    </span>
  );
}
