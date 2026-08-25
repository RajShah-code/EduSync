import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent-500/15 text-accent-500 border border-accent-500/30",
        secondary:
          "bg-bg-surface-3 text-text-secondary border border-border",
        outline:
          "text-text-primary border border-border",
        success:
          "bg-accent-success/15 text-accent-success border border-accent-success/30",
        warning:
          "bg-accent-warning/15 text-accent-warning border border-accent-warning/30",
        destructive:
          "bg-accent-critical/15 text-accent-critical border border-accent-critical/30",
        solid:
          "bg-accent-700 text-white border border-transparent",
        solidSuccess:
          "bg-accent-success text-white border border-transparent",
        solidWarning:
          "bg-accent-warning text-black border border-transparent",
        solidCritical:
          "bg-accent-critical text-white border border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
