import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "./ui/utils";

// Dropdown — the app's own styled picker, replacing native <select>/Radix
// Select wherever a compact trigger is involved. Radix Select's default
// position="popper" mode height-locks its Viewport to the trigger's own
// height (a real, reproducible bug — documented in CLAUDE.md), which clips
// a menu with more than a couple of items under a compact trigger to
// almost nothing. This is the same manually-built pattern already
// established in Analytics.jsx's class picker and CodeOutputPanel.jsx's
// dock picker (open/close state + outside-click ref + absolute menu) —
// extracted here as one shared component instead of re-implementing the
// same ~40 lines at every call site.
export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  menuClassName = "",
  icon: Icon,
  "aria-label": ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selected = options.find((opt) => String(opt.value) === String(value));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-bg-base border border-border text-sm text-text-primary hover:border-border-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-border",
          className
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-3.5 h-3.5 text-accent-info shrink-0" strokeWidth={1.75} />}
          <span className={cn("truncate", !selected && "text-text-muted")}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto bg-bg-elevated border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-modal)] z-50 py-1",
            menuClassName
          )}
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
                  isSelected
                    ? "text-accent-info font-semibold bg-accent-info/10"
                    : "text-text-primary hover:bg-bg-surface-3"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
