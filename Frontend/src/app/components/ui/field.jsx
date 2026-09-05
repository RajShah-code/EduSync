import { cn } from "./utils";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";

// Ported from frontend-teacher (F2): a label above, optional hint/error below.
export function Field({ label, hint, error, required, className, children }) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-text-secondary">
          {label}
          {required && <span className="text-accent-critical">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-accent-critical">{error}</span>}
    </label>
  );
}

// F2's flat-options Select: `options={[{ value, label }]}` instead of nested
// <SelectItem> children. Keeps `onChange({ target: { value } })` so plain
// input-style handlers work unchanged.
export function SimpleSelect({ value, onChange, onValueChange, options, placeholder, disabled, className }) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        onValueChange?.(v);
        onChange?.({ target: { value: v } });
      }}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(options || []).map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
