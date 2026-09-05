import { cn } from "./utils";

function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-[var(--radius-sm)]", className)}
      {...props}
    />
  );
}

export { Skeleton };
