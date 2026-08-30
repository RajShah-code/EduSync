import { useEffect, useRef, useState } from "react";
import {
  IconCalendarEvent as CalendarIcon,
  IconChevronDown as ChevronDown,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
} from "@tabler/icons-react";
import { cn } from "./utils";
import { Button } from "./button";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// ── Local-calendar date helpers ──────────────────────────────────────────
// Everything below works in local y/m/d components, never toISOString/UTC —
// a UTC round-trip can silently shift a picked day by one, which is exactly
// the class of bug that would make "the date I clicked" disagree with "the
// date that got submitted."
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const gridStart = addDays(first, -firstWeekday);
  const todayISO = toISO(new Date());

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = toISO(d);
    cells.push({
      iso,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month,
      isToday: iso === todayISO,
      colIndex: i % 7,
    });
  }
  // A month that starts on Monday never touches its 6th row — drop it
  // rather than showing a mostly-dead final row.
  if (cells.slice(35).every((c) => !c.inCurrentMonth)) cells.length = 35;
  return cells;
}

function buildPresets() {
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const todayISO = toISO(today);
  const dow = today.getDay(); // 0 Sun .. 6 Sat
  const endOfThisWeek = addDays(today, dow === 0 ? 6 : 6 - dow); // next/this Saturday
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  return [
    { label: "Today", range: [todayISO, todayISO] },
    { label: "Tomorrow", range: [toISO(addDays(today, 1)), toISO(addDays(today, 1))] },
    { label: "Rest of this week", range: [todayISO, toISO(endOfThisWeek)] },
    { label: "Next 7 days", range: [todayISO, toISO(addDays(today, 6))] },
    { label: "Rest of this month", range: [todayISO, toISO(endOfMonth)] },
    { label: "Next month", range: [toISO(nextMonthStart), toISO(nextMonthEnd)] },
  ];
}

function formatDisplayDate(iso, withYear) {
  const d = fromISO(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: withYear ? "numeric" : undefined });
}

