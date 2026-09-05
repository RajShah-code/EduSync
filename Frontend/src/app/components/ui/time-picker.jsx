import { useEffect, useRef } from "react";
import { IconClock } from "@tabler/icons-react";
import { cn } from "./utils";
import { fieldClass } from "./input";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { formatClockString, getTimeFormat } from "../../utils/timeFormat";

// Ported from frontend-teacher (F2): a themed replacement for a native
// <input type="time"> — Hour/Minute steppers + an AM/PM toggle when the
// stored time-format preference is 12h. Value/onChange stay a 24-hour
// "HH:mm" string either way.
function pad2(n) {
  return String(n).padStart(2, "0");
}

function TimeUnitStepper({ label, value, min = 0, max, onChange }) {
  const span = max - min + 1;
  const step = (delta) => onChange(min + ((((value - min + delta) % span) + span) % span));

  const commit = (raw) => {
    const n = parseInt(String(raw).replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };

  const inputRef = useRef(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={pad2(value)}
        onChange={(e) => commit(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-1);
          }
        }}
        aria-label={`${label}, scroll or use up/down arrow keys to change`}
        className="h-9 w-11 cursor-ns-resize select-none rounded-[var(--radius-sm)] border border-border-hover bg-bg-base text-center text-sm font-semibold tnum text-text-primary outline-none focus:border-accent-500"
      />
    </div>
  );
}

export function TimePicker({ value, onChange, placeholder = "Select a time", className, disabled }) {
  const is12h = getTimeFormat() === "12h";
  const [h24, m] = value ? value.split(":").map(Number) : [9, 0];
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const commitHour24 = (nextH24) => onChange(`${pad2(nextH24)}:${pad2(m)}`);
  const commitMinute = (nextM) => onChange(`${pad2(h24)}:${pad2(nextM)}`);
  const commitHour12 = (nextH12) => {
    const clamped = nextH12 % 12;
    onChange(`${pad2(period === "PM" ? clamped + 12 : clamped)}:${pad2(m)}`);
  };
  const commitPeriod = (nextPeriod) => {
    const base = h24 % 12;
    onChange(`${pad2(nextPeriod === "PM" ? base + 12 : base)}:${pad2(m)}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            fieldClass,
            "flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={value ? "text-text-primary" : "text-text-muted"}>
            {value ? formatClockString(value) : placeholder}
          </span>
          <IconClock size={15} stroke={1.75} className="shrink-0 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto items-end justify-center gap-2 p-3">
        {is12h ? (
          <TimeUnitStepper label="Hour" value={h12} min={1} max={12} onChange={commitHour12} />
        ) : (
          <TimeUnitStepper label="Hour" value={h24} min={0} max={23} onChange={commitHour24} />
        )}
        <span className="pb-2 text-sm font-semibold text-text-muted">:</span>
        <TimeUnitStepper label="Min" value={m} min={0} max={59} onChange={commitMinute} />
        {is12h && (
          <div className="flex flex-col gap-1 pb-0.5">
            {["AM", "PM"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => commitPeriod(p)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2 py-1 text-[10.5px] font-semibold transition-colors",
                  period === p
                    ? "border-accent-500/60 bg-accent-500/12 text-accent-500"
                    : "border-border text-text-muted hover:border-border-hover",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
