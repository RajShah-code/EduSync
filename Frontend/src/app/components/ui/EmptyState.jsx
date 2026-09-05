// Ported from frontend-teacher (F2). Kept token-for-token to F1's theme.
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border-hover px-6 py-14 text-center">
      {Icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-surface-3 text-text-muted">
          <Icon size={20} stroke={1.6} />
        </div>
      )}
      <div>
        <p className="font-display text-md font-medium text-text-primary">{title}</p>
        {description && <p className="mt-1 max-w-[34ch] text-sm text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageLoader({ label = "Loading" }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="text-sm font-medium tracking-wide">{label}…</span>
    </div>
  );
}