function formatRangeLabel(fromStr, toStr) {
  if (!fromStr) return "Select dates";
  if (!toStr || toStr === fromStr) return formatDisplayDate(fromStr, true);
  const f = fromISO(fromStr);
  const t = fromISO(toStr);
  if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
    return `${f.getDate()} – ${t.getDate()} ${t.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  }
  if (f.getFullYear() === t.getFullYear()) {
    return `${formatDisplayDate(fromStr)} – ${formatDisplayDate(toStr, true)}`;
  }
  return `${formatDisplayDate(fromStr, true)} – ${formatDisplayDate(toStr, true)}`;
}

/**
 * A compact trigger that opens a two-pane popover: quick forward-looking
 * presets (this tool marks upcoming holidays/leave, never past windows) on
 * the left, a real click-to-pick range calendar on the right. Order of the
 * two clicks doesn't matter — picking an earlier date after a later one
 * just swaps them — and hovering after the first click live-previews the
 * range the second click would commit, the one deliberately hand-built
 * touch here (a static two-input pair can't do this).
 */
export function DateRangePicker({ value, onChange, disabled = false, className }) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [hoverISO, setHoverISO] = useState("");
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const containerRef = useRef(null);
  const presets = useRef(buildPresets()).current;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const openPicker = () => {
    if (disabled) return;
    setDraftFrom(value?.from || "");
    setDraftTo(value?.to || "");
    setHoverISO("");
    const anchor = value?.from ? fromISO(value.from) : new Date();
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    setOpen(true);
  };

  const handleDayClick = (iso) => {
    if (!draftFrom || draftTo) {
      setDraftFrom(iso);
      setDraftTo("");
      return;
    }
    if (iso === draftFrom) {
      setDraftTo(iso);
    } else if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
    } else {
      setDraftTo(iso);
    }
  };

  const handlePresetClick = (preset) => {
    const [f, t] = preset.range;
    setDraftFrom(f);
    setDraftTo(t);
    setHoverISO("");
    setViewMonth(new Date(fromISO(f).getFullYear(), fromISO(f).getMonth(), 1));
  };

  const handleApply = () => {
    if (!draftFrom) {
      setOpen(false);
      return;
    }
    onChange(draftFrom, draftTo || draftFrom);
    setOpen(false);
  };
  const handleCancel = () => setOpen(false);
  const handleClear = () => {
    onChange("", "");
    setOpen(false);
  };

  const getCellState = (cell) => {
    let lo = draftFrom;
    let hi = draftTo;
    let previewOnly = false;
    if (draftFrom && !draftTo) {
      previewOnly = true;
      if (hoverISO && hoverISO !== draftFrom) {
        lo = hoverISO < draftFrom ? hoverISO : draftFrom;
        hi = hoverISO < draftFrom ? draftFrom : hoverISO;
      } else {
        hi = draftFrom;
      }
    }
    const inRange = Boolean(lo && hi && cell.iso >= lo && cell.iso <= hi);
    const isEdge = cell.iso === lo || cell.iso === hi;
    return {
      inRange,
      selected: inRange && isEdge,
      previewOnly,
      roundLeft: inRange && (cell.iso === lo || cell.colIndex === 0),
      roundRight: inRange && (cell.iso === hi || cell.colIndex === 6),
    };
  };

  const cells = buildMonthGrid(viewMonth);
  const hasValue = Boolean(value?.from);
  const label = formatRangeLabel(value?.from, value?.to);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 h-9 w-full px-3 rounded-[var(--radius-md)] border bg-bg-base text-left transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          open
            ? "border-accent-info/60 ring-1 ring-accent-info/25"
            : "border-border hover:border-border-hover hover:bg-bg-surface-3",
          "focus-visible:outline-none focus-visible:border-accent-info focus-visible:ring-2 focus-visible:ring-accent-info/30"
        )}
      >
        <CalendarIcon className="w-4 h-4 text-accent-info shrink-0" />
        <span
          className={cn(
            "text-[length:var(--text-sm)] tnum truncate",
            hasValue ? "text-text-primary font-medium" : "text-text-muted"
          )}
        >
          {label}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-text-muted ml-auto shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select suppression dates"
          className="absolute z-50 mt-2 left-0 flex flex-col sm:flex-row bg-bg-elevated border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-dropdown)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left"
          style={{ width: "min(92vw, 480px)" }}
        >
          {/* Presets — forward-looking only; this tool marks upcoming
              holidays/leave, never a historical analytics window. */}
          <div className="flex sm:flex-col gap-1 p-2 sm:w-[140px] sm:shrink-0 border-b sm:border-b-0 sm:border-r border-border overflow-x-auto sm:overflow-visible">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePresetClick(p)}
                className="btn-press shrink-0 whitespace-nowrap text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[length:var(--text-xs)] font-medium text-text-secondary hover:bg-bg-surface-3 hover:text-text-primary transition-colors duration-150 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex-1 p-3 min-w-0">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <button
                type="button"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                aria-label="Previous month"
                className="btn-press w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-3 transition-colors duration-150 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[length:var(--text-sm)] font-semibold text-text-primary tnum">
                {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                aria-label="Next month"
                className="btn-press w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-3 transition-colors duration-150 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-[10px] font-semibold uppercase tracking-wider text-text-muted text-center py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHoverISO("")}>
              {cells.map((cell) => {
                const state = getCellState(cell);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onMouseEnter={() => setHoverISO(cell.iso)}
                    onClick={() => handleDayClick(cell.iso)}
                    aria-label={fromISO(cell.iso).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    aria-pressed={state.selected}
                    className={cn(
                      "relative h-8 flex items-center justify-center cursor-pointer",
                      state.inRange && (state.previewOnly ? "bg-accent-info/10" : "bg-accent-info/15"),
                      state.roundLeft && "rounded-l-full",
                      state.roundRight && "rounded-r-full"
                    )}
                  >
                    {cell.isToday && !state.selected && (
                      <span
                        className="absolute inset-1 rounded-full border border-accent-info/50"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 w-7 h-7 flex items-center justify-center rounded-full text-[length:var(--text-xs)] tnum transition-[background-color,color,transform] duration-150",
                        !cell.inCurrentMonth && "text-text-muted/50",
                        cell.inCurrentMonth && !state.selected && "text-text-primary hover:bg-bg-surface-3",
                        state.selected && "bg-accent-info text-white font-semibold"
                      )}
                    >
                      {cell.day}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleClear}
                className="btn-press text-[length:var(--text-xs)] font-medium text-text-muted hover:text-accent-critical transition-colors duration-150 cursor-pointer px-1"
              >
                Clear
              </button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="h-8 text-[length:var(--text-xs)] border-border text-text-secondary hover:bg-bg-surface-3"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  disabled={!draftFrom}
                  className="h-8 text-[length:var(--text-xs)] bg-accent-info hover:bg-accent-info/90 text-white transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
