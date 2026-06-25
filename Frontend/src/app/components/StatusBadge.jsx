import { cn } from "../components/ui/utils";

const statusConfig = {
  live: {
    label: "LIVE",
    icon: "●",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
    livePulse: true,
  },
  active: {
    label: "ACTIVE",
    icon: "●",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.25)",
  },
  idle: {
    label: "NOT VIEWING",
    icon: "◌",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.25)",
    pulse: true,
  },
  offline: {
    label: "OFFLINE",
    icon: "—",
    color: "#8B8BA7",
    bg: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.08)",
  },
  submitted: {
    label: "SUBMITTED",
    icon: "✓",
    color: "#4F8EF7",
    bg: "rgba(79,142,247,0.12)",
    border: "rgba(79,142,247,0.25)",
  },
  "in-progress": {
    label: "IN PROGRESS",
    icon: "◎",
    color: "#4F8EF7",
    bg: "rgba(79,142,247,0.10)",
    border: "rgba(79,142,247,0.20)",
    pulse: true,
  },
  locked: {
    label: "LOCKED",
    icon: "⊘",
    color: "#A371F7",
    bg: "rgba(163,113,247,0.10)",
    border: "rgba(163,113,247,0.20)",
  },
  "exam-live": {
    label: "EXAM LIVE",
    icon: "▲",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.25)",
    livePulse: true,
  },
  absent: {
    label: "ABSENT",
    icon: "✕",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.20)",
  },
  present: {
    label: "PRESENT",
    icon: "✓",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.20)",
  },
  partial: {
    label: "PARTIAL",
    icon: "◐",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.20)",
  },
  pending: {
    label: "PENDING",
    icon: "⋯",
    color: "#8B8BA7",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
  },
  graded: {
    label: "GRADED",
    icon: "✓",
    color: "#4F8EF7",
    bg: "rgba(79,142,247,0.10)",
    border: "rgba(79,142,247,0.20)",
  },
  returned: {
    label: "RETURNED",
    icon: "↵",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.20)",
  },
};

export function StatusBadge({ status, className }) {
  const cfg = statusConfig[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono", className)}
      style={{
        padding: "3px 8px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderRadius: "6px",
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <span
        className={cn(cfg.livePulse && "live-pulse", cfg.pulse && "pulse-dot")}
        style={{
          display: "inline-block",
          fontSize: "9px",
          borderRadius: cfg.livePulse ? "50%" : undefined,
          width: cfg.livePulse ? "7px" : undefined,
          height: cfg.livePulse ? "7px" : undefined,
          background: cfg.livePulse ? cfg.color : undefined,
          flexShrink: 0,
        }}
      >
        {cfg.livePulse ? null : cfg.icon}
      </span>
      <span>{cfg.label}</span>
    </span>
  );
}
