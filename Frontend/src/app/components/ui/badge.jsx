import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "./utils";

// F2's badge: a full pill, uppercase, semibold, tight tracking, tinted-wash
// tones. Variant names kept identical to F1's.
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] leading-none w-fit whitespace-nowrap shrink-0 " +
    "[&>svg]:size-3 [&>svg]:pointer-events-none overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-bg-surface-3 text-text-secondary",
        destructive: "bg-accent-critical/15 text-accent-critical",
        outline: "border border-border-hover text-text-secondary",
        info: "bg-accent-info/15 text-accent-info",
        success: "bg-accent-success/15 text-accent-success",
        warning: "bg-accent-warning/15 text-accent-warning",
        locked: "bg-accent-locked/15 text-accent-locked",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
