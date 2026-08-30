import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconCalendarEvent as CalendarIcon,
  IconChevronDown as ChevronDown,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
} from "@tabler/icons-react";
import { cn } from "./utils";
import { Button } from "./button";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
// Defensive cap on one accumulated selection — there's only one exceptions
// endpoint (one POST per date), so an unbounded multi-month selection would
// mean an unbounded request burst. High enough to never get in a real
// teacher's way (a whole semester's worth of scattered leave days).
const MAX_SELECTED_DATES = 200;

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
function expandRange(fromStr, toStr) {
  const lo = fromStr < toStr ? fromStr : toStr;
  const hi = fromStr < toStr ? toStr : fromStr;
  const out = [];
  let cursor = fromISO(lo);
  const end = fromISO(hi);
  while (cursor <= end) {
    out.push(toISO(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
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

function formatMultiLabel(sortedISOs) {
  if (sortedISOs.length === 0) return "Select dates";
  if (sortedISOs.length === 1) return formatDisplayDate(sortedISOs[0], true);
  return `${sortedISOs.length} dates selected`;
}

/**
 * A compact trigger that opens a two-pane popover: quick forward-looking
 * presets (this tool marks upcoming holidays/leave, never past windows) on
 * the left, a real calendar on the right that supports two independent,
 * freely-combinable ways to build up one scattered selection:
 *
 *   - press-and-drag across days  → selects that whole contiguous run
 *   - a plain click (no movement) → toggles just that one day on/off
 *
 * Both accumulate into the same set, survive navigating to a different
 * month/year, and can be mixed in any order in one session — drag a week,
 * jump two months ahead, pick three lone days, drag another week. Nothing
 * here is a single from/to pair; `value`/`onChange` deal in a plain array
 * of ISO date strings.
 */
export function DateMultiPicker({ value, onChange, disabled = false, className }) {
  const [open, setOpen] = useState(false);
  const [draftDates, setDraftDates] = useState(() => new Set());
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Drag state — mouse-only (this app's primary target is desktop lab PCs).
  // dragMoved distinguishes "pressed and released on the same day" (a plain
  // toggle) from "pressed, moved to a different day, released" (a range
  // drag) — the two need different commit logic even though both start
  // with the same mousedown.
  const [dragAnchor, setDragAnchor] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [dragMoved, setDragMoved] = useState(false);
  const isDragging = dragAnchor !== null;

  const containerRef = useRef(null);
  const presets = useRef(buildPresets()).current;

  // Close on outside click / Escape — same pattern used elsewhere in this
  // app (e.g. the Dock dropdown in CodeOutputPanel.jsx).
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

  // Finalize a drag on mouseup anywhere in the document — not just inside
  // the grid — so releasing after the pointer wandered off a cell's exact
  // bounds still commits cleanly instead of leaving the drag stuck open.
  useEffect(() => {
    if (!isDragging) return;
    const finish = () => {
      setDraftDates((prev) => {
        const next = new Set(prev);
        if (dragMoved && dragAnchor && dragCurrent) {
          for (const iso of expandRange(dragAnchor, dragCurrent)) {
            if (next.size >= MAX_SELECTED_DATES) break;
            next.add(iso);
          }
        } else if (dragAnchor) {
          if (next.has(dragAnchor)) next.delete(dragAnchor);
          else if (next.size < MAX_SELECTED_DATES) next.add(dragAnchor);
        }
        return next;
      });
      setDragAnchor(null);
      setDragCurrent(null);
      setDragMoved(false);
    };
    document.addEventListener("mouseup", finish);
    return () => document.removeEventListener("mouseup", finish);
  }, [isDragging, dragAnchor, dragCurrent, dragMoved]);

  const openPicker = () => {
    if (disabled) return;
    const initial = new Set(value || []);
    setDraftDates(initial);
    const anchorDate = value && value.length > 0 ? fromISO([...initial].sort()[0]) : new Date();
    setViewMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
    setOpen(true);
  };

  const toggleSingleDate = (iso) => {
    setDraftDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else if (next.size < MAX_SELECTED_DATES) next.add(iso);
      return next;
    });
  };

  const handlePresetClick = (preset) => {
    const [f, t] = preset.range;
    setDraftDates((prev) => {
      const next = new Set(prev);
      for (const iso of expandRange(f, t)) {
        if (next.size >= MAX_SELECTED_DATES) break;
        next.add(iso);
      }
      return next;
    });
    setViewMonth(new Date(fromISO(f).getFullYear(), fromISO(f).getMonth(), 1));
  };

  const handleApply = () => {
    onChange([...draftDates].sort());
    setOpen(false);
  };
  const handleCancel = () => setOpen(false);
  const handleClear = () => {
    onChange([]);
    setOpen(false);
  };

  // Union of the committed draft + whatever the in-flight drag is about to
  // add — a plain click-in-progress just previews that one day.
  const previewSet = useMemo(() => {
    if (!isDragging) return draftDates;
    const next = new Set(draftDates);
    if (dragMoved && dragAnchor && dragCurrent) {
      for (const iso of expandRange(dragAnchor, dragCurrent)) next.add(iso);
    } else if (dragAnchor) {
      next.add(dragAnchor);
    }
    return next;
  }, [draftDates, isDragging, dragMoved, dragAnchor, dragCurrent]);

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const sortedValue = useMemo(() => [...(value || [])].sort(), [value]);
  const label = formatMultiLabel(sortedValue);

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
            sortedValue.length > 0 ? "text-text-primary font-medium" : "text-text-muted"
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
          className="absolute z-50 mt-2 left-0 flex flex-col sm:flex-row bg-bg-elevated border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-dropdown)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left select-none"
          style={{ width: "min(92vw, 480px)" }}
        >
          {/* Presets — forward-looking only; this tool marks upcoming
              holidays/leave, never a historical analytics window. Each one
              adds to the current selection rather than replacing it, so a
              preset combines freely with manual picks. */}
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
            <div className="flex items-center justify-between mb-1 px-0.5">
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

            {draftDates.size > 0 && (
              <p className="text-[10px] font-medium text-text-muted px-0.5 mb-1 tnum">
                {draftDates.size} date{draftDates.size === 1 ? "" : "s"} selected across all months
              </p>
            )}

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

            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((cell, i) => {
                const selected = previewSet.has(cell.iso);
                const rowStart = i - (i % 7);
                const isFirstInRow = i === rowStart;
                const isLastInRow = i === rowStart + 6;
                const prevSelected = !isFirstInRow && previewSet.has(cells[i - 1].iso);
                const nextSelected = !isLastInRow && previewSet.has(cells[i + 1].iso);
                const roundLeft = selected && (isFirstInRow || !prevSelected);
                const roundRight = selected && (isLastInRow || !nextSelected);
                const isLiveDragOnly = isDragging && selected && !draftDates.has(cell.iso);

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // no native text-drag ghosting
                      setDragAnchor(cell.iso);
                      setDragCurrent(cell.iso);
                      setDragMoved(false);
                    }}
                    onMouseEnter={() => {
                      if (!isDragging) return;
                      if (cell.iso !== dragAnchor) setDragMoved(true);
                      setDragCurrent(cell.iso);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSingleDate(cell.iso);
                      }
                    }}
                    aria-label={fromISO(cell.iso).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    aria-pressed={selected}
                    className={cn(
                      "relative h-8 flex items-center justify-center cursor-pointer",
                      selected && (isLiveDragOnly ? "bg-accent-info/15" : "bg-accent-info/20"),
                      roundLeft && "rounded-l-full",
                      roundRight && "rounded-r-full"
                    )}
                  >
                    {cell.isToday && !selected && (
                      <span
                        className="absolute inset-1 rounded-full border border-accent-info/50"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 w-7 h-7 flex items-center justify-center rounded-full text-[length:var(--text-xs)] tnum transition-[background-color,color,transform] duration-100",
                        !cell.inCurrentMonth && "text-text-muted/50",
                        cell.inCurrentMonth && !selected && "text-text-primary hover:bg-bg-surface-3",
                        selected && "bg-accent-info text-white font-semibold"
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
                  disabled={draftDates.size === 0}
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
